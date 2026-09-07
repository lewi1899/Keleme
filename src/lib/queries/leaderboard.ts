import "server-only";

import { unstable_cache } from "next/cache";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import type { LeaderboardRow } from "@/lib/database.types";

/**
 * Cached leaderboard.
 *
 * Load testing found this to be the app's only real bottleneck: the weekly
 * board costs ~84ms of database time, and under 20 concurrent viewers
 * throughput collapsed to 30 requests/second with 702ms latency, while every
 * other page held 1,800/second. Aggregating a week of activity for 100,000
 * students is simply expensive, and it was being redone for every viewer.
 *
 * It also does not need to be: this is a WEEKLY ranking. A student refreshing
 * twice in a minute has no expectation of seeing a different order, and study
 * time recorded in the last sixty seconds moving someone one place is not
 * information anyone is waiting on.
 *
 * So the ranking is computed once per minute and shared. One database query
 * per minute serves any number of viewers, which removes the ceiling entirely.
 *
 * The rows are fetched with the session-free public client, so `is_me` comes
 * back false for everyone — it is derived per request in the page instead,
 * from the caller's own session. That is what makes one cached copy correct
 * for all viewers: nothing user-specific is baked into it.
 */
export const LEADERBOARD_TAG = "leaderboard";

async function fetchLeaderboard(scope: string, limit: number): Promise<LeaderboardRow[]> {
  const supabase = createSupabasePublicClient();
  const { data, error } = await supabase.rpc("get_leaderboard", {
    p_scope: scope,
    p_limit: limit,
    p_offset: 0,
  });

  // A failed fetch renders an empty board rather than a 500. The leaderboard
  // is motivational, not load-bearing.
  if (error || !data) return [];
  return data as LeaderboardRow[];
}

export const getCachedLeaderboard = unstable_cache(
  fetchLeaderboard,
  ["leaderboard"],
  { revalidate: 60, tags: [LEADERBOARD_TAG] }
);
