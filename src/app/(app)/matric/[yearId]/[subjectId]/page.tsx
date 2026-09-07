import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MatricRunner } from "@/components/matric/MatricRunner";
import type { MatricQuestionForStudent } from "@/lib/database.types";

export const dynamic = "force-dynamic";

export default async function MatricPracticePage({
  params,
}: {
  params: { yearId: string; subjectId: string };
}) {
  const session = await requireUser();
  if (session.profile.grade !== 12) redirect("/dashboard");

  const supabase = createSupabaseServerClient();

  const [{ data: year }, { data: subject }, { data: questions }] = await Promise.all([
    supabase.from("matric_years").select("id, year, label").eq("id", params.yearId).maybeSingle(),
    supabase.from("subjects").select("id, name").eq("id", params.subjectId).maybeSingle(),
    supabase.rpc("get_matric_questions", {
      p_year_id: params.yearId,
      p_subject_id: params.subjectId,
      p_limit: 100,
      p_offset: 0,
    }),
  ]);

  if (!year || !subject) notFound();

  return (
    <MatricRunner
      yearId={params.yearId}
      subjectId={params.subjectId}
      yearLabel={year.label as string}
      subjectName={subject.name as string}
      questions={(questions ?? []) as MatricQuestionForStudent[]}
      hasMatricAccess={session.is_matric}
    />
  );
}
