"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface AnnouncementActionState {
  ok?: boolean;
  error?: string;
}

export async function saveAnnouncementAction(
  _prev: AnnouncementActionState,
  formData: FormData
): Promise<AnnouncementActionState> {
  const id = (formData.get("id") as string) || null;
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();

  if (!title) return { error: "Give the announcement a title." };
  if (!body) return { error: "Write the announcement." };

  const targetGrade = formData.get("targetGrade");
  const endsAt = formData.get("endsAt") as string;

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const row = {
    title,
    body,
    level: String(formData.get("level") ?? "info"),
    target_grade: targetGrade ? Number(targetGrade) : null,
    ends_at: endsAt ? new Date(endsAt).toISOString() : null,
    is_active: formData.get("isActive") === "on",
    created_by: user?.id ?? null,
  };

  const { error } = id
    ? await supabase.from("announcements").update(row).eq("id", id)
    : await supabase.from("announcements").insert(row);

  if (error) return { error: "Could not save that announcement." };

  await supabase.rpc("write_audit_log", {
    p_action: id ? "announcement.updated" : "announcement.created",
    p_target_table: "announcements",
    p_target_id: id,
    p_metadata: { title },
  });

  revalidatePath("/admin/announcements");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteAnnouncementAction(id: string): Promise<AnnouncementActionState> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("announcements").delete().eq("id", id);
  if (error) return { error: "Could not delete that announcement." };

  revalidatePath("/admin/announcements");
  revalidatePath("/dashboard");
  return { ok: true };
}
