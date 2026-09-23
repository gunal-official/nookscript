import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { clientKey, rateLimitExceeded } from "@/lib/rate-limit";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Authenticated app sections (URL prefixes). Route groups like (app) don't
 * exist at the URL level, so the protected surface is enumerated here.
 * /onboarding requires a session too.
 */
const APP_PREFIXES = [
  "/intake",
  "/briefs",
  "/proposals",
  "/plans",
  "/updates",
  "/settings",
  "/onboarding",
];

/** Auth pages an already-signed-in user should be bounced away from. */
const AUTH_PAGES = ["/login", "/signup"];

function isAppPath(pathname: string): boolean {
  return APP_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

function isAuthPage(pathname: string): boolean {
  return AUTH_PAGES.some((p) => pathname === p);
}

function redirect(request: NextRequest, pathname: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  return NextResponse.redirect(url);
}

export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Step 14 rate limit: /share/* is the only public route that hits
  // Postgres on every request — cap it per-IP. Runs BEFORE the session
  // work so an abuser doesn't even cost an auth lookup. In-memory only:
  // resets on redeploy and doesn't share state across serverless
  // instances (see lib/rate-limit.ts — durable-store upgrade is noted
  // there and in SECURITY.md as future work). Login/signup are NOT
  // rate-limited here by design: their auth calls go browser→Supabase
  // directly (never touching this server), so protection belongs to
  // Supabase's dashboard auth limits.
  if (pathname.startsWith("/share") && rateLimitExceeded(clientKey(request))) {
    return new NextResponse(
      "Too many requests — shared links are rate limited. Try again in about a minute.",
      { status: 429, headers: { "content-type": "text/plain; charset=utf-8" } }
    );
  }

  // Fail closed when Supabase isn't configured: protected pages bounce to
  // /login (whose UI explains the missing env vars); public pages pass.
  if (!isSupabaseConfigured()) {
    if (isAppPath(pathname)) {
      return redirect(request, "/login");
    }
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: do not run code between createServerClient and getUser() —
  // it can cause random logouts (see @supabase/ssr docs).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Logged out → keep out of the app.
  if (!user && isAppPath(pathname)) {
    return redirect(request, "/login");
  }

  // Logged in → keep out of the auth pages.
  if (user && isAuthPage(pathname)) {
    return redirect(request, "/intake");
  }

  // Marketing (/, /about, /pricing, /vs/*) and /share/*: fully public.
  return supabaseResponse;
}
