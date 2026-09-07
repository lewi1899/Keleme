import { requireAdmin } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/AdminPage";
import { PaymentsTable } from "@/components/admin/PaymentsTable";
import { Card } from "@/components/ui/Card";
import { Info } from "lucide-react";

export const metadata = { title: "Payments" };
export const dynamic = "force-dynamic";

export interface PaymentRow {
  id: string;
  amount: number;
  currency: string;
  status: string;
  provider: string;
  provider_reference: string | null;
  created_at: string;
  paid_at: string | null;
  profiles: { full_name: string; phone: string; email: string | null; grade: number } | null;
  plans: { name: string; kind: string; duration_days: number } | null;
}

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  await requireAdmin();
  const supabase = createSupabaseServerClient();

  const status = searchParams.status ?? "pending";

  let query = supabase
    .from("payments")
    .select("*, profiles(full_name, phone, email, grade), plans(name, kind, duration_days)")
    .order("created_at", { ascending: false })
    .limit(100);

  if (status !== "all") query = query.eq("status", status);

  const { data } = await query;

  return (
    <>
      <AdminPageHeader
        title="Payments"
        description="Confirm a payment to activate a student's plan. Confirming is the only action that grants access."
      />

      <Card className="mb-4 flex gap-3 p-4">
        <Info size={17} className="mt-0.5 shrink-0 text-accent" aria-hidden />
        <div className="text-sm leading-relaxed text-text-secondary">
          <p className="font-semibold text-text-primary">No payment provider is connected yet.</p>
          <p className="mt-1">
            Students request a plan here, pay you through your existing channel quoting their
            reference, and you confirm it below. When a provider is integrated later, its webhook
            confirms payments automatically through the same path — nothing about this screen
            changes.
          </p>
        </div>
      </Card>

      <PaymentsTable rows={(data ?? []) as PaymentRow[]} status={status} />
    </>
  );
}
