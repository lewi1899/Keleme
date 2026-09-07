"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { contactEmailSchema, contactPhoneSchema, firstError } from "@/lib/validation";
import { CONTACTS_TAG } from "@/lib/queries/public";

export interface ContactActionState {
  ok?: boolean;
  error?: string;
}

function refresh() {
  // Contacts are cached for the landing, suspended and settings pages. A
  // support number that changed but still shows the old value for an hour is
  // worse than no cache at all.
  revalidateTag(CONTACTS_TAG);
  revalidatePath("/admin/contacts");
  revalidatePath("/");
  revalidatePath("/settings");
}

export async function savePhoneAction(
  _prev: ContactActionState,
  formData: FormData
): Promise<ContactActionState> {
  const id = (formData.get("id") as string) || null;

  const parsed = contactPhoneSchema.safeParse({
    phone: formData.get("phone"),
    label: formData.get("label"),
    purpose: formData.get("purpose") || undefined,
    isActive: formData.get("isActive") === "on",
    sortOrder: formData.get("sortOrder") || 0,
  });

  if (!parsed.success) return { error: firstError(parsed.error) };

  const supabase = createSupabaseServerClient();
  const row = {
    phone: parsed.data.phone,
    label: parsed.data.label,
    purpose: parsed.data.purpose ?? null,
    is_active: parsed.data.isActive,
    sort_order: parsed.data.sortOrder,
  };

  const { error } = id
    ? await supabase.from("contact_phones").update(row).eq("id", id)
    : await supabase.from("contact_phones").insert(row);

  if (error) {
    return {
      error: error.message.includes("duplicate")
        ? "That number is already in the list."
        : "Could not save that number.",
    };
  }

  await supabase.rpc("write_audit_log", {
    p_action: id ? "contact_phone.updated" : "contact_phone.created",
    p_target_table: "contact_phones",
    p_target_id: id,
    p_metadata: { phone: parsed.data.phone, label: parsed.data.label },
  });

  refresh();
  return { ok: true };
}

export async function deletePhoneAction(id: string): Promise<ContactActionState> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("contact_phones").delete().eq("id", id);
  if (error) return { error: "Could not remove that number." };

  await supabase.rpc("write_audit_log", {
    p_action: "contact_phone.deleted",
    p_target_table: "contact_phones",
    p_target_id: id,
    p_metadata: {},
  });

  refresh();
  return { ok: true };
}

export async function saveEmailAction(
  _prev: ContactActionState,
  formData: FormData
): Promise<ContactActionState> {
  const id = (formData.get("id") as string) || null;

  const parsed = contactEmailSchema.safeParse({
    email: formData.get("email"),
    label: formData.get("label"),
    purpose: formData.get("purpose") || undefined,
    isActive: formData.get("isActive") === "on",
    sortOrder: formData.get("sortOrder") || 0,
  });

  if (!parsed.success) return { error: firstError(parsed.error) };

  const supabase = createSupabaseServerClient();
  const row = {
    email: parsed.data.email,
    label: parsed.data.label,
    purpose: parsed.data.purpose ?? null,
    is_active: parsed.data.isActive,
    sort_order: parsed.data.sortOrder,
  };

  const { error } = id
    ? await supabase.from("contact_emails").update(row).eq("id", id)
    : await supabase.from("contact_emails").insert(row);

  if (error) {
    return {
      error: error.message.includes("duplicate")
        ? "That email is already in the list."
        : "Could not save that email.",
    };
  }

  await supabase.rpc("write_audit_log", {
    p_action: id ? "contact_email.updated" : "contact_email.created",
    p_target_table: "contact_emails",
    p_target_id: id,
    p_metadata: { email: parsed.data.email },
  });

  refresh();
  return { ok: true };
}

export async function deleteEmailAction(id: string): Promise<ContactActionState> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("contact_emails").delete().eq("id", id);
  if (error) return { error: "Could not remove that email." };

  await supabase.rpc("write_audit_log", {
    p_action: "contact_email.deleted",
    p_target_table: "contact_emails",
    p_target_id: id,
    p_metadata: {},
  });

  refresh();
  return { ok: true };
}
