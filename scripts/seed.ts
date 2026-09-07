/**
 * KELEME — administrator seeding
 *
 *   npm run seed
 *
 * Creates (or repairs) the initial administrator accounts. Everything else the
 * platform needs on day one — plans, prices, referral tiers, prize slots,
 * support contacts, subjects, matric years — is seeded by migration
 * 0009_seed_reference.sql, because it needs no auth user and should travel
 * with the schema.
 *
 * Administrators cannot be created in SQL: they need rows in `auth.users`,
 * which only the service role can write. Hence this script.
 *
 * It is idempotent. Run it as many times as you like: an account that already
 * exists is promoted rather than duplicated, and an existing password is never
 * overwritten.
 *
 * SECURITY: this uses the service-role key, which bypasses every RLS policy.
 * Run it from a trusted machine, never from a browser or a CI job that echoes
 * its environment.
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.KELEME_ADMIN_PASSWORD;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  console.error("Copy .env.example to .env.local and fill both in, then run again.");
  process.exit(1);
}

if (!password || password === "change-me-before-seeding") {
  console.error("Set KELEME_ADMIN_PASSWORD in .env.local to a strong value before seeding.");
  console.error("Each administrator should change their own password after the first sign-in.");
  process.exit(1);
}

if (password.length < 12) {
  console.error("KELEME_ADMIN_PASSWORD must be at least 12 characters.");
  process.exit(1);
}

/**
 * The three initial administrators.
 *
 * Emails and phone numbers are overridable per person, because these are real
 * accounts belonging to real people and the defaults below are only a starting
 * point. The phone numbers in particular MUST be replaced with the real ones —
 * they are unique-indexed, so a placeholder left in place blocks that person
 * from ever registering with their actual number.
 */
const ADMINS = [
  {
    key: "LEWI",
    fullName: "Lewi Wondimu",
    email: process.env.KELEME_ADMIN_LEWI_EMAIL ?? "lewiterefe@gmail.com",
    phone: process.env.KELEME_ADMIN_LEWI_PHONE ?? "0911000001",
  },
  {
    key: "FAHMI",
    fullName: "Fahmi Hassen",
    email: process.env.KELEME_ADMIN_FAHMI_EMAIL ?? "keleme2026@gmail.com",
    phone: process.env.KELEME_ADMIN_FAHMI_PHONE ?? "0911000002",
  },
  {
    key: "DAWIT",
    fullName: "Dawit Semere",
    email: process.env.KELEME_ADMIN_DAWIT_EMAIL ?? "dsemere737@gmail.com",
    phone: process.env.KELEME_ADMIN_DAWIT_PHONE ?? "0911000003",
  },
];

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Mirrors public.normalize_et_phone so a bad default fails here, loudly. */
function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/[^0-9]/g, "");
  if (digits.length === 12 && digits.startsWith("251")) digits = digits.slice(3);
  else if (digits.length === 10 && digits.startsWith("0")) digits = digits.slice(1);
  else if (digits.length !== 9) return null;
  return /^[97][0-9]{8}$/.test(digits) ? `+251${digits}` : null;
}

async function findUserByEmail(email: string): Promise<string | null> {
  // listUsers is paged; the admin API has no direct get-by-email, so walk until
  // found. Fine at the scale this runs at (a handful of accounts).
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (match) return match.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function main() {
  console.log("KELEME — seeding administrators\n");

  // Fail before creating anything if a phone number is unusable.
  for (const admin of ADMINS) {
    if (!normalizePhone(admin.phone)) {
      console.error(`✗ ${admin.fullName}: "${admin.phone}" is not a valid Ethiopian mobile number.`);
      console.error(`  Set KELEME_ADMIN_${admin.key}_PHONE to their real number and run again.`);
      process.exit(1);
    }
  }

  let created = 0;
  let promoted = 0;

  for (const admin of ADMINS) {
    const existingId = await findUserByEmail(admin.email);
    let userId = existingId;

    if (!userId) {
      const { data, error } = await supabase.auth.admin.createUser({
        email: admin.email,
        password,
        // Confirmed up front: these three need to sign in immediately, and
        // there is no inbox to check on a fresh project.
        email_confirm: true,
        user_metadata: {
          full_name: admin.fullName,
          phone: admin.phone,
          grade: "12",
          school_name: "KELEME",
        },
      });

      if (error) {
        console.error(`✗ ${admin.fullName} (${admin.email}): ${error.message}`);
        if (error.message.includes("phone")) {
          console.error("  That phone number is already registered to another account.");
        }
        continue;
      }

      userId = data.user.id;
      created++;
      console.log(`✓ Created ${admin.fullName} <${admin.email}>`);
    } else {
      console.log(`· ${admin.fullName} <${admin.email}> already exists — password unchanged`);
    }

    // The auth trigger always creates profiles as students, deliberately (it is
    // the boundary against a forged signup claiming role: admin). Promotion is
    // therefore always a separate, explicit step.
    const { error: roleError } = await supabase
      .from("profiles")
      .update({ role: "admin" })
      .eq("id", userId);

    if (roleError) {
      console.error(`  ✗ Could not promote ${admin.fullName}: ${roleError.message}`);
    } else {
      promoted++;
    }
  }

  const { count } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin");

  console.log(`\n${created} created, ${promoted} promoted. ${count ?? 0} administrator(s) total.`);

  if (created > 0) {
    console.log("\nNext steps:");
    console.log("  1. Each administrator signs in and changes their password immediately.");
    console.log("  2. Replace the placeholder phone numbers in Admin → Students with real ones.");
    console.log("  3. Check Admin → Contacts and Admin → Plans before announcing the launch.");
  }
}

main().catch((error) => {
  console.error("\nSeeding failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
