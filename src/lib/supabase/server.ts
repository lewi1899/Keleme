import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";

/**
 * Request-scoped client for Server Components, Route Handlers and Server
 * Actions. Still the anon key, still under RLS — the user's session simply
 * travels in cookies instead of in memory.
 */
export function createSupabaseServerClient() {
  const cookieStore = cookies();

  return createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot set cookies. The middleware refreshes the
          // session on every request, so a failure here is harmless — it just
          // means this particular render did not get to write the refreshed
          // token back.
        }
      },
    },
  });
}
