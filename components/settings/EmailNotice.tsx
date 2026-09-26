"use client";

/**
 * Mailbox connect return notice (future-list item "Gmail/Outlook") —
 * one-time toast when the browser returns from the provider consent
 * screen via /api/email/callback (?email=connected or ?email=error=…).
 * Mirrors the CheckoutNotice contract: fires once per mount
 * (StrictMode safe), strips the query param so a refresh doesn't
 * re-toast, and shows an ACTIONABLE reason for every error kind.
 */

import { Suspense, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

import { useToast } from "@/components/ui/toast";

const ERROR_COPY: Record<string, string> = {
  canceled: "Provider sign-in was canceled — nothing was connected.",
  not_configured:
    "Connect failed — the provider's client id/secret (and token-encryption key) must be set on the server. See the Mailbox card for the exact env.",
  token_key:
    "Connect failed — EMAIL_TOKEN_ENCRYPTION_KEY (64 hex chars) is not set on the server.",
  service:
    "Connect failed — SUPABASE_SERVICE_ROLE_KEY is not set on the server (the callback uses it to store the connection).",
  state:
    "Connect failed — the security token didn't validate. Check your clock and try again.",
  exchange:
    "Connect failed — the provider didn't return tokens (the code may have expired). Try again.",
  reauth:
    "The provider didn't return a refresh token — re-run the connect and grant access when asked.",
  auth: "You need to be signed in to connect a mailbox.",
  forbidden: "Only the workspace owner can connect a mailbox.",
};

function EmailNoticeInner() {
  const searchParams = useSearchParams();
  const toast = useToast();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    const value = searchParams.get("email");
    if (!value) return;
    fired.current = true;
    if (typeof window !== "undefined") {
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (value === "connected") {
      toast("Mailbox connected — sync it from Settings, or let the cron sweep keep it fresh.");
      return;
    }
    const detail = value.startsWith("error=") ? value.slice(6) : value;
    toast(ERROR_COPY[detail] ?? "Mailbox connection did not complete — try again.");
  }, [searchParams, toast]);

  return null;
}

export function EmailNotice() {
  return (
    <Suspense fallback={null}>
      <EmailNoticeInner />
    </Suspense>
  );
}
