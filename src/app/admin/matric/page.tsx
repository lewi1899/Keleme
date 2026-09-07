import { requireStaff } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/AdminPage";
import { MatricManager } from "@/components/admin/MatricManager";
import type { MatricQuestion, MatricYear, Subject } from "@/lib/database.types";

export const metadata = { title: "Matric questions" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export interface AdminMatricQuestion extends MatricQuestion {
  matric_years: { label: string } | null;
  subjects: { name: string } | null;
  matric_question_options: { id: string; label: string; body_html: string; is_correct: boolean }[];
}

export default async function AdminMatricPage({
  searchParams,
}: {
  searchParams: { year?: string; subject?: string; page?: string };
}) {
  await requireStaff();
  const supabase = createSupabaseServerClient();

  const page = Math.max(1, Number(searchParams.page) || 1);
  const from = (page - 1) * PAGE_SIZE;

  let questionQuery = supabase
    .from("matric_questions")
    .select(
      "*, matric_years(label), subjects(name), matric_question_options(id, label, body_html, is_correct)",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  if (searchParams.year) questionQuery = questionQuery.eq("year_id", searchParams.year);
  if (searchParams.subject) questionQuery = questionQuery.eq("subject_id", searchParams.subject);

  const [{ data: years }, { data: subjects }, { data: questions, count }] = await Promise.all([
    supabase.from("matric_years").select("*").order("year", { ascending: false }),
    // Matric is a Grade 12 product, so only Grade 12 subjects can carry a
    // matric question.
    supabase.from("subjects").select("*").eq("grade", 12).eq("is_active", true).order("name"),
    questionQuery,
  ]);

  return (
    <>
      <AdminPageHeader
        title="Matric questions"
        description="Past matric and model papers, by year and subject. Students never receive the answer key — it is stripped server-side before questions are sent."
      />
      <MatricManager
        years={(years ?? []) as MatricYear[]}
        subjects={(subjects ?? []) as Subject[]}
        questions={(questions ?? []) as AdminMatricQuestion[]}
        total={count ?? 0}
        page={page}
        pageSize={PAGE_SIZE}
        filters={{ year: searchParams.year ?? "", subject: searchParams.subject ?? "" }}
      />
    </>
  );
}
