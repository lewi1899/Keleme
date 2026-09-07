import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Refreshes the Supabase session cookie on every request.
 *
 * This middleware deliberately does NOT make authorization decisions. It only
 * keeps the token fresh and redirects obvious unauthenticated traffic away
 * from private routes so students see a sign-in page rather than a flash of
 * empty UI. The real gates are `requireUser`/`requireAdmin` in the page layer
 * and, underneath those, RLS in the database — a middleware check alone would
 * be bypassable by anything that talks to the API directly.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: request.headers } });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  // getUser() rather than getSession(): it revalidates the token with the auth
  // server instead of trusting whatever is in the cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPrivate =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/learn") ||
    pathname.startsWith("/matric") ||
    pathname.startsWith("/leaderboard") ||
    pathname.startsWith("/referrals") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/premium");

  if (!user && isPrivate) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Round-trip the destination so the student lands where they were going.
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except Next's static output, the icons, and the service
     * worker — none of which need a session and all of which would pay a
     * pointless auth round trip.
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|offline|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)",
  ],
};
