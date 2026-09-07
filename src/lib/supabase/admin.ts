import "server-only";

import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";

/**
 * Service-role client. **Bypasses every RLS policy.**
 *
 * The `server-only` import above makes importing this file from a client
 * component a build error rather than a runtime surprise.
 *
 * Legitimate uses are narrow and all of them are places where the database
 * cannot know the answer on its own:
 *
 *   - signing URLs for private storage objects, after the caller's entitlement
 *     has already been checked
 *   - the payment webhook, which arrives with no user session at all
 *   - session revocation, which by definition acts on a session other than the
 *     caller's
 *   - the seed script
 *
 * Anything else belongs on the anon client under RLS. If you find yourself
 * reaching for this to "make a query work", the policy is the thing to fix.
 */
export function createAdminClient() {
  const env = serverEnv();
  return createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
