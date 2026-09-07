"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { matricQuestionSchema, firstError } from "@/lib/validation";
import { prepareContentHtml } from "@/lib/sanitize";

export interface MatricActionState {
  ok?: boolean;
  error?: string;
}

export async function saveYearAction(
  _prev: MatricActionState,
  formData: FormData
): Promise<MatricActionState> {
  const id = (formData.get("id") as string) || null;
  const year = Number(formData.get("year"));
  const label = String(formData.get("label") ?? "").trim();

  if (!Number.isInteger(year) || year < 1990 || year > 2100) {
    return { error: "Enter a valid year." };
  }
  if (!label) return { error: "Give the year a label, e.g. “2016 E.C.”" };

  const supabase = createSupabaseServerClient();
  const row = {
    year,
    label,
    description: (formData.get("description") as string) || null,
    is_active: formData.get("isActive") === "on",
    sort_order: Number(formData.get("sortOrder")) || 0,
  };

  const { error } = id
    ? await supabase.from("matric_years").update(row).eq("id", id)
    : await supabase.from("matric_years").insert(row);

  if (error) {
    return {
      error: error.message.includes("matric_years_year_key")
        ? "That year already exists."
        : "Could not save that year.",
    };
  }

  revalidatePath("/admin/matric");
  return { ok: true };
}

export async function deleteYearAction(id: string): Promise<MatricActionState> {
  const supabase = createSupabaseServerClient();

  // Questions cascade from the year, so a delete here would silently destroy
  // a whole paper. Refuse and make the admin deal with the questions first.
  const { count } = await supabase
    .from("matric_questions")
    .select("id", { count: "exact", head: true })
    .eq("year_id", id);

  if ((count ?? 0) > 0) {
    return {
      error: `This year still has ${count} question${count === 1 ? "" : "s"}, which would be deleted with it. Turn the year off instead, or remove the questions first.`,
    };
  }

  const { error } = await supabase.from("matric_years").delete().eq("id", id);
  if (error) return { error: "Could not delete that year." };

  revalidatePath("/admin/matric");
  return { ok: true };
}

/**
 * Saves a question and its options together.
 *
 * Order matters: the question is written unpublished first, then the options
 * are replaced, and only then is `is_published` set. The publish-time trigger
 * refuses a question that does not have exactly one correct option, so doing
 * it in this order means a half-saved edit can never reach students as an
 * ungradeable question.
 */
export async function saveQuestionAction(
  _prev: MatricActionState,
  formData: FormData
): Promise<MatricActionState> {
  const id = (formData.get("id") as string) || null;

  let options: unknown;
  try {
    options = JSON.parse(String(formData.get("options") ?? "[]"));
  } catch {
    return { error: "The options could not be read. Please try again." };
  }

  const parsed = matricQuestionSchema.safeParse({
    yearId: formData.get("yearId"),
    subjectId: formData.get("subjectId"),
    questionHtml: formData.get("questionHtml"),
    explanationHtml: (formData.get("explanationHtml") as string) || undefined,
    difficulty: formData.get("difficulty"),
    accessTier: formData.get("accessTier"),
    marks: formData.get("marks"),
    isPublished: formData.get("isPublished") === "on",
    options,
  });

  if (!parsed.success) return { error: firstError(parsed.error) };
  const values = parsed.data;

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };

  const questionRow = {
    year_id: values.yearId,
    subject_id: values.subjectId,
    question_html: prepareContentHtml(values.questionHtml),
    explanation_html: values.explanationHtml ? prepareContentHtml(values.explanationHtml) : null,
    difficulty: values.difficulty,
    access_tier: values.accessTier,
    marks: values.marks,
    // Always written unpublished here; published in the final step below.
    is_published: false,
  };

  let questionId = id;

  if (id) {
    const { error } = await supabase.from("matric_questions").update(questionRow).eq("id", id);
    if (error) return { error: "Could not save that question." };
  } else {
    const { data, error } = await supabase
      .from("matric_questions")
      .insert({ ...questionRow, created_by: user.id })
      .select("id")
      .single();
    if (error || !data) return { error: "Could not create that question." };
    questionId = data.id as string;
  }

  // Replace rather than diff: options are few, and a full replace cannot leave
  // a stale option behind or two rows both marked correct.
  await supabase.from("matric_question_options").delete().eq("question_id", questionId);

  const { error: optionsError } = await supabase.from("matric_question_options").insert(
    values.options.map((option, index) => ({
      question_id: questionId,
      label: option.label,
      body_html: prepareContentHtml(option.bodyHtml),
      is_correct: option.isCorrect,
      sort_order: index,
    }))
  );

  if (optionsError) {
    return { error: "The question was saved but its options could not be. Please edit and try again." };
  }

  if (values.isPublished) {
    const { error: publishError } = await supabase
      .from("matric_questions")
      .update({ is_published: true })
      .eq("id", questionId);

    if (publishError) {
      return {
        error: publishError.message.includes("exactly_one_correct")
          ? "Mark exactly one option as correct before publishing."
          : "The question was saved as a draft but could not be published.",
      };
    }
  }

  await supabase.rpc("write_audit_log", {
    p_action: id ? "matric_question.updated" : "matric_question.created",
    p_target_table: "matric_questions",
    p_target_id: questionId,
    p_metadata: { published: values.isPublished, tier: values.accessTier },
  });

  revalidatePath("/admin/matric");
  return { ok: true };
}

export async function deleteQuestionAction(id: string): Promise<MatricActionState> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("matric_questions").delete().eq("id", id);
  if (error) return { error: "Could not delete that question." };

  await supabase.rpc("write_audit_log", {
    p_action: "matric_question.deleted",
    p_target_table: "matric_questions",
    p_target_id: id,
    p_metadata: {},
  });

  revalidatePath("/admin/matric");
  return { ok: true };
}

export async function toggleQuestionPublishAction(id: string, publish: boolean): Promise<MatricActionState> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("matric_questions").update({ is_published: publish }).eq("id", id);

  if (error) {
    return {
      error: error.message.includes("exactly_one_correct")
        ? "This question needs exactly one correct option before it can be published."
        : error.message.includes("two_options")
        ? "This question needs at least two options before it can be published."
        : "Could not change the publish state.",
    };
  }

  revalidatePath("/admin/matric");
  return { ok: true };
}
