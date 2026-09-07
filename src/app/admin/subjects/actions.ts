"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface SubjectActionState {
  ok?: boolean;
  error?: string;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function saveSubjectAction(
  _prev: SubjectActionState,
  formData: FormData
): Promise<SubjectActionState> {
  const id = (formData.get("id") as string) || null;
  const name = String(formData.get("name") ?? "").trim();
  const grade = Number(formData.get("grade"));

  if (name.length < 1) return { error: "Give the subject a name." };
  if (![9, 10, 11, 12].includes(grade)) return { error: "Choose a grade between 9 and 12." };

  const supabase = createSupabaseServerClient();
  const row = {
    grade,
    name,
    description: (formData.get("description") as string) || null,
    color: (formData.get("color") as string) || "#2563eb",
    sort_order: Number(formData.get("sortOrder")) || 0,
    is_active: formData.get("isActive") === "on",
  };

  const { error } = id
    ? await supabase.from("subjects").update(row).eq("id", id)
    : await supabase.from("subjects").insert({ ...row, slug: slugify(name) });

  if (error) {
    return {
      error: error.message.includes("subjects_grade_slug_key")
        ? "That subject already exists for this grade."
        : "Could not save that subject.",
    };
  }

  revalidatePath("/admin/subjects");
  revalidatePath("/learn");
  return { ok: true };
}

export async function deleteSubjectAction(id: string): Promise<SubjectActionState> {
  const supabase = createSupabaseServerClient();

  // Content rows reference the subject with ON DELETE SET NULL, so deleting a
  // subject orphans its content rather than destroying it. Warn instead of
  // quietly unfiling a term's worth of notes.
  const { count } = await supabase
    .from("content_items")
    .select("id", { count: "exact", head: true })
    .eq("subject_id", id);

  if ((count ?? 0) > 0) {
    return {
      error: `This subject still has ${count} content item${count === 1 ? "" : "s"}. Move or delete them first, or just turn the subject off.`,
    };
  }

  const { error } = await supabase.from("subjects").delete().eq("id", id);
  if (error) return { error: "Could not delete that subject." };

  revalidatePath("/admin/subjects");
  return { ok: true };
}

export async function saveUnitAction(
  _prev: SubjectActionState,
  formData: FormData
): Promise<SubjectActionState> {
  const id = (formData.get("id") as string) || null;
  const subjectId = String(formData.get("subjectId") ?? "");
  const title = String(formData.get("title") ?? "").trim();

  if (!subjectId) return { error: "Choose a subject." };
  if (title.length < 1) return { error: "Give the unit a title." };

  const supabase = createSupabaseServerClient();
  const row = {
    subject_id: subjectId,
    title,
    description: (formData.get("description") as string) || null,
    sort_order: Number(formData.get("sortOrder")) || 0,
    is_active: formData.get("isActive") === "on",
  };

  const { error } = id
    ? await supabase.from("units").update(row).eq("id", id)
    : await supabase.from("units").insert(row);

  if (error) return { error: "Could not save that unit." };

  revalidatePath("/admin/subjects");
  revalidatePath("/learn");
  return { ok: true };
}

export async function deleteUnitAction(id: string): Promise<SubjectActionState> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("units").delete().eq("id", id);
  if (error) return { error: "Could not delete that unit." };
  revalidatePath("/admin/subjects");
  return { ok: true };
}
