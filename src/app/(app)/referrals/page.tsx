import { Check, Gift, Info, Users } from "lucide-react";
import { requireUser } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ReferralShare } from "@/components/referrals/ReferralShare";
import { pluralize } from "@/lib/format";
import type { ReferralSummary } from "@/lib/database.types";

export const metadata = { title: "Invite friends" };
export const dynamic = "force-dynamic";

export default async function ReferralsPage() {
  await requireUser();
  const supabase = createSupabaseServerClient();

  const { data } = await supabase.rpc("get_my_referral_summary");
  const summary = (data ?? { referral_code: "", confirmed: 0, pending: 0, tiers: [] }) as ReferralSummary;

  const link = `${publicEnv.siteUrl}/register?ref=${summary.referral_code}`;
  const nextTier = summary.tiers.find((tier) => !tier.earned && tier.required > summary.confirmed);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="kl-display text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
          Invite friends, earn Premium
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-text-secondary">
          Share your code. When a friend registers and signs in, it counts — and free Premium
          follows.
        </p>
      </header>

      <ReferralShare code={summary.referral_code} link={link} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="flex items-center gap-2 text-xs font-medium text-text-secondary">
            <Users size={14} className="text-accent" aria-hidden />
            Friends joined
          </p>
          <p className="kl-display mt-2 text-3xl font-extrabold text-text-primary">{summary.confirmed}</p>
        </Card>

        <Card className="p-5">
          <p className="text-xs font-medium text-text-secondary">Waiting to sign in</p>
          <p className="kl-display mt-2 text-3xl font-extrabold text-text-primary">{summary.pending}</p>
          <p className="mt-1 text-[11px] leading-tight text-text-secondary">
            Registered but not signed in yet — these do not count until they do.
          </p>
        </Card>

        <Card className="p-5">
          <p className="text-xs font-medium text-text-secondary">Next reward</p>
          {nextTier ? (
            <>
              <p className="kl-display mt-2 text-3xl font-extrabold text-text-primary">
                {nextTier.required - summary.confirmed}
              </p>
              <p className="mt-1 text-[11px] leading-tight text-text-secondary">
                more {nextTier.required - summary.confirmed === 1 ? "friend" : "friends"} for{" "}
                {rewardLabel(nextTier.reward_days)}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm font-semibold text-emerald-600">Every tier earned 🎉</p>
          )}
        </Card>
      </div>

      <section>
        <h2 className="kl-display mb-3 text-lg font-bold text-text-primary">Rewards</h2>
        <div className="kl-stagger space-y-3">
          {summary.tiers.map((tier, i) => {
            const progress = Math.min(100, Math.round((summary.confirmed / tier.required) * 100));
            return (
              <Card key={tier.id} className="p-5" style={{ ["--kl-i" as string]: i }}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`grid h-9 w-9 place-items-center rounded-xl ${
                        tier.earned ? "bg-emerald-500/15 text-emerald-600" : "bg-accent-soft text-accent"
                      }`}
                    >
                      {tier.earned ? <Check size={17} aria-hidden /> : <Gift size={17} aria-hidden />}
                    </span>
                    <div>
                      <p className="font-semibold text-text-primary">{tier.name}</p>
                      <p className="text-xs text-text-secondary">
                        {pluralize(tier.required, "friend")} → {rewardLabel(tier.reward_days)}
                      </p>
                    </div>
                  </div>
                  {tier.earned && <Badge tone="success">Earned</Badge>}
                </div>

                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--border)]">
                  <div
                    className={`h-full rounded-full transition-[width] duration-700 ease-kl-out ${
                      tier.earned ? "bg-emerald-500" : "bg-accent"
                    }`}
                    style={{ width: `${progress}%` }}
                    role="progressbar"
                    aria-valuenow={progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${tier.name} progress`}
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-text-secondary">
                  {Math.min(summary.confirmed, tier.required)} of {tier.required}
                </p>
              </Card>
            );
          })}
        </div>
      </section>

      <Card className="p-5">
        <h2 className="kl-display flex items-center gap-2 font-bold text-text-primary">
          <Info size={16} className="text-accent" aria-hidden />
          What counts as a referral
        </h2>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-text-secondary">
          <li>A friend counts once they register with your code <em>and</em> sign in. Sharing a link or a click never counts on its own.</li>
          <li>One account per phone number, so the same person cannot be counted twice.</li>
          <li>You cannot refer yourself, and duplicate or suspicious sign-ups are reviewed before any reward is paid.</li>
          <li>Rewards are added to your account automatically the moment a tier is reached.</li>
        </ul>
      </Card>
    </div>
  );
}

function rewardLabel(days: number): string {
  if (days >= 365) return "1 year of Premium";
  if (days % 30 === 0) return `${days / 30} ${days === 30 ? "month" : "months"} of Premium`;
  return `${days} days of Premium`;
}
