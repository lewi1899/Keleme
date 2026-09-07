"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { planSchema, firstError } from "@/lib/validation";
import { PLANS_TAG } from "@/lib/queries/public";

export interface PlanActionState {
  ok?: boolean;
  error?: string;
}

export async function savePlanAction(
  _prev: PlanActionState,
  formData: FormData
): Promise<PlanActionState> {
  const planId = (formData.get("planId") as string) || null;

  const parsed = planSchema.safeParse({
    kind: formData.get("kind"),
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    durationDays: formData.get("durationDays"),
    price: formData.get("price"),
    adLevel: formData.get("adLevel"),
    isActive: formData.get("isActive") === "on",
    isPromotional: formData.get("isPromotional") === "on",
    sortOrder: formData.get("sortOrder") || 0,
  });

  if (!parsed.success) return { error: firstError(parsed.error) };
  const values = parsed.data;

  const supabase = createSupabaseServerClient();

  const row = {
    kind: values.kind,
    name: values.name,
    description: values.description ?? null,
    duration_days: values.durationDays,
    price: values.price,
    ad_level: values.adLevel,
    is_active: values.isActive,
    is_promotional: values.isPromotional,
    sort_order: values.sortOrder,
  };

  if (planId) {
    const { error } = await supabase.from("plans").update(row).eq("id", planId);
    if (error) return { error: "Could not save that plan." };
  } else {
    // The slug is derived, not typed: it is only an internal key, and asking
    // an admin to invent a unique one is a needless way to fail a save.
    const slug = `${values.kind}-${values.durationDays}d-${Date.now().toString(36)}`;
    const { error } = await supabase.from("plans").insert({ ...row, slug });
    if (error) return { error: "Could not create that plan." };
  }

  await supabase.rpc("write_audit_log", {
    p_action: planId ? "plan.updated" : "plan.created",
    p_target_table: "plans",
    p_target_id: planId,
    p_metadata: { name: values.name, price: values.price, active: values.isActive },
  });

  // The landing page and pricing screens read plans through an hour-long
  // cache. Without this, a price change would not be visible to visitors for
  // up to an hour — which is exactly the kind of surprise that makes an admin
  // distrust the tool.
  revalidateTag(PLANS_TAG);
  revalidatePath("/admin/plans");
  revalidatePath("/premium");
  revalidatePath("/");
  return { ok: true };
}

export async function togglePlanAction(planId: string, active: boolean): Promise<PlanActionState> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("plans").update({ is_active: active }).eq("id", planId);
  if (error) return { error: "Could not change that plan." };

  await supabase.rpc("write_audit_log", {
    p_action: active ? "plan.activated" : "plan.deactivated",
    p_target_table: "plans",
    p_target_id: planId,
    p_metadata: {},
  });

  revalidateTag(PLANS_TAG);
  revalidatePath("/admin/plans");
  revalidatePath("/premium");
  revalidatePath("/");
  return { ok: true };
}
