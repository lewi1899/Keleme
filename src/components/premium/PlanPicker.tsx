"use client";

import { useState } from "react";
import { Check, Crown, GraduationCap, Phone, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { formatBirr } from "@/lib/format";
import type { Plan } from "@/lib/database.types";

interface RequestResult {
  payment_id: string;
  reference: string;
  amount: number;
  plan_name: string;
  reused: boolean;
}

/**
 * Plan selection and checkout.
 *
 * No payment provider is connected yet, and this deliberately does not pretend
 * one is: requesting a plan creates a real pending payment record with the
 * amount taken from the plan row, and then tells the student exactly how to
 * pay and what reference to quote. An admin confirms it, and only that
 * confirmation grants access. Nothing here fakes a successful payment.
 */
export function PlanPicker({
  standardPlans,
  matricPlans,
  phones,
  isPremium,
  isMatric,
}: {
  standardPlans: Plan[];
  matricPlans: Plan[];
  phones: { phone: string; label: string }[];
  isPremium: boolean;
  isMatric: boolean;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [result, setResult] = useState<RequestResult | null>(null);
  const toast = useToast();

  async function request(plan: Plan) {
    setPendingId(plan.id);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("request_plan", { p_plan_id: plan.id });
    setPendingId(null);

    if (error) {
      toast.error(
        "Could not start that request",
        error.message.includes("matric_plan_requires_grade_12")
          ? "The Matric Package is only available to Grade 12 students."
          : "Please try again in a moment."
      );
      return;
    }
    setResult(data as RequestResult);
  }

  return (
    <>
      <PlanSection
        title="KELEME Premium"
        subtitle="Every premium note, textbook and video for your grade."
        icon={<Crown size={15} className="text-amber-500" />}
        plans={standardPlans}
        active={isPremium}
        pendingId={pendingId}
        onRequest={request}
      />

      {matricPlans.length > 0 && (
        <PlanSection
          title="Matric Package"
          subtitle="Past matric and model papers, with answers and explanations. Sold separately from Premium."
          icon={<GraduationCap size={15} className="text-violet-600" />}
          plans={matricPlans}
          active={isMatric}
          pendingId={pendingId}
          onRequest={request}
        />
      )}

      <Modal
        open={result !== null}
        onClose={() => setResult(null)}
        title="Almost there — one step to go"
        description={result?.plan_name}
      >
        {result && (
          <div className="space-y-4">
            <div className="rounded-xl bg-[var(--surface-elevated)] p-4 text-center">
              <p className="text-xs font-medium text-text-secondary">Amount to pay</p>
              <p className="kl-display mt-1 text-3xl font-extrabold text-text-primary">
                {formatBirr(result.amount)}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium text-text-secondary">Your reference</p>
              <p className="kl-display mt-1 select-all font-mono text-lg font-bold tracking-wide text-accent">
                {result.reference.slice(0, 12)}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-text-secondary">
                Quote this when you pay so we can match your payment to your account.
              </p>
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold text-text-primary">Call or message us to pay</p>
              <div className="space-y-2">
                {phones.map((phone) => (
                  <a
                    key={phone.phone}
                    href={`tel:${phone.phone}`}
                    className="kl-interactive flex items-center gap-3 rounded-xl border border-kl-border p-3"
                  >
                    <Phone size={15} className="shrink-0 text-accent" aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-text-primary">{phone.phone}</span>
                      <span className="block text-xs text-text-secondary">{phone.label}</span>
                    </span>
                  </a>
                ))}
              </div>
            </div>

            <p className="rounded-xl border border-kl-border p-3 text-xs leading-relaxed text-text-secondary">
              Your {result.plan_name} activates as soon as we confirm the payment — usually within a
              few hours. You can see the status any time under &ldquo;Your requests&rdquo; on this page.
            </p>
          </div>
        )}
      </Modal>
    </>
  );
}

function PlanSection({
  title,
  subtitle,
  icon,
  plans,
  active,
  pendingId,
  onRequest,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  plans: Plan[];
  active: boolean;
  pendingId: string | null;
  onRequest: (plan: Plan) => void;
}) {
  if (plans.length === 0) return null;

  // The best-value plan is whichever has the lowest cost per day — computed
  // rather than hard-coded, so it stays correct when an admin changes prices.
  const bestValueId = plans.reduce((best, plan) =>
    plan.price / plan.duration_days < best.price / best.duration_days ? plan : best
  ).id;

  return (
    <section>
      <h2 className="kl-display flex items-center gap-2 text-lg font-bold text-text-primary">
        {icon}
        {title}
      </h2>
      <p className="mt-1 text-sm text-text-secondary">{subtitle}</p>

      <div className="kl-stagger mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {plans.map((plan, i) => {
          const featured = plan.id === bestValueId;
          const months = Math.max(1, Math.round(plan.duration_days / 30));

          return (
            <Card
              key={plan.id}
              style={{ ["--kl-i" as string]: i }}
              className={`relative flex flex-col p-5 ${featured ? "border-accent ring-1 ring-accent" : ""}`}
            >
              {featured && (
                <span className="absolute -top-2.5 left-5 rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-bold text-[var(--accent-contrast)]">
                  Best value
                </span>
              )}

              <p className="text-sm font-semibold text-text-secondary">{plan.name}</p>
              <p className="kl-display mt-1.5 text-2xl font-extrabold text-text-primary">
                {formatBirr(plan.price)}
              </p>
              {months > 1 && (
                <p className="mt-0.5 text-xs text-text-secondary">
                  {formatBirr(Math.round(plan.price / months))} a month
                </p>
              )}

              <div className="mt-3 flex-1 space-y-1.5 text-xs text-text-secondary">
                <p className="flex items-center gap-1.5">
                  <Check size={13} className="shrink-0 text-emerald-500" aria-hidden />
                  {plan.duration_days} days of access
                </p>
                <p className="flex items-center gap-1.5">
                  {plan.ad_level === "none" ? (
                    <>
                      <ShieldCheck size={13} className="shrink-0 text-emerald-500" aria-hidden />
                      No ads at all
                    </>
                  ) : (
                    <>
                      <Check size={13} className="shrink-0 text-emerald-500" aria-hidden />
                      {plan.ad_level === "low" ? "Very few ads" : plan.ad_level === "medium" ? "Fewer ads" : "Includes ads"}
                    </>
                  )}
                </p>
              </div>

              <Button
                className="mt-4"
                fullWidth
                size="sm"
                variant={featured ? "primary" : "secondary"}
                loading={pendingId === plan.id}
                onClick={() => onRequest(plan)}
              >
                {active ? "Extend" : "Choose"}
              </Button>
            </Card>
          );
        })}
      </div>

      {active && (
        <p className="mt-3 text-xs text-text-secondary">
          Extending adds time to the end of your current period — nothing is lost by renewing early.
        </p>
      )}
    </section>
  );
}
