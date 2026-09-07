import Link from "next/link";
import { Crown, Eye, EyeOff, Flame, Info, Medal, Trophy } from "lucide-react";
import { requireUser } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDuration, ordinal } from "@/lib/format";
import type { LeaderboardRow } from "@/lib/database.types";

export const metadata = { title: "Leaderboard" };
export const dynamic = "force-dynamic";

const SCOPES = [
  { id: "weekly", label: "This week" },
  { id: "monthly", label: "This month" },
  { id: "all", label: "All time" },
] as const;

type Scope = (typeof SCOPES)[number]["id"];

export default async function LeaderboardPage({ searchParams }: { searchParams: { scope?: string } }) {
  const session = await requireUser();
  const scope: Scope = SCOPES.some((s) => s.id === searchParams.scope)
    ? (searchParams.scope as Scope)
    : "weekly";

  const supabase = createSupabaseServerClient();
  const [{ data: rows }, { data: myRank }] = await Promise.all([
    supabase.rpc("get_leaderboard", { p_scope: scope, p_limit: 50, p_offset: 0 }),
    supabase.rpc("get_my_rank", { p_scope: scope }),
  ]);

  const entries = (rows ?? []) as LeaderboardRow[];
  const mine = myRank as { rank: number | null; seconds: number; streak: number } | null;
  const podium = entries.slice(0, 3);
  const rest = entries.slice(3);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="kl-display text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
          Leaderboard
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-text-secondary">
          Ranked by time actually spent studying. The top ten each week win a prize.
        </p>
      </header>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Leaderboard period">
        {SCOPES.map((s) => (
          <Link
            key={s.id}
            href={s.id === "weekly" ? "/leaderboard" : `/leaderboard?scope=${s.id}`}
            role="tab"
            aria-selected={s.id === scope}
            className={`kl-press rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors ${
              s.id === scope
                ? "border-accent bg-accent text-[var(--accent-contrast)]"
                : "border-kl-border text-text-secondary hover:bg-accent-soft hover:text-text-primary"
            }`}
          >
            {s.label}
          </Link>
        ))}
      </div>

      {/* Your own standing, pinned. Scrolling fifty rows to find yourself is
          the single most annoying thing a leaderboard can do. */}
      <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-accent-soft">
            <span className="kl-display text-sm font-extrabold text-accent">
              {mine?.rank ? `#${mine.rank}` : "—"}
            </span>
          </span>
          <div>
            <p className="font-semibold text-text-primary">Your position</p>
            <p className="text-sm text-text-secondary">
              {mine?.rank
                ? `${ordinal(mine.rank)} · ${formatDuration(mine.seconds)} studied`
                : "Study this week to join the ranking"}
            </p>
          </div>
        </div>

        <Badge tone={session.profile.leaderboard_opt_in ? "success" : "neutral"}
               icon={session.profile.leaderboard_opt_in ? <Eye size={12} /> : <EyeOff size={12} />}>
          {session.profile.leaderboard_opt_in ? "Name visible" : "Anonymous"}
        </Badge>
      </Card>

      {!session.profile.leaderboard_opt_in && (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="flex items-start gap-2 text-sm text-text-secondary">
            <Info size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden />
            You appear as{" "}
            <span className="font-semibold text-text-primary">
              Student #{String(session.profile.public_no).padStart(4, "0")}
            </span>
            . Your real name is never shown unless you turn it on.
          </p>
          <Link href="/settings">
            <Button size="sm" variant="secondary">Show my name</Button>
          </Link>
        </Card>
      )}

      {entries.length === 0 ? (
        <EmptyState
          icon={<Trophy size={20} />}
          title="Nobody has studied yet this period"
          description="Be the first. Five minutes of study puts you on the board."
        />
      ) : (
        <>
          {podium.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-3">
              {/* Second, first, third — so first place sits in the middle and
                  raised, the way a podium reads. */}
              {[podium[1], podium[0], podium[2]].filter(Boolean).map((entry) => (
                <PodiumCard key={entry.user_id} entry={entry} />
              ))}
            </div>
          )}

          {rest.length > 0 && (
            <Card className="divide-y divide-[var(--border)] overflow-hidden p-0">
              {rest.map((entry) => (
                <div
                  key={entry.user_id}
                  className={`flex items-center gap-3 px-4 py-3 ${entry.is_me ? "bg-accent-soft" : ""}`}
                >
                  <span className="w-8 shrink-0 text-sm font-bold tabular-nums text-text-secondary">
                    {entry.rank}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-text-primary">
                      {entry.display_name}
                      {entry.is_me && <span className="ml-1.5 text-xs font-semibold text-accent">you</span>}
                    </span>
                    <span className="block text-xs text-text-secondary">Grade {entry.grade}</span>
                  </span>
                  <span className="flex items-center gap-1 text-xs font-medium text-text-secondary">
                    <Flame size={12} className={entry.streak > 0 ? "text-orange-500" : ""} aria-hidden />
                    {entry.streak}
                  </span>
                  <span className="w-16 shrink-0 text-right text-sm font-semibold tabular-nums text-text-primary">
                    {formatDuration(entry.seconds)}
                  </span>
                </div>
              ))}
            </Card>
          )}
        </>
      )}

      <Card className="p-5">
        <h2 className="kl-display flex items-center gap-2 font-bold text-text-primary">
          <Trophy size={16} className="text-amber-500" aria-hidden />
          How the ranking works
        </h2>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-text-secondary">
          <li>Time is measured on our servers while you are actively studying — not by how long a tab is left open.</li>
          <li>A single stretch of inactivity credits at most 90 seconds, and no more than 12 hours count in a day.</li>
          <li>Opening the app in several tabs does not multiply your time; one account has one study session.</li>
          <li>Your real name appears only if you turn it on in Settings. Everyone else is a Student number.</li>
        </ul>
      </Card>
    </div>
  );
}

function PodiumCard({ entry }: { entry: LeaderboardRow }) {
  const medal =
    entry.rank === 1
      ? { icon: <Crown size={18} />, tone: "text-amber-500", ring: "ring-amber-400/40" }
      : entry.rank === 2
      ? { icon: <Medal size={18} />, tone: "text-slate-400", ring: "ring-slate-400/40" }
      : { icon: <Medal size={18} />, tone: "text-orange-600", ring: "ring-orange-500/40" };

  return (
    <Card
      className={`p-5 text-center ${entry.rank === 1 ? "sm:-translate-y-2" : ""} ${
        entry.is_me ? "ring-2 ring-accent" : `ring-1 ${medal.ring}`
      }`}
    >
      <span className={`inline-flex ${medal.tone}`}>{medal.icon}</span>
      <p className="kl-display mt-1 text-2xl font-extrabold text-text-primary">{ordinal(entry.rank)}</p>
      <p className="mt-2 truncate text-sm font-semibold text-text-primary">
        {entry.display_name}
        {entry.is_me && <span className="ml-1 text-xs text-accent">you</span>}
      </p>
      <p className="mt-0.5 text-xs text-text-secondary">Grade {entry.grade}</p>
      <p className="kl-display mt-3 text-lg font-bold text-accent">{formatDuration(entry.seconds)}</p>
      <p className="mt-1 flex items-center justify-center gap-1 text-xs text-text-secondary">
        <Flame size={11} className={entry.streak > 0 ? "text-orange-500" : ""} aria-hidden />
        {entry.streak} day streak
      </p>
    </Card>
  );
}
