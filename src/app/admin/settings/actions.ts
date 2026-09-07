"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface SettingsActionState {
  ok?: boolean;
  error?: string;
}

/**
 * Every setting is written through admin_set_setting, which checks is_admin()
 * and writes an audit entry. The value is sent as JSON because the column is
 * JSONB — a setting that is a number today can become an object tomorrow
 * without a migration.
 */
export async function updateSettingsAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  const supabase = createSupabaseServerClient();

  const numeric: Record<string, { min: number; max: number; label: string }> = {
    streak_min_seconds: { min: 60, max: 7200, label: "Streak minimum study time" },
    streak_min_questions: { min: 1, max: 100, label: "Streak minimum questions" },
    heartbeat_cap_seconds: { min: 30, max: 600, label: "Heartbeat cap" },
    daily_seconds_cap: { min: 3600, max: 86400, label: "Daily time cap" },
    session_idle_timeout_seconds: { min: 60, max: 3600, label: "Idle timeout" },
    weekly_reward_winner_count: { min: 1, max: 100, label: "Weekly winners" },
    referral_burst_limit_per_hour: { min: 1, max: 100, label: "Referral burst limit" },
    signed_url_ttl_seconds: { min: 60, max: 3600, label: "Download link lifetime" },
  };

  for (const [key, bounds] of Object.entries(numeric)) {
    const raw = formData.get(key);
    if (raw === null) continue;

    const value = Number(raw);
    if (!Number.isFinite(value) || value < bounds.min || value > bounds.max) {
      return { error: `${bounds.label} must be between ${bounds.min} and ${bounds.max}.` };
    }

    const { error } = await supabase.rpc("admin_set_setting", {
      p_key: key,
      p_value: value,
      p_description: null,
    });
    if (error) return { error: "Could not save settings. Are you an administrator?" };
  }

  const booleans = ["leaderboard_enabled", "registration_open"];
  for (const key of booleans) {
    const { error } = await supabase.rpc("admin_set_setting", {
      p_key: key,
      p_value: formData.get(key) === "on",
      p_description: null,
    });
    if (error) return { error: "Could not save settings." };
  }

  const adLevel = String(formData.get("free_tier_ad_level") ?? "high");
  if (["none", "low", "medium", "high"].includes(adLevel)) {
    await supabase.rpc("admin_set_setting", {
      p_key: "free_tier_ad_level",
      p_value: adLevel,
      p_description: null,
    });
  }

  revalidatePath("/admin/settings");
  return { ok: true };
}
