import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";

/**
 * Anonymous, session-free client for genuinely public data — plan prices,
 * support contacts, the leaderboard.
 *
 * Kept separate from the cookie-bound server client for one specific reason:
 * `unstable_cache` refuses to wrap anything that reads cookies, and these
 * queries are exactly the ones worth caching. Still the anon key, so still
 * subject to RLS; the policies for these tables already allow public reads.
 */
export function createSupabasePublicClient() {
  return createClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
