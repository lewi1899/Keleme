"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { profileUpdateSchema, firstError } from "@/lib/validation";

export interface SettingsState {
  ok?: boolean;
  error?: string;
}

/**
 * Updates the fields a student owns.
 *
 * Note what is not here: role, grade, streak, total time, entitlements. The
 * update is sent through the ordinary anon client, so the profiles WITH CHECK
 * policy is what actually stops those being written — this action does not get
 * to decide, it simply cannot smuggle them through.
 */
export async function updateProfileAction(
  _prev: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const parsed = profileUpdateSchema.safeParse({
    displayName: formData.get("displayName"),
    leaderboardOptIn: formData.get("leaderboardOptIn") === "on",
    schoolName: formData.get("schoolName") || undefined,
  });

  if (!parsed.success) {
    return { error: firstError(parsed.error) };
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Please sign in again." };

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: parsed.data.displayName ?? null,
      leaderboard_opt_in: parsed.data.leaderboardOptIn,
      ...(parsed.data.schoolName ? { school_name: parsed.data.schoolName } : {}),
    })
    .eq("id", user.id);

  if (error) {
    return { error: "We could not save your changes. Please try again." };
  }

  revalidatePath("/settings");
  revalidatePath("/leaderboard");
  return { ok: true };
}

/**
 * Revokes every device session except the one making the request, then leaves
 * the caller signed in. Useful when a student suspects someone else has their
 * password — combined with the single-session rule it locks everyone else out
 * immediately.
 */
export async function signOutOtherDevicesAction(): Promise<SettingsState> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.rpc("sign_out_other_devices");
  if (error) return { error: "We could not sign out your other devices." };
  revalidatePath("/settings");
  return { ok: true };
}
