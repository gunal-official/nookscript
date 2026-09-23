"use client";

/**
 * Root-level error boundary (Step 14). Per Next.js App Router convention
 * this REPLACES the root layout when it triggers, so it must render its
 * own <html> and <body> — no Tailwind/globals are guaranteed, hence
 * inline styles only. Reports to Sentry when SENTRY_DSN is configured
 * (lazy import: with it unset, the SDK chunk is never loaded).
 */

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      import("@sentry/nextjs").then((Sentry) => {
        Sentry.captureException(error);
      });
    }
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          fontFamily: "system-ui, sans-serif",
          background: "#faf9f7",
          color: "#191610",
          textAlign: "center",
          padding: "0 16px",
        }}
      >
        <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>
          Something went wrong
        </h2>
        <p style={{ fontSize: 14, color: "#6b665c", marginTop: 8, maxWidth: 320 }}>
          {error.message || "An unexpected error occurred. Please try again."}
        </p>
        <button
          onClick={reset}
          style={{
            marginTop: 20,
            fontSize: 14,
            padding: "8px 16px",
            borderRadius: 6,
            border: "1px solid #e3dfd6",
            background: "#fff",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
