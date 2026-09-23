import { withSentryConfig } from "@sentry/nextjs/config";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Expose the Sentry DSN to the browser under the NEXT_PUBLIC_* prefix
  // without needing a second documented variable. A DSN is a public
  // ingestion endpoint by design (it can't read data, only submit events).
  env: {
    NEXT_PUBLIC_SENTRY_DSN: process.env.SENTRY_DSN ?? "",
  },

  // Step 14 — security headers. Production only: in dev, Next's HMR/websockets
  // and HSTS-on-localhost make a strict policy actively harmful, so the
  // header set is empty when NODE_ENV is development.
  async headers() {
    if (process.env.NODE_ENV === "development") return [];

    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // /share/* is never intended to be embedded anywhere; DENY is safe.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // Next.js App Router hydration needs inline bootstrap scripts;
              // styles include safe-inline for SSR/inlined critical CSS.
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data:",
              "font-src 'self' data:",
              // browser ↔ Supabase Auth/PostgREST (+ realtime websockets)
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
              // NOTE: enabling Sentry later ALSO needs
              //   https://*.ingest.sentry.io
              // added to connect-src for browser event submission.
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

// withSentryConfig enables Sentry's build-time wiring. With no SENTRY_DSN /
// org / auth token configured it is a silent pass-through (silent: true),
// and the runtime init is separately gated in the instrumentation files.
export default withSentryConfig(nextConfig, { silent: true });
