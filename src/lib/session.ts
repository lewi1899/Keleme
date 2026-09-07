import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes } from "node:crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AdLevel, Profile } from "@/lib/database.types";

/**
 * The cookie holds a random token; the database stores only its SHA-256 hash.
 * So even a database dump — or an admin reading user_sessions — cannot be
 * replayed to impersonate a student.
 */
export const DEVICE_COOKIE = "keleme_device";

export function createDeviceToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashDeviceToken(token) };
}

export function hashDeviceToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface SessionContext {
  device_valid: boolean;
  profile: (Omit<Profile, "phone"> & { phone_masked: string | null }) | null;
  is_premium: boolean;
  is_matric: boolean;
  premium_until: string | null;
  matric_until: string | null;
  ad_level: AdLevel;
  today_seconds: number;
  unread_announcements: number;
}

/**
 * Profile, entitlements, ad level and device-session validity in one round
 * trip, memoised per request. `cache()` means a layout and three nested server
 * components asking for the session make one database call between them, not
 * four — which is the difference between a snappy page and a slow one on a
 * mobile connection.
 */
export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const token = cookies().get(DEVICE_COOKIE)?.value;
  const { data, error } = await supabase.rpc("get_session_context", {
    p_token_hash: token ? hashDeviceToken(token) : null,
  });

  if (error || !data) return null;
  return data as SessionContext;
});

/**
 * Gate for every authenticated page.
 *
 * Three distinct failure modes, each with its own destination, because
 * lumping them together produces a baffling experience: no session at all is a
 * plain sign-in; a revoked device means the account was used somewhere else
 * and the student needs to be told that; a suspended account needs an
 * explanation rather than a login loop.
 */
export async function requireUser(): Promise<SessionContext & { profile: NonNullable<SessionContext["profile"]> }> {
  const context = await getSessionContext();

  if (!context || !context.profile) {
    redirect("/login");
  }
  if (!context.device_valid) {
    redirect("/login?reason=signed-in-elsewhere");
  }
  if (context.profile.is_suspended) {
    redirect("/suspended");
  }
  if (context.profile.deactivated_at) {
    redirect("/login?reason=deactivated");
  }

  return context as SessionContext & { profile: NonNullable<SessionContext["profile"]> };
}

/** Content editors and admins. Catalogue management, but not people or money. */
export async function requireStaff() {
  const context = await requireUser();
  if (context.profile.role !== "admin" && context.profile.role !== "content_editor") {
    redirect("/dashboard");
  }
  return context;
}

/** Admins only: users, pricing, rewards, settings, audit. */
export async function requireAdmin() {
  const context = await requireUser();
  if (context.profile.role !== "admin") {
    redirect("/dashboard");
  }
  return context;
}

// The pure grade rules live in `@/lib/grades` so client components can import
// them without pulling in this server-only module, and so they can be unit
// tested. Re-exported here because most callers already have the session.
export { gradeCanAccess, accessibleGrades } from "@/lib/grades";
