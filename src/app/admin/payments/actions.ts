"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface PaymentActionState {
  ok?: boolean;
  error?: string;
}

/**
 * Confirming a payment is the only thing on the platform that turns money into
 * access, so it goes through admin_confirm_payment — which checks is_admin(),
 * grants the entitlement from the PLAN's duration (never from anything passed
 * in here), writes an audit entry, and is idempotent.
 */
export async function confirmPaymentAction(
  paymentId: string,
  reference?: string
): Promise<PaymentActionState> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_confirm_payment", {
    p_payment_id: paymentId,
    p_reference: reference || null,
  });

  if (error) {
    return { error: error.message.includes("forbidden")
      ? "Only administrators can confirm payments."
      : "Could not confirm that payment." };
  }

  revalidatePath("/admin/payments");
  revalidatePath("/admin");
  return { ok: true };
}

export async function rejectPaymentAction(paymentId: string, reason: string): Promise<PaymentActionState> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_reject_payment", {
    p_payment_id: paymentId,
    p_reason: reason,
  });

  if (error) return { error: "Could not cancel that payment." };
  revalidatePath("/admin/payments");
  return { ok: true };
}
