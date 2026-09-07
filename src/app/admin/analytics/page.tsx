import { requireStaff } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/AdminPage";
import { AnalyticsCharts } from "@/components/admin/AnalyticsCharts";

export const metadata = { title: "Analytics" };
export const dynamic = "force-dynamic";

export interface ActivityPoint {
  day: string;
  seconds: number;
  learners: number;
}

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: { days?: string };
}) {
  await requireStaff();
  const supabase = createSupabaseServerClient();

  const days = [7, 30, 90].includes(Number(searchParams.days)) ? Number(searchParams.days) : 30;

  const [{ data: series }, { data: metrics }] = await Promise.all([
    supabase.rpc("admin_activity_series", { p_days: days }),
    supabase.rpc("admin_dashboard_metrics"),
  ]);

  const gradeDistribution = ((metrics as { grade_distribution?: Record<string, number> } | null)
    ?.grade_distribution ?? {}) as Record<string, number>;

  return (
    <>
      <AdminPageHeader
        title="Analytics"
        description="How much studying is actually happening, and who is doing it."
      />
      <AnalyticsCharts
        series={(series ?? []) as ActivityPoint[]}
        gradeDistribution={gradeDistribution}
        days={days}
      />
    </>
  );
}
