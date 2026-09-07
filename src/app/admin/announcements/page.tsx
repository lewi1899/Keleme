import { requireAdmin } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/AdminPage";
import { AnnouncementsManager } from "@/components/admin/AnnouncementsManager";
import type { Announcement } from "@/lib/database.types";

export const metadata = { title: "Announcements" };
export const dynamic = "force-dynamic";

export default async function AdminAnnouncementsPage() {
  await requireAdmin();
  const supabase = createSupabaseServerClient();

  const { data } = await supabase
    .from("announcements")
    .select("*")
    .order("starts_at", { ascending: false })
    .limit(50);

  return (
    <>
      <AdminPageHeader
        title="Announcements"
        description="Messages shown on every student's dashboard. Target one grade or everyone, and set an end date so an old notice removes itself."
      />
      <AnnouncementsManager announcements={(data ?? []) as Announcement[]} />
    </>
  );
}
