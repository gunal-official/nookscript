// Edge-runtime Sentry init (Step 14) — covers middleware. Imported by
// instrumentation.ts only when SENTRY_DSN is set; inert otherwise.
import * as Sentry from "@sentry/nextjs";

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.1,
  });
}
