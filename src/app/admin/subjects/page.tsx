import { requireStaff } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/AdminPage";
import { SubjectsManager } from "@/components/admin/SubjectsManager";
import type { Subject, Unit } from "@/lib/database.types";

export const metadata = { title: "Subjects & units" };
export const dynamic = "force-dynamic";

export default async function AdminSubjectsPage({
  searchParams,
}: {
  searchParams: { grade?: string };
}) {
  await requireStaff();
  const supabase = createSupabaseServerClient();

  const grade = [9, 10, 11, 12].includes(Number(searchParams.grade)) ? Number(searchParams.grade) : 9;

  const [{ data: subjects }, { data: units }] = await Promise.all([
    supabase.from("subjects").select("*, content_items(count)").eq("grade", grade).order("sort_order"),
    supabase.from("units").select("*").order("sort_order"),
  ]);

  return (
    <>
      <AdminPageHeader
        title="Subjects & units"
        description="The structure students browse. Each subject belongs to one grade; units are the chapters inside it."
      />
      <SubjectsManager
        grade={grade}
        subjects={(subjects ?? []) as (Subject & { content_items: { count: number }[] })[]}
        units={(units ?? []) as Unit[]}
      />
    </>
  );
}
