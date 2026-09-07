"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CreditCard, X } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Field, TextInput } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { AdminTable } from "@/components/admin/AdminPage";
import { useToast } from "@/components/ui/Toast";
import { confirmPaymentAction, rejectPaymentAction } from "@/app/admin/payments/actions";
import { formatBirr, formatDateTime } from "@/lib/format";
import type { PaymentRow } from "@/app/admin/payments/page";

const STATUSES = [
  { id: "pending", label: "Awaiting confirmation" },
  { id: "paid", label: "Confirmed" },
  { id: "cancelled", label: "Cancelled" },
  { id: "all", label: "All" },
];

export function PaymentsTable({ rows, status }: { rows: PaymentRow[]; status: string }) {
  const router = useRouter();
  const toast = useToast();
  const [confirming, setConfirming] = useState<PaymentRow | null>(null);
  const [rejecting, setRejecting] = useState<PaymentRow | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm(reference: string) {
    if (!confirming) return;
    const payment = confirming;
    startTransition(async () => {
      const result = await confirmPaymentAction(payment.id, reference);
      if (result.error) toast.error("Could not confirm", result.error);
      else {
        toast.success(
          "Payment confirmed",
          `${payment.profiles?.full_name ?? "Student"} now has ${payment.plans?.name ?? "their plan"}.`
        );
        setConfirming(null);
        router.refresh();
      }
    });
  }

  function reject(reason: string) {
    if (!rejecting) return;
    const payment = rejecting;
    startTransition(async () => {
      const result = await rejectPaymentAction(payment.id, reason);
      if (result.error) toast.error("Could not cancel", result.error);
      else {
        toast.success("Payment cancelled");
        setRejecting(null);
        router.refresh();
      }
    });
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {STATUSES.map((s) => (
          <a
            key={s.id}
            href={`/admin/payments?status=${s.id}`}
            className={`kl-press rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
              status === s.id
                ? "border-accent bg-accent text-[var(--accent-contrast)]"
                : "border-kl-border text-text-secondary hover:bg-accent-soft hover:text-text-primary"
            }`}
          >
            {s.label}
          </a>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<CreditCard size={20} />}
          title={status === "pending" ? "Nothing waiting" : "No payments here"}
          description={
            status === "pending"
              ? "Every payment request has been dealt with."
              : "Requests appear here as students choose a plan."
          }
        />
      ) : (
        <AdminTable headers={["Student", "Plan", "Amount", "Reference", "Requested", "Status", ""]}>
          {rows.map((payment) => (
            <tr key={payment.id} className="transition-colors hover:bg-[var(--surface-elevated)]">
              <td className="max-w-[200px] px-4 py-3">
                <p className="truncate font-medium text-text-primary">
                  {payment.profiles?.full_name ?? "Unknown"}
                </p>
                <p className="truncate text-xs text-text-secondary">{payment.profiles?.phone}</p>
              </td>
              <td className="max-w-[180px] truncate px-4 py-3 text-text-secondary">
                {payment.plans?.name ?? "—"}
              </td>
              <td className="whitespace-nowrap px-4 py-3 font-semibold text-text-primary">
                {formatBirr(payment.amount)}
              </td>
              <td className="whitespace-nowrap px-4 py-3">
                {/* The same 12 characters the student was shown, so support can
                    match what they read out over the phone. */}
                <span className="font-mono text-xs text-text-secondary">
                  {payment.id.replace(/-/g, "").slice(0, 12).toUpperCase()}
                </span>
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-xs text-text-secondary">
                {formatDateTime(payment.created_at)}
              </td>
              <td className="px-4 py-3">
                <Badge
                  tone={payment.status === "paid" ? "success" : payment.status === "pending" ? "warning" : "danger"}
                >
                  {payment.status === "paid" ? "Confirmed" : payment.status === "pending" ? "Waiting" : payment.status}
                </Badge>
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right">
                {payment.status === "pending" && (
                  <div className="flex justify-end gap-1.5">
                    <Button size="sm" icon={<Check size={14} />} onClick={() => setConfirming(payment)}>
                      Confirm
                    </Button>
                    <button
                      type="button"
                      onClick={() => setRejecting(payment)}
                      title="Cancel this request"
                      aria-label="Cancel this request"
                      className="kl-press rounded-lg p-1.5 text-text-secondary hover:bg-red-500/10 hover:text-red-600"
                    >
                      <X size={15} aria-hidden />
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </AdminTable>
      )}

      <Modal
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title="Confirm this payment?"
        description={confirming?.plans?.name}
        size="sm"
      >
        <div className="rounded-xl bg-[var(--surface-elevated)] p-4">
          <p className="text-sm text-text-secondary">
            <span className="font-semibold text-text-primary">{confirming?.profiles?.full_name}</span>{" "}
            will immediately get {confirming?.plans?.duration_days} days of{" "}
            {confirming?.plans?.kind === "matric" ? "the Matric Package" : "KELEME Premium"}.
          </p>
          <p className="kl-display mt-2 text-2xl font-extrabold text-text-primary">
            {confirming ? formatBirr(confirming.amount) : ""}
          </p>
        </div>

        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            confirm(((new FormData(e.currentTarget).get("reference") as string) ?? "").trim());
          }}
        >
          <Field label="Payment reference" hint="The transaction id from telebirr, CBE or your bank. Optional but recommended.">
            {({ id }) => <TextInput id={id} name="reference" placeholder="e.g. TB240912ABC" />}
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setConfirming(null)}>Cancel</Button>
            <Button type="submit" loading={pending} icon={<Check size={15} />}>Confirm payment</Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={rejecting !== null}
        onClose={() => setRejecting(null)}
        title="Cancel this request?"
        size="sm"
      >
        <p className="text-sm leading-relaxed text-text-secondary">
          No access is granted and the student can request the plan again. Use this when a payment
          never arrived.
        </p>
        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            reject(((new FormData(e.currentTarget).get("reason") as string) ?? "No payment received").trim());
          }}
        >
          <Field label="Reason">
            {({ id }) => <TextInput id={id} name="reason" defaultValue="No payment received" />}
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setRejecting(null)}>Keep waiting</Button>
            <Button type="submit" variant="danger" loading={pending}>Cancel request</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
