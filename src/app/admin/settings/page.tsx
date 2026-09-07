import { requireAdmin } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/AdminPage";
import { SettingsPanel } from "@/components/admin/SettingsPanel";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  await requireAdmin();
  const supabase = createSupabaseServerClient();

  const { data } = await supabase.from("app_settings").select("key, value, description");

  const settings: Record<string, unknown> = {};
  for (const row of data ?? []) settings[row.key as string] = row.value;

  return (
    <>
      <AdminPageHeader
        title="Settings"
        description="Platform rules that change behaviour immediately for every student. Each one is a database row, not a code constant."
      />
      <SettingsPanel settings={settings} />
    </>
  );
}
