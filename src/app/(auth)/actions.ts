"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createDeviceToken, hashDeviceToken, DEVICE_COOKIE } from "@/lib/session";
import { firstError, loginSchema, registrationSchema } from "@/lib/validation";

export interface AuthState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

/** Path allow-listing for the `next` parameter, so a crafted link cannot use
 *  the sign-in redirect as an open redirect to an external site. */
function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/dashboard";
  return next;
}

const DEVICE_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 90,
};

/**
 * Registers the device with the database and drops the token cookie.
 *
 * Shared by sign-in and sign-up because both must do exactly this, and a
 * divergence between them would mean an account created on one device is not
 * subject to the single-session rule until its next sign-in.
 */
async function establishDeviceSession(supabase: ReturnType<typeof createSupabaseServerClient>) {
  const { token, hash } = createDeviceToken();
  const userAgent = headers().get("user-agent") ?? undefined;

  const { error } = await supabase.rpc("on_sign_in", {
    p_token_hash: hash,
    p_user_agent: userAgent,
    p_device_label: null,
  });

  if (error) {
    if (error.message.includes("account_suspended")) {
      await supabase.auth.signOut();
      return { error: "This account has been suspended. Please contact KELEME support." };
    }
    return { error: "We could not start your session. Please try again." };
  }

  cookies().set(DEVICE_COOKIE, token, DEVICE_COOKIE_OPTIONS);
  return {};
}

export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: firstError(parsed.error) };
  }

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    // Deliberately identical for "no such user" and "wrong password": telling
    // the difference lets anyone test whether an email has a KELEME account.
    return { error: "That email and password don't match. Please try again." };
  }

  const device = await establishDeviceSession(supabase);
  if (device.error) return device;

  redirect(safeNext(formData.get("next") as string | null));
}

export async function registerAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = registrationSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    grade: formData.get("grade"),
    schoolName: formData.get("schoolName"),
    password: formData.get("password"),
    referralCode: formData.get("referralCode"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.errors) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { error: firstError(parsed.error), fieldErrors };
  }

  const values = parsed.data;
  const admin = createAdminClient();

  const { data: openSetting } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", "registration_open")
    .maybeSingle();

  if (openSetting && openSetting.value === false) {
    return { error: "Registration is temporarily closed. Please try again later." };
  }

  // The unique index on profiles.phone is the real guarantee, but it surfaces
  // as an opaque trigger failure from GoTrue. Checking first lets us point at
  // the actual field. Race conditions still land on the index, which is fine.
  const { data: existingPhone } = await admin
    .from("profiles")
    .select("id")
    .eq("phone", values.phone)
    .maybeSingle();

  if (existingPhone) {
    return {
      error: "That phone number is already registered.",
      fieldErrors: { phone: "This number already has a KELEME account. Try signing in." },
    };
  }

  const supabase = createSupabaseServerClient();

  // Phone, grade and school travel with the sign-up call, so the account and a
  // complete profile are created in one transaction by the auth.users trigger.
  // There is no window in which an account exists without a phone number
  // (spec section 6).
  const { data, error } = await supabase.auth.signUp({
    email: values.email,
    password: values.password,
    options: {
      data: {
        full_name: values.fullName,
        phone: values.phone,
        grade: String(values.grade),
        school_name: values.schoolName,
        referral_code: values.referralCode ?? null,
      },
    },
  });

  if (error) {
    if (/already registered|already exists/i.test(error.message)) {
      return {
        error: "That email already has an account.",
        fieldErrors: { email: "This email is already registered. Try signing in instead." },
      };
    }
    if (/registration_phone_invalid/.test(error.message)) {
      return { error: "That phone number is not valid.", fieldErrors: { phone: "Enter a valid Ethiopian mobile number." } };
    }
    if (/registration_grade_invalid/.test(error.message)) {
      return { error: "Choose a grade between 9 and 12.", fieldErrors: { grade: "Choose a grade between 9 and 12." } };
    }
    return { error: "We could not create your account. Please try again." };
  }

  // When email confirmation is switched on in the Supabase dashboard, signUp
  // returns a user but no session. The account exists and the referral stays
  // pending until they confirm and sign in.
  if (!data.session) {
    redirect("/login?reason=check-email");
  }

  const device = await establishDeviceSession(supabase);
  if (device.error) return device;

  redirect("/dashboard?welcome=1");
}

export async function logoutAction() {
  const supabase = createSupabaseServerClient();
  const token = cookies().get(DEVICE_COOKIE)?.value;

  if (token) {
    // Revoke our device row before dropping the Supabase session, so the study
    // session is closed and the row cannot linger as "active" forever.
    await supabase.rpc("end_device_session", { p_token_hash: hashDeviceToken(token) });
  }

  await supabase.auth.signOut();
  cookies().delete(DEVICE_COOKIE);
  redirect("/login");
}
