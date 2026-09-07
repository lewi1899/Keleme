"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface AdminActionState {
  ok?: boolean;
  error?: string;
}

/**
 * Every action in this file is a thin wrapper around a SECURITY DEFINER
 * function that checks is_admin() itself and writes its own audit entry. The
 * server action adds nothing to the authorization — deliberately, so a bug
 * here cannot widen access, and so the same guarantees hold for anything else
 * that calls those functions (a script, a future mobile admin app).
 */

export async function setSuspensionAction(
  userId: string,
  suspended: boolean,
  reason?: string
): Promise<AdminActionState> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_set_suspension", {
    p_user: userId,
    p_suspended: suspended,
    p_reason: reason ?? null,
  });

  if (error) return { error: mapError(error.message) };
  revalidatePath("/admin/students");
  return { ok: true };
}

export async function grantEntitlementAction(
  userId: string,
  kind: "premium" | "matric",
  days: number,
  note?: string
): Promise<AdminActionState> {
  if (!Number.isInteger(days) || days < 1 || days > 3650) {
    return { error: "Enter a number of days between 1 and 3650." };
  }

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_grant_entitlement", {
    p_user: userId,
    p_kind: kind,
    p_days: days,
    p_note: note ?? null,
  });

  if (error) return { error: mapError(error.message) };
  revalidatePath("/admin/students");
  return { ok: true };
}

export async function revokeEntitlementAction(
  entitlementId: string,
  reason: string
): Promise<AdminActionState> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_revoke_entitlement", {
    p_entitlement: entitlementId,
    p_reason: reason,
  });

  if (error) return { error: mapError(error.message) };
  revalidatePath("/admin/students");
  return { ok: true };
}

export async function setRoleAction(
  userId: string,
  role: "student" | "content_editor" | "admin"
): Promise<AdminActionState> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_set_role", { p_user: userId, p_role: role });

  if (error) return { error: mapError(error.message) };
  revalidatePath("/admin/students");
  revalidatePath("/admin/team");
  return { ok: true };
}

function mapError(message: string): string {
  if (message.includes("cannot_remove_last_admin")) {
    return "You cannot remove the last administrator — promote someone else first.";
  }
  if (message.includes("forbidden")) {
    return "Only administrators can do that.";
  }
  return "That did not work. Please try again.";
}
