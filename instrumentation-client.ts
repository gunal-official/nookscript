/**
 * Browser-side Sentry (Step 14). Fully optional: with SENTRY_DSN unset the
 * mapped NEXT_PUBLIC_SENTRY_DSN is empty and NO initialization happens —
 * no warnings, no behavior change. (next.config.mjs maps SENTRY_DSN →
 * NEXT_PUBLIC_SENTRY_DSN at build; a DSN is a public ingestion endpoint,
 * not a secret.)
 */
import * as Sentry from "@sentry/nextjs";

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1, // light volume until real traffic informs this
  });
}

// Required regardless of DSN state per @sentry/nextjs v10 (build-time check):
// instruments client-side navigations once initialized; a no-op when the
// SDK was never inited (DSN unset), by SDK design.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
