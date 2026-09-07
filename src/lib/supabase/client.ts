"use client";

import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";

/**
 * Browser client. Carries the anon key and the signed-in user's JWT, so every
 * query it makes is subject to RLS — which is exactly the point. There is no
 * privileged browser client anywhere in this codebase.
 */
export function createClient() {
  return createBrowserClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey);
}
