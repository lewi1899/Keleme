import { Crown, GraduationCap, Receipt } from "lucide-react";
import { requireUser } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupportContacts } from "@/lib/queries/public";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PlanPicker } from "@/components/premium/PlanPicker";
import { formatBirr, formatDate } from "@/lib/format";
import type { Payment, Plan } from "@/lib/database.types";

export const metadata = { title: "Premium" };
export const dynamic = "force-dynamic";

export default async function PremiumPage() {
  const session = await requireUser();
  const supabase = createSupabaseServerClient();

  const [{ data: plans }, { data: payments }, contacts] = await Promise.all([
    supabase.from("plans").select("*").eq("is_active", true).order("kind").order("sort_order"),
    supabase
      .from("payments")
      .select("*, plans(name, kind)")
      .order("created_at", { ascending: false })
      .limit(20),
    getSupportContacts(),
  ]);

  const allPlans = (plans ?? []) as Plan[];
  const standard = allPlans.filter((p) => p.kind === "standard");
  // Never render a product this student cannot use.
  const matric = session.profile.grade === 12 ? allPlans.filter((p) => p.kind === "matric") : [];
  const history = (payments ?? []) as (Payment & { plans: { name: string; kind: string } | null })[];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="kl-display text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
          Plans and billing
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-text-secondary">
          KELEME Premium unlocks every premium note, textbook and video for your grade. The Matric
          Package is separate and covers past papers.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-2 font-semibold text-text-primary">
              <Crown size={17} className="text-amber-500" aria-hidden />
              KELEME Premium
            </p>
            <Badge tone={session.is_premium ? "success" : "neutral"}>
              {session.is_premium ? "Active" : "Not active"}
            </Badge>
          </div>
          <p className="mt-2 text-sm text-text-secondary">
            {session.is_premium && session.premium_until
              ? `Active until ${formatDate(session.premium_until)}.`
              : "You are on the free plan — free content for your grade, with ads."}
          </p>
        </Card>

        {session.profile.grade === 12 && (
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 font-semibold text-text-primary">
                <GraduationCap size={17} className="text-violet-600" aria-hidden />
                Matric Package
              </p>
              <Badge tone={session.is_matric ? "success" : "neutral"}>
                {session.is_matric ? "Active" : "Not active"}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-text-secondary">
              {session.is_matric && session.matric_until
                ? `Active until ${formatDate(session.matric_until)}.`
                : "Past matric and model papers with answers and explanations."}
            </p>
          </Card>
        )}
      </div>

      <PlanPicker
        standardPlans={standard}
        matricPlans={matric}
        phones={contacts.phones}
        isPremium={session.is_premium}
        isMatric={session.is_matric}
      />

      {history.length > 0 && (
        <section>
          <h2 className="kl-display mb-3 flex items-center gap-2 text-lg font-bold text-text-primary">
            <Receipt size={17} aria-hidden />
            Your requests
          </h2>
          <Card className="divide-y divide-[var(--border)] overflow-hidden p-0">
            {history.map((payment) => (
              <div key={payment.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text-primary">
                    {payment.plans?.name ?? "Plan"}
                  </p>
                  <p className="text-xs text-text-secondary">
                    {formatDate(payment.created_at)} · Reference{" "}
                    <span className="font-mono">{payment.id.replace(/-/g, "").slice(0, 12).toUpperCase()}</span>
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-text-primary">{formatBirr(payment.amount)}</span>
                  <Badge
                    tone={
                      payment.status === "paid"
                        ? "success"
                        : payment.status === "pending"
                        ? "warning"
                        : "danger"
                    }
                  >
                    {payment.status === "paid" ? "Confirmed" : payment.status === "pending" ? "Awaiting payment" : payment.status}
                  </Badge>
                </div>
              </div>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}
