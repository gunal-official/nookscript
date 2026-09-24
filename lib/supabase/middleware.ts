import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import {
  clientKey,
  RATE_LIMITED_PREFIXES,
  rateLimitExceeded,
} from "@/lib/rate-limit";
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
  "/invoices", // app route — note the S; the PUBLIC form lives at /invoice/<token>
  "/time",
  "/contracts",
  "/reports",
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

  // Step 14 rate limit (extended Steps 15+17): public routes that hit
  // Postgres on every request (/share/* documents, /invite/* token
  // probes, /invoice/* token-gated invoice forms) — capped per-IP.
  // Runs BEFORE the session work so an abuser
  // doesn't even cost an auth lookup. Store: Upstash Redis when the
  // UPSTASH_* env vars are set (shared across instances — Step 24),
  // else the Step 14 in-memory Map (see lib/rate-limit.ts). Login/signup
  // are NOT rate-limited here
  // by design: their auth calls go browser→Supabase directly (never
  // touching this server), so protection belongs to Supabase's dashboard
  // auth limits.
  if (
    RATE_LIMITED_PREFIXES.some((p) => pathname.startsWith(p)) &&
    (await rateLimitExceeded(clientKey(request)))
  ) {
    return new NextResponse(
      "Too many requests — these links are rate limited. Try again in about a minute.",
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

  // Marketing (/, /about, /pricing, /vs/*), /share/*, /invite/*,
  // /invoice/* (public token-gated invoice forms): fully public.
  return supabaseResponse;
}
