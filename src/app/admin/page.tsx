import Link from "next/link";
import {
  AlertTriangle, BookOpen, Clock, CreditCard, Crown, FileText, Flame,
  GraduationCap, TrendingUp, Users,
} from "lucide-react";
import { requireStaff } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { AdminPageHeader, StatTile } from "@/components/admin/AdminPage";
import { formatBirr, formatDuration } from "@/lib/format";

export const metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

interface Metrics {
  students: {
    total: number; new_today: number; new_this_week: number;
    suspended: number; active_7d: number; with_streak: number;
  };
  entitlements: { premium: number; matric: number; expiring_7d: number };
  content: {
    total: number; published: number; draft: number; free: number;
    premium: number; html: number; pdf: number; youtube: number;
  };
  matric_questions: { total: number; published: number };
  study: { seconds_today: number; seconds_week: number; learners_today: number };
  referrals: { confirmed: number; pending: number; flagged: number; rewards_paid: number };
  payments: { pending: number; paid_this_month: number; revenue_this_month: number };
  grade_distribution: Record<string, number>;
  top_schools: { school: string; students: number }[];
}

export default async function AdminOverviewPage() {
  const session = await requireStaff();
  const supabase = createSupabaseServerClient();

  const { data } = await supabase.rpc("admin_dashboard_metrics");
  const metrics = data as Metrics | null;

  if (!metrics) {
    return (
      <>
        <AdminPageHeader title="Overview" />
        <Card className="p-6">
          <p className="text-sm text-text-secondary">
            Metrics could not be loaded. Check that the migrations have been applied to this
            Supabase project.
          </p>
        </Card>
      </>
    );
  }

  const isAdmin = session.profile.role === "admin";
  const grades = [9, 10, 11, 12];
  const maxGrade = Math.max(1, ...grades.map((g) => metrics.grade_distribution[String(g)] ?? 0));

  return (
    <>
      <AdminPageHeader
        title={`Welcome, ${session.profile.full_name.split(" ")[0]}`}
        description="Everything happening on KELEME right now."
      />

      {/* Things needing a human decision are surfaced first — an admin opening
          this page wants to know what is waiting for them, not scroll to it. */}
      {isAdmin && (metrics.payments.pending > 0 || metrics.referrals.flagged > 0) && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          {metrics.payments.pending > 0 && (
            <Card className="flex items-center justify-between gap-3 border-amber-500/40 p-4">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-500/12 text-amber-600">
                  <CreditCard size={17} />
                </span>
                <div>
                  <p className="font-semibold text-text-primary">
                    {metrics.payments.pending} payment{metrics.payments.pending === 1 ? "" : "s"} awaiting confirmation
                  </p>
                  <p className="text-xs text-text-secondary">Students are waiting for access.</p>
                </div>
              </div>
              <Link href="/admin/payments">
                <Button size="sm">Review</Button>
              </Link>
            </Card>
          )}

          {metrics.referrals.flagged > 0 && (
            <Card className="flex items-center justify-between gap-3 border-amber-500/40 p-4">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-500/12 text-amber-600">
                  <AlertTriangle size={17} />
                </span>
                <div>
                  <p className="font-semibold text-text-primary">
                    {metrics.referrals.flagged} referral{metrics.referrals.flagged === 1 ? "" : "s"} flagged
                  </p>
                  <p className="text-xs text-text-secondary">Unusual sign-up rate — worth a look.</p>
                </div>
              </div>
              <Link href="/admin/referrals">
                <Button size="sm" variant="secondary">Review</Button>
              </Link>
            </Card>
          )}
        </div>
      )}

      <section className="kl-stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          index={0} icon={<Users size={16} />} tone="accent"
          label="Students" value={metrics.students.total.toLocaleString()}
          hint={`+${metrics.students.new_this_week} this week`}
        />
        <StatTile
          index={1} icon={<Flame size={16} />} tone="warning"
          label="Active this week" value={metrics.students.active_7d.toLocaleString()}
          hint={`${metrics.students.with_streak} on a streak`}
        />
        <StatTile
          index={2} icon={<Crown size={16} />} tone="success"
          label="Premium" value={metrics.entitlements.premium.toLocaleString()}
          hint={`${metrics.entitlements.matric} on the matric package`}
        />
        <StatTile
          index={3} icon={<Clock size={16} />}
          label="Studied today" value={formatDuration(metrics.study.seconds_today)}
          hint={`${metrics.study.learners_today} students`}
        />
      </section>

      <section className="kl-stagger mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          index={0} icon={<FileText size={16} />}
          label="Published content" value={metrics.content.published.toLocaleString()}
          hint={`${metrics.content.draft} draft${metrics.content.draft === 1 ? "" : "s"}`}
        />
        <StatTile
          index={1} icon={<GraduationCap size={16} />}
          label="Matric questions" value={metrics.matric_questions.published.toLocaleString()}
          hint={`${metrics.matric_questions.total - metrics.matric_questions.published} unpublished`}
        />
        <StatTile
          index={2} icon={<Users size={16} />}
          label="Referrals confirmed" value={metrics.referrals.confirmed.toLocaleString()}
          hint={`${metrics.referrals.rewards_paid} rewards paid`}
        />
        {isAdmin && (
          <StatTile
            index={3} icon={<TrendingUp size={16} />} tone="success"
            label="Revenue this month" value={formatBirr(metrics.payments.revenue_this_month)}
            hint={`${metrics.payments.paid_this_month} payment${metrics.payments.paid_this_month === 1 ? "" : "s"}`}
          />
        )}
      </section>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="kl-display font-bold text-text-primary">Students by grade</h2>
          <div className="mt-4 space-y-3">
            {grades.map((grade) => {
              const count = metrics.grade_distribution[String(grade)] ?? 0;
              return (
                <div key={grade}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium text-text-primary">Grade {grade}</span>
                    <span className="tabular-nums text-text-secondary">{count.toLocaleString()}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[var(--border)]">
                    <div
                      className="h-full rounded-full bg-accent transition-[width] duration-700 ease-kl-out"
                      style={{ width: `${Math.round((count / maxGrade) * 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="kl-display font-bold text-text-primary">Top schools</h2>
          <p className="mt-0.5 text-xs text-text-secondary">
            By registered students — the basis for school-level rewards.
          </p>
          {metrics.top_schools.length === 0 ? (
            <p className="mt-4 text-sm text-text-secondary">No students registered yet.</p>
          ) : (
            <ol className="mt-4 space-y-2">
              {metrics.top_schools.map((school, i) => (
                <li key={school.school} className="flex items-center gap-3">
                  <span className="w-5 shrink-0 text-xs font-bold tabular-nums text-text-secondary">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-text-primary">{school.school}</span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-text-primary">
                    {school.students}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <QuickLink href="/admin/content" icon={<FileText size={17} />} label="Add content" />
        <QuickLink href="/admin/matric" icon={<GraduationCap size={17} />} label="Matric questions" />
        {isAdmin && <QuickLink href="/admin/plans" icon={<BookOpen size={17} />} label="Change prices" />}
        {isAdmin && <QuickLink href="/admin/rewards" icon={<Crown size={17} />} label="Weekly rewards" />}
      </div>
    </>
  );
}

function QuickLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Card
      interactive
      as={Link}
      {...({ href } as object)}
      className="flex items-center gap-3 p-4"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">{icon}</span>
      <span className="text-sm font-semibold text-text-primary">{label}</span>
    </Card>
  );
}
