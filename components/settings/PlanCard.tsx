/**
 * Plan & billing (Step 34(b), billing live in the events/webhooks
 * foundation phase; global multi-currency 2026-09-26) — the
 * subscription surface reflects REAL state from billing_subscriptions
 * (row absent = Free, 'active' = Pro; the Stripe webhooks own those
 * transitions). Upgrade = hosted Stripe Checkout (test-mode keys) in
 * the currency the owner picks; when billing env is absent the early
 * access mailto remains as the honest fallback. Prices shown are the
 * operator's STRIPE_PRICES config (display data) — the charged amount
 * is always Stripe's.
 */

import Link from "next/link";
import { ArrowRight, Check, CreditCard, Sparkles } from "lucide-react";

import { ManageBillingButton } from "@/components/settings/ManageBillingButton";
import { formatPrice, type StripePriceConfig } from "@/lib/stripe";
import { PlanCheckoutButton } from "@/components/settings/PlanCheckoutButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/** Condensed from the Free tier on /pricing (same voice, no new claims). */
const INCLUDED = [
  "Team invites — owner, member, viewer",
  "Intake → briefs → proposals → plans → updates",
  "Invoices & contracts + signed outbound webhooks",
  "Share links, templates, inbox threading, edit history",
];

const PRO_PLANNED = [
  "Custom domains for share links — planned",
  "Custom role tiers — planned",
  "Priority support — planned",
];

const PRO_MAILTO =
  "mailto:hello@nookscript.dev?subject=nookscript%20Pro%20early%20access";

export function PlanCard({
  memberCount,
  templateCount,
  plan,
  billingConfigured,
  prices,
  billing,
}: {
  memberCount: number;
  templateCount: number;
  plan: "free" | "pro";
  billingConfigured: boolean;
  prices: StripePriceConfig[];
  billing: {
    status: string;
    currency: string | null;
    amount: number | null;
  } | null;
}) {
  const isPro = plan === "pro";
  return (
    <Card className="animate-rise-in" data-proof="plan">
      <CardHeader className="space-y-1 border-b border-border px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="icon-chip icon-chip-muted h-8 w-8">
            <CreditCard className="h-4 w-4" aria-hidden="true" />
          </span>
          <CardTitle className="text-base">Plan</CardTitle>
        </div>
        <CardDescription>
          Subscription and billing for NookScript itself — real plan state,
          checkout via Stripe in the currency you choose.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 p-5">
        {/* Current plan + usage */}
        <div className="flex flex-wrap items-center gap-3">
          <p className="font-display text-2xl font-bold tracking-tight">
            {isPro ? "Pro" : "Free"}
          </p>
          {isPro ? (
            <Badge className="border-accent bg-accent-soft text-accent">
              Active
            </Badge>
          ) : (
            <Badge className="border-accent bg-accent-soft text-accent">
              Early access
            </Badge>
          )}
          <p className="w-full text-sm text-muted-foreground sm:w-auto">
            {isPro && billing?.currency && billing.amount != null
              ? `${formatPrice(billing.amount, billing.currency)} ${billing.currency} · `
              : ""}
            {memberCount} member{memberCount === 1 ? "" : "s"} ·{" "}
            {templateCount} template{templateCount === 1 ? "" : "s"} · 1
            workspace
          </p>
        </div>
        <ul className="space-y-2">
          {INCLUDED.map((feature) => (
            <li key={feature} className="flex gap-2.5 text-sm">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>

        {/* Pro (roadmap) + the honest upgrade path */}
        <div className="space-y-3 border-t border-border pt-5">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="icon-chip icon-chip-accent h-8 w-8">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </span>
            <p className="font-display text-base font-bold">Pro</p>
            <Badge variant="secondary">Roadmap</Badge>
          </div>
          <ul className="space-y-2">
            {PRO_PLANNED.map((feature) => (
              <li key={feature} className="flex gap-2.5 text-sm text-muted-foreground">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            {isPro ? (
              billingConfigured ? (
                <ManageBillingButton />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Your workspace is on Pro — billing is managed through your
                  Stripe receipt.
                </p>
              )
            ) : billingConfigured ? (
              <PlanCheckoutButton prices={prices} />
            ) : (
              <Button asChild variant="outline">
                <a href={PRO_MAILTO} className="inline-flex min-h-11 min-w-11 items-center">
                  Request access
                </a>
              </Button>
            )}
            <Link
              href="/pricing"
              className="inline-flex min-h-11 min-w-11 items-center gap-1.5 text-sm text-accent underline-offset-2 hover:underline"
            >
              Compare plans
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <p className="text-xs text-muted-foreground">
            {isPro
              ? "Manage or cancel the subscription anytime in the Stripe billing portal — the plan flips back to Free when the subscription ends."
              : billingConfigured
                ? "Pick a currency, then upgrade opens Stripe Checkout (test mode). The plan updates here once Stripe confirms payment."
                : "Changing plans is by request until billing is configured — early users keep Free exactly as it is today. Nothing to cancel, ever."}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
