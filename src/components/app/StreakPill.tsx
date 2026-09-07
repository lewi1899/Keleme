"use client";

import { Flame } from "lucide-react";
import { formatDuration } from "@/lib/format";

/**
 * Streak and today's study time, in the header.
 *
 * The flame animates only when a streak is actually live. A perpetually
 * animating icon becomes wallpaper; one that starts moving the day a streak
 * begins is a reward.
 */
export function StreakPill({ streak, todaySeconds }: { streak: number; todaySeconds: number }) {
  const active = streak > 0;

  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border border-kl-border bg-surface px-3 py-1.5"
      title={`${streak} day streak · ${formatDuration(todaySeconds)} studied today`}
    >
      <Flame
        size={15}
        className={active ? "animate-kl-flame text-orange-500" : "text-text-secondary"}
        aria-hidden
      />
      <span className="text-sm font-bold leading-none text-text-primary">{streak}</span>
      <span className="hidden text-xs leading-none text-text-secondary sm:inline">
        {formatDuration(todaySeconds)} today
      </span>
    </span>
  );
}
