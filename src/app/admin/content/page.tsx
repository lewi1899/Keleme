import { requireStaff } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/AdminPage";
import { ContentManager } from "@/components/admin/ContentManager";
import type { ContentItem, Subject, Unit } from "@/lib/database.types";

export const metadata = { title: "Content" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

export default async function AdminContentPage({
  searchParams,
}: {
  searchParams: { page?: string; grade?: string; type?: string; q?: string; tier?: string };
}) {
  await requireStaff();
  const supabase = createSupabaseServerClient();

  const page = Math.max(1, Number(searchParams.page) || 1);
  const from = (page - 1) * PAGE_SIZE;

  let query = supabase
    .from("content_items")
    .select("*, subjects(name)", { count: "exact" })
    .order("updated_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  if (searchParams.grade) query = query.eq("grade", Number(searchParams.grade));
  if (searchParams.type) query = query.eq("content_type", searchParams.type);
  if (searchParams.tier) query = query.eq("access_tier", searchParams.tier);
  if (searchParams.q?.trim()) query = query.ilike("title", `%${searchParams.q.trim()}%`);

  const [{ data: items, count }, { data: subjects }, { data: units }] = await Promise.all([
    query,
    supabase.from("subjects").select("*").eq("is_active", true).order("grade").order("sort_order"),
    supabase.from("units").select("*").eq("is_active", true).order("sort_order"),
  ]);

  return (
    <>
      <AdminPageHeader
        title="Content"
        description="Study notes, textbooks, videos and links. Every item is filed by grade, subject and unit, and marked Free or Premium."
      />

      <ContentManager
        items={(items ?? []) as (ContentItem & { subjects: { name: string } | null })[]}
        subjects={(subjects ?? []) as Subject[]}
        units={(units ?? []) as Unit[]}
        total={count ?? 0}
        page={page}
        pageSize={PAGE_SIZE}
        filters={{
          grade: searchParams.grade ?? "",
          type: searchParams.type ?? "",
          tier: searchParams.tier ?? "",
          q: searchParams.q ?? "",
        }}
      />
    </>
  );
}
