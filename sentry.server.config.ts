// Server-side Sentry init (Step 14), imported by instrumentation.ts only
// when SENTRY_DSN is set. Guarded here too (register() calls this lazily).
import * as Sentry from "@sentry/nextjs";

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.1,
  });
}
