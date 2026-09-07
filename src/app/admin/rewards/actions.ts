"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface RewardActionState {
  ok?: boolean;
  error?: string;
  runId?: string;
}

/**
 * Snapshots the week that just ended into a draft run.
 *
 * Deliberately a two-step flow — compute, then publish. Computing produces a
 * ranking an admin can inspect for abuse before any prize is real; publishing
 * is what actually grants entitlements. Fusing them would mean a bot week
 * pays out before anyone looks at it.
 */
export async function computeWeekAction(weekStart?: string): Promise<RewardActionState> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc("compute_weekly_rewards", {
    p_week_start: weekStart || null,
  });

  if (error) {
    return {
      error: error.message.includes("week_already_published")
        ? "That week has already been published and cannot be recalculated."
        : "Could not calculate the weekly ranking.",
    };
  }

  revalidatePath("/admin/rewards");
  return { ok: true, runId: data as string };
}

export async function publishWeekAction(runId: string): Promise<RewardActionState> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.rpc("publish_weekly_rewards", { p_run_id: runId });
  if (error) return { error: "Could not publish that week." };

  revalidatePath("/admin/rewards");
  revalidatePath("/leaderboard");
  return { ok: true };
}

export async function saveRewardAction(
  _prev: RewardActionState,
  formData: FormData
): Promise<RewardActionState> {
  const id = (formData.get("id") as string) || null;
  const name = String(formData.get("name") ?? "").trim();
  const rewardType = String(formData.get("rewardType") ?? "premium_days");
  const rewardDays = Number(formData.get("rewardDays")) || null;

  if (!name) return { error: "Give the prize a name." };
  if ((rewardType === "premium_days" || rewardType === "matric_days") && !rewardDays) {
    return { error: "A subscription prize needs a number of days." };
  }

  const supabase = createSupabaseServerClient();
  const row = {
    name,
    description: (formData.get("description") as string) || null,
    reward_type: rewardType,
    reward_days: rewardDays,
    value_birr: Number(formData.get("valueBirr")) || null,
    is_active: formData.get("isActive") === "on",
    sort_order: Number(formData.get("sortOrder")) || 0,
  };

  const { error } = id
    ? await supabase.from("reward_catalog").update(row).eq("id", id)
    : await supabase.from("reward_catalog").insert(row);

  if (error) return { error: "Could not save that prize." };

  await supabase.rpc("write_audit_log", {
    p_action: id ? "reward.updated" : "reward.created",
    p_target_table: "reward_catalog",
    p_target_id: id,
    p_metadata: { name, type: rewardType },
  });

  revalidatePath("/admin/rewards");
  return { ok: true };
}

export async function setSlotRewardAction(rank: number, rewardId: string): Promise<RewardActionState> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("weekly_reward_slots")
    .upsert({ rank, reward_id: rewardId, is_active: true }, { onConflict: "rank" });

  if (error) return { error: "Could not assign that prize." };
  revalidatePath("/admin/rewards");
  return { ok: true };
}

export async function markWinnerClaimedAction(winnerId: string, note?: string): Promise<RewardActionState> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("weekly_reward_winners")
    .update({ status: "claimed", claimed_at: new Date().toISOString(), admin_note: note ?? null })
    .eq("id", winnerId);

  if (error) return { error: "Could not update that winner." };
  revalidatePath("/admin/rewards");
  return { ok: true };
}
