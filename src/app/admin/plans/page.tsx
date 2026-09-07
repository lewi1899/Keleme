import { requireAdmin } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/AdminPage";
import { PlansManager } from "@/components/admin/PlansManager";
import type { Plan } from "@/lib/database.types";

export const metadata = { title: "Plans & pricing" };
export const dynamic = "force-dynamic";

export default async function AdminPlansPage() {
  await requireAdmin();
  const supabase = createSupabaseServerClient();

  const { data } = await supabase.from("plans").select("*").order("kind").order("sort_order");

  return (
    <>
      <AdminPageHeader
        title="Plans & pricing"
        description="Prices, durations and ad levels are stored in the database, not in code. Changes take effect immediately for every student."
      />
      <PlansManager plans={(data ?? []) as Plan[]} />
    </>
  );
}
