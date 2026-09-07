"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { contentSchema, extractYouTubeId, firstError } from "@/lib/validation";
import { prepareContentHtml } from "@/lib/sanitize";

export interface ContentActionState {
  ok?: boolean;
  error?: string;
  contentId?: string;
}

/**
 * Creates or updates a content item.
 *
 * Two things happen here that cannot happen anywhere else:
 *
 *  - HTML is sanitised on write, once, before storage. Doing it on read would
 *    mean every student page view pays the cost and every future read path has
 *    to remember; doing it here means what is in the database is known clean.
 *  - The YouTube id is extracted from whatever was pasted and only the id is
 *    stored, so tracking parameters never reach the database or a student.
 *
 * Authorization is not decided here. The write goes through the caller's own
 * session, so the `content_items_staff_write` policy is what actually permits
 * it — a student calling this action gets nothing.
 */
export async function saveContentAction(
  _prev: ContentActionState,
  formData: FormData
): Promise<ContentActionState> {
  const contentId = (formData.get("contentId") as string) || null;

  const parsed = contentSchema.safeParse({
    contentType: formData.get("contentType"),
    accessTier: formData.get("accessTier"),
    grade: formData.get("grade"),
    subjectId: formData.get("subjectId") || undefined,
    unitId: formData.get("unitId") || undefined,
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    tags: String(formData.get("tags") ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    bodyHtml: (formData.get("bodyHtml") as string) || undefined,
    storagePath: (formData.get("storagePath") as string) || undefined,
    youtubeUrl: (formData.get("youtubeUrl") as string) || undefined,
    externalUrl: (formData.get("externalUrl") as string) || undefined,
    isPublished: formData.get("isPublished") === "on",
  });

  if (!parsed.success) {
    return { error: firstError(parsed.error) };
  }

  const values = parsed.data;
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };

  const videoId = values.contentType === "youtube" ? extractYouTubeId(values.youtubeUrl ?? "") : null;

  const row = {
    content_type: values.contentType,
    access_tier: values.accessTier,
    grade: values.grade,
    subject_id: values.subjectId ?? null,
    unit_id: values.unitId ?? null,
    title: values.title,
    description: values.description ?? null,
    tags: values.tags,
    storage_path: values.contentType === "pdf" ? values.storagePath ?? null : null,
    youtube_video_id: videoId,
    youtube_url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : null,
    external_url: values.contentType === "other" ? values.externalUrl ?? null : null,
    is_published: values.isPublished,
    updated_by: user.id,
  };

  let id = contentId;

  if (contentId) {
    const { error } = await supabase.from("content_items").update(row).eq("id", contentId);
    if (error) return { error: friendly(error.message) };
  } else {
    const { data, error } = await supabase
      .from("content_items")
      .insert({ ...row, created_by: user.id })
      .select("id")
      .single();
    if (error || !data) return { error: friendly(error?.message ?? "") };
    id = data.id as string;
  }

  if (values.contentType === "html" && id) {
    const clean = prepareContentHtml(values.bodyHtml ?? "");
    const { error } = await supabase
      .from("content_html_bodies")
      .upsert({ content_id: id, body_html: clean }, { onConflict: "content_id" });
    if (error) return { error: "The content was saved but its body could not be stored." };
  }

  await supabase.rpc("write_audit_log", {
    p_action: contentId ? "content.updated" : "content.created",
    p_target_table: "content_items",
    p_target_id: id,
    p_metadata: { title: values.title, tier: values.accessTier, published: values.isPublished },
  });

  revalidatePath("/admin/content");
  revalidatePath("/learn");
  return { ok: true, contentId: id ?? undefined };
}

export async function togglePublishAction(contentId: string, publish: boolean): Promise<ContentActionState> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("content_items")
    .update({ is_published: publish })
    .eq("id", contentId);

  if (error) return { error: "Could not change the publish state." };

  await supabase.rpc("write_audit_log", {
    p_action: publish ? "content.published" : "content.unpublished",
    p_target_table: "content_items",
    p_target_id: contentId,
    p_metadata: {},
  });

  revalidatePath("/admin/content");
  revalidatePath("/learn");
  return { ok: true };
}

/**
 * Deletes a content item and, for PDFs, the storage object behind it.
 *
 * The storage delete uses the service role because it must succeed even if the
 * object was uploaded by a different member of staff. It runs only after the
 * row delete has been permitted by RLS, so authorization is still the
 * database's decision.
 */
export async function deleteContentAction(contentId: string): Promise<ContentActionState> {
  const supabase = createSupabaseServerClient();

  const { data: item } = await supabase
    .from("content_items")
    .select("storage_path, title")
    .eq("id", contentId)
    .maybeSingle();

  const { error } = await supabase.from("content_items").delete().eq("id", contentId);
  if (error) return { error: "Could not delete that item." };

  if (item?.storage_path) {
    const admin = createAdminClient();
    await admin.storage.from("content-pdfs").remove([item.storage_path]);
  }

  await supabase.rpc("write_audit_log", {
    p_action: "content.deleted",
    p_target_table: "content_items",
    p_target_id: contentId,
    p_metadata: { title: item?.title ?? null },
  });

  revalidatePath("/admin/content");
  revalidatePath("/learn");
  return { ok: true };
}

/** Turns Postgres constraint names into something an admin can act on. */
function friendly(message: string): string {
  if (message.includes("content_type_payload")) {
    return "This content type needs its own field filled in — a file for PDFs, a link for videos.";
  }
  if (message.includes("unit_does_not_belong_to_subject")) {
    return "That unit belongs to a different subject. Pick a unit from the chosen subject.";
  }
  if (message.includes("row-level security")) {
    return "You do not have permission to change this content.";
  }
  return "Could not save. Please check the form and try again.";
}
