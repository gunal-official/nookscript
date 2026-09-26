/**
 * Next.js instrumentation hook (Step 14). Loads the Sentry server/edge
 * configs ONLY when SENTRY_DSN is configured — with it unset this hook is
 * a no-op and the app behaves exactly as before (OPENAI_API_KEY-style
 * optional feature).
 */
export async function register() {
  if (!process.env.SENTRY_DSN) return;

  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}
