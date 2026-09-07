/**
 * Environment access, validated once at module load.
 *
 * The split between the two exports is a security boundary, not a style
 * choice: `publicEnv` holds only NEXT_PUBLIC_* values, which Next.js inlines
 * into the client bundle. The service-role key is read exclusively through
 * `serverEnv()`, which throws if it is ever reached from the browser — so a
 * careless import in a client component fails loudly at build time instead of
 * shipping a key that bypasses every RLS policy in the database.
 */

function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example to .env.local and fill it in.`
    );
  }
  return value;
}

export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
};

export function assertPublicEnv() {
  required("NEXT_PUBLIC_SUPABASE_URL", publicEnv.supabaseUrl);
  required("NEXT_PUBLIC_SUPABASE_ANON_KEY", publicEnv.supabaseAnonKey);
}

export function serverEnv() {
  if (typeof window !== "undefined") {
    throw new Error("serverEnv() was called in the browser. This would leak the service-role key.");
  }
  return {
    supabaseUrl: required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabaseAnonKey: required("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    serviceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY),
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  };
}
