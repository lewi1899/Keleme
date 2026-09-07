import Link from "next/link";
import {
  ArrowRight, BookOpen, Clock, Crown, FileText, Flame, GraduationCap,
  Megaphone, PlayCircle, Sparkles, Trophy,
} from "lucide-react";
import { requireUser } from "@/lib/session";
import {
  getContinueStudying, getLiveAnnouncements, getMyRank, getSubjectsForGrade, getWeeklySeconds,
} from "@/lib/queries/student";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge, TierBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { formatDuration, formatRelativeDays, ordinal } from "@/lib/format";
import type { ContentItem } from "@/lib/database.types";

export const metadata = { title: "Home" };
export const dynamic = "force-dynamic";

/** Daily study target used for the ring. Deliberately modest and reachable. */
const DAILY_GOAL_SECONDS = 30 * 60;

const TYPE_ICON: Record<ContentItem["content_type"], React.ReactNode> = {
  html: <FileText size={15} />,
  pdf: <BookOpen size={15} />,
  youtube: <PlayCircle size={15} />,
  other: <Sparkles size={15} />,
};

export default async function DashboardPage() {
  const session = await requireUser();
  const { profile } = session;

  // Five independent reads, issued together. Sequentially this page would wait
  // on five round trips before painting anything.
  const [continueItems, subjects, weekly, rank, announcements] = await Promise.all([
    getContinueStudying(4),
    getSubjectsForGrade(profile.grade),
    getWeeklySeconds(),
    getMyRank("weekly"),
    getLiveAnnouncements(2),
  ]);

  const firstName = profile.full_name.split(" ")[0];
  const goalPct = Math.min(100, Math.round((weekly.today / DAILY_GOAL_SECONDS) * 100));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="kl-display text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
            {greeting()}, {firstName}
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            {continueItems.length > 0
              ? "Pick up where you left off."
              : `Everything for Grade ${profile.grade}, ready when you are.`}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {session.is_premium && <Badge tone="premium" icon={<Crown size={12} />}>Premium</Badge>}
          {session.is_matric && <Badge tone="matric" icon={<GraduationCap size={12} />}>Matric package</Badge>}
          {!session.is_premium && (
            <Link href="/premium">
              <Button size="sm" icon={<Crown size={15} />}>Go Premium</Button>
            </Link>
          )}
        </div>
      </header>

      {announcements.map((announcement) => (
        <Card
          key={announcement.id}
          className={`flex gap-3 p-4 ${
            announcement.level === "critical"
              ? "border-red-500/40"
              : announcement.level === "warning"
              ? "border-amber-500/40"
              : ""
          }`}
        >
          <Megaphone size={17} className="mt-0.5 shrink-0 text-accent" aria-hidden />
          <div>
            <p className="font-semibold text-text-primary">{announcement.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-text-secondary">{announcement.body}</p>
          </div>
        </Card>
      ))}

      {/* ------------------------------------------------------------- stats */}
      <div className="kl-stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="flex items-center gap-4 p-5" style={{ ["--kl-i" as string]: 0 }}>
          <ProgressRing
            value={weekly.today}
            max={DAILY_GOAL_SECONDS}
            label={
              <>
                <span className="kl-display text-base font-extrabold text-text-primary">{goalPct}%</span>
              </>
            }
            sublabel="of today's goal"
          />
          <div className="min-w-0">
            <p className="text-xs font-medium text-text-secondary">Today</p>
            <p className="kl-display truncate text-xl font-bold text-text-primary">
              {formatDuration(weekly.today)}
            </p>
            <p className="mt-0.5 text-[11px] text-text-secondary">Goal {formatDuration(DAILY_GOAL_SECONDS)}</p>
          </div>
        </Card>

        <StatCard
          icon={<Flame size={17} className={profile.current_streak > 0 ? "animate-kl-flame text-orange-500" : ""} />}
          label="Current streak"
          value={`${profile.current_streak} ${profile.current_streak === 1 ? "day" : "days"}`}
          hint={profile.longest_streak > 0 ? `Best: ${profile.longest_streak} days` : "Study 5 minutes to start"}
          index={1}
        />

        <StatCard
          icon={<Clock size={17} />}
          label="This week"
          value={formatDuration(weekly.week)}
          hint="Counts toward the weekly prize"
          index={2}
        />

        <StatCard
          icon={<Trophy size={17} />}
          label="Weekly rank"
          value={rank.rank ? ordinal(rank.rank) : "Unranked"}
          hint={rank.rank ? "Top ten win prizes" : "Study this week to be ranked"}
          index={3}
          href="/leaderboard"
        />
      </div>

      {/* ---------------------------------------------------------- continue */}
      {continueItems.length > 0 && (
        <Card className="p-5">
          <CardHeader
            icon={<Clock size={17} />}
            title="Continue studying"
            action={
              <Link href="/learn" className="text-sm font-semibold text-accent hover:underline">
                All subjects
              </Link>
            }
          />
          <div className="kl-stagger grid gap-2.5 sm:grid-cols-2">
            {continueItems.map((item, i) => (
              <Link
                key={item.content_id}
                href={`/learn/content/${item.content_id}`}
                style={{ ["--kl-i" as string]: i }}
                className="kl-interactive flex items-center gap-3 rounded-xl border border-kl-border p-3"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
                  {TYPE_ICON[item.content_type]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-text-primary">{item.title}</span>
                  <span className="block truncate text-xs text-text-secondary">
                    {item.subject_name ?? `Grade ${item.grade}`} · {formatRelativeDays(item.last_opened_at)}
                  </span>
                </span>
                <TierBadge tier={item.access_tier} />
              </Link>
            ))}
          </div>
        </Card>
      )}

      {/* ---------------------------------------------------------- subjects */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="kl-display text-lg font-bold text-text-primary">Your subjects</h2>
          <Link href="/learn" className="text-sm font-semibold text-accent hover:underline">
            Browse all
          </Link>
        </div>

        {subjects.length === 0 ? (
          <EmptyState
            icon={<BookOpen size={20} />}
            title="No subjects yet"
            description={`Grade ${profile.grade} subjects will appear here as soon as your teachers publish them.`}
          />
        ) : (
          <div className="kl-stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {subjects.map((subject, i) => (
              <Link
                key={subject.id}
                href={`/learn/subject/${subject.id}`}
                style={{ ["--kl-i" as string]: i }}
                className="kl-interactive kl-surface flex items-center gap-3 rounded-2xl border p-4 shadow-kl-card"
              >
                <span
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-bold text-white"
                  style={{ backgroundColor: subject.color }}
                  aria-hidden
                >
                  {subject.name.slice(0, 2)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-text-primary">{subject.name}</span>
                  <span className="block text-xs text-text-secondary">
                    {subject.content_count === 0
                      ? "Nothing published yet"
                      : `${subject.content_count} ${subject.content_count === 1 ? "item" : "items"}`}
                  </span>
                </span>
                <ArrowRight size={15} className="shrink-0 text-text-secondary" aria-hidden />
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Grade 12 gets a matric entry point; other grades never see it, because
          the package is not sold to them. */}
      {profile.grade === 12 && (
        <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-violet-500/12 text-violet-600">
              <GraduationCap size={20} />
            </span>
            <div>
              <p className="kl-display font-bold text-text-primary">Matric papers</p>
              <p className="mt-0.5 max-w-md text-sm leading-relaxed text-text-secondary">
                {session.is_matric
                  ? "Practise real past papers by year and subject, with answers and explanations."
                  : "Every past matric and model paper, with the correct answer and an explanation for each question."}
              </p>
            </div>
          </div>
          <Link href="/matric">
            <Button variant={session.is_matric ? "primary" : "secondary"} icon={<ArrowRight size={16} />}>
              {session.is_matric ? "Start practising" : "See what's inside"}
            </Button>
          </Link>
        </Card>
      )}
    </div>
  );
}

function StatCard({
  icon, label, value, hint, index, href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  index: number;
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-center gap-2 text-text-secondary">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent-soft text-accent">{icon}</span>
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="kl-display mt-3 text-xl font-bold text-text-primary">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-text-secondary">{hint}</p>}
    </>
  );

  return href ? (
    <Card interactive className="p-5" style={{ ["--kl-i" as string]: index }} as={Link} {...({ href } as object)}>
      {body}
    </Card>
  ) : (
    <Card className="p-5" style={{ ["--kl-i" as string]: index }}>
      {body}
    </Card>
  );
}

function greeting(): string {
  // Addis Ababa time, not the server's — a student in Ethiopia should not be
  // greeted with "Good evening" at breakfast because the host runs on UTC.
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Addis_Ababa",
      hour: "numeric",
      hour12: false,
    }).format(new Date())
  );
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
