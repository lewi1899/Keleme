import { requireAdmin } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/AdminPage";
import { RewardsManager } from "@/components/admin/RewardsManager";
import type { RewardCatalogItem, WeeklyRewardRun } from "@/lib/database.types";

export const metadata = { title: "Rewards" };
export const dynamic = "force-dynamic";

export interface WinnerRow {
  id: string;
  rank: number;
  seconds: number;
  status: string;
  claimed_at: string | null;
  admin_note: string | null;
  profiles: { full_name: string; phone: string; grade: number; school_name: string | null } | null;
  reward_catalog: { name: string; reward_type: string } | null;
}

export default async function AdminRewardsPage({ searchParams }: { searchParams: { run?: string } }) {
  await requireAdmin();
  const supabase = createSupabaseServerClient();

  const [{ data: catalog }, { data: slots }, { data: runs }] = await Promise.all([
    supabase.from("reward_catalog").select("*").order("sort_order"),
    supabase.from("weekly_reward_slots").select("rank, reward_id, is_active").order("rank"),
    supabase.from("weekly_reward_runs").select("*").order("week_start", { ascending: false }).limit(12),
  ]);

  const runList = (runs ?? []) as WeeklyRewardRun[];
  const selectedRun = searchParams.run ?? runList[0]?.id ?? null;

  const { data: winners } = selectedRun
    ? await supabase
        .from("weekly_reward_winners")
        .select("*, profiles(full_name, phone, grade, school_name), reward_catalog(name, reward_type)")
        .eq("run_id", selectedRun)
        .order("rank")
    : { data: [] };

  return (
    <>
      <AdminPageHeader
        title="Rewards"
        description="Weekly prizes for the students who study the most. Nothing is hard-coded — prizes, values and how many places are rewarded are all rows you control."
      />
      <RewardsManager
        catalog={(catalog ?? []) as RewardCatalogItem[]}
        slots={(slots ?? []) as { rank: number; reward_id: string; is_active: boolean }[]}
        runs={runList}
        selectedRun={selectedRun}
        winners={(winners ?? []) as WinnerRow[]}
      />
    </>
  );
}
