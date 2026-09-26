"use client";

/**
 * Checkout return notice (suggestions pass 6/10) — one-time toast when
 * the browser returns from Stripe Checkout with ?checkout=success or
 * ?checkout=canceled. The plan state itself arrives via the Stripe
 * webhook (asynchronously), so the copy says exactly that instead of
 * claiming the plan already flipped. Fires once per mount (StrictMode
 * safe) and strips the query param so a refresh doesn't re-toast.
 */

import { Suspense, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

import { useToast } from "@/components/ui/toast";

function CheckoutNoticeInner() {
  const searchParams = useSearchParams();
  const toast = useToast();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    const result = searchParams.get("checkout");
    if (result !== "success" && result !== "canceled") return;
    fired.current = true;
    if (typeof window !== "undefined") {
      window.history.replaceState({}, "", window.location.pathname);
    }
    toast(
      result === "success"
        ? "Back from Stripe Checkout — the plan activates here as soon as Stripe confirms the payment."
        : "Checkout canceled — nothing was charged."
    );
  }, [searchParams, toast]);

  return null;
}

export function CheckoutNotice() {
  return (
    <Suspense fallback={null}>
      <CheckoutNoticeInner />
    </Suspense>
  );
}
