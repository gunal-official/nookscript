import Link from "next/link";
import { CheckCircle2, Sparkles, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatPrice, getPricesConfig } from "@/lib/stripe";

export const metadata: Metadata = {
  title: "Pricing — nookscript",
  description:
    "nookscript pricing: the full pipeline is free — team, templates, webhooks included. Pro is a Stripe-billed subscription in your currency; upgrade from Settings any time.",
};

// Pricing (global multi-currency, 2026-09-26): the amounts shown are
// the operator's STRIPE_PRICES config (display data, major units) — one
// recurring price per currency, created in the Stripe dashboard. The
// charged amount is always Stripe's; if the config is absent the price
// row simply doesn't render (no invented numbers, ever).
// Free list = what is genuinely in the app today (team invites, roles,
// invoices/contracts, activity feed, signed webhooks). Pro = the real
// Stripe subscription; nothing is feature-gated in code yet, so
// forward-looking items are explicitly marked "planned".
const TIERS: {
  name: string;
  icon: LucideIcon;
  chip: string;
  badge?: string;
  blurb: string;
  features: string[];
  cta: { label: string; href: string; primary?: boolean };
}[] = [
  {
    name: "Free",
    icon: CheckCircle2,
    chip: "icon-chip-success",
    blurb: "The full product, as it exists today — early access.",
    features: [
      "Your workspace + team invites (owner, member, viewer)",
      "Intake → briefs (AI or built-in parser)",
      "Proposals → plans → client updates",
      "Invoices & contracts",
      "Activity feed + signed outbound webhooks",
      "Public, revocable share links",
      "Workspace templates",
      "Inbox threading — replies onto brief source threads",
      "Full edit history on briefs",
    ],
    cta: { label: "Sign up free", href: "/signup", primary: true },
  },
  {
    name: "Pro",
    icon: Sparkles,
    chip: "icon-chip-accent",
    badge: "Early access",
    blurb:
      "A Stripe-billed subscription — upgrade from Settings in the currency you choose, cancel any time. The same product today; priority as the roadmap lands.",
    features: [
      "Everything in Free",
      "Billing through Stripe — cards accepted worldwide, pay in your currency",
      "Early builds of whatever ships next",
      "Custom domains for share links — planned",
      "Custom role tiers (admin and beyond) — planned",
      "Priority support — planned",
    ],
    cta: {
      label: "Start free, upgrade in Settings",
      href: "/signup",
    },
  },
];

/**
 * /pricing (Step 13; copy refreshed once Stripe billing went live):
 * two tiers, no printed prices. Free = the real product today (team,
 * roles, webhooks, activity included). Pro = the live Stripe
 * subscription — checkout happens in-app (Settings → Plan card), so the
 * Pro CTA routes to signup and the blurb states where the upgrade lives.
 */
export default function PricingPage() {
  const pricesConfig = getPricesConfig();
  const proPrices = pricesConfig.ok ? pricesConfig.prices : [];
  return (
    <div className="mx-auto max-w-3xl px-6 py-16 text-center">
      <h1 className="font-display text-3xl font-bold tracking-tight">Pricing</h1>
      <p className="mt-3 text-sm text-muted-foreground sm:text-base">
        Everything that ships is in the Free tier — the full pipeline,
        team, webhooks. Pro is the Stripe-billed subscription for a
        global product: upgrade from Settings in the currency you choose
        (cards accepted worldwide via Stripe), and early users keep the
        Free tier as-is.
      </p>

      <div className="mt-10 grid gap-5 text-left sm:grid-cols-2">
        {TIERS.map(({ name, icon: Icon, chip, badge, blurb, features, cta }) => (
          <Card key={name} className="flex flex-col">
            <CardHeader className="space-y-1.5 border-b border-border px-5 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className={`icon-chip h-8 w-8 ${chip}`}>
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <CardTitle className="text-base">{name}</CardTitle>
                </div>
                {badge && <Badge variant="secondary">{badge}</Badge>}
              </div>
              <CardDescription className="text-sm">{blurb}</CardDescription>
              {name === "Pro" && proPrices.length > 0 ? (
                <p className="text-sm font-semibold text-text">
                  {proPrices
                    .map((p) => `${formatPrice(p.amount, p.currency)} ${p.currency}`)
                    .join("  ·  ")}
                </p>
              ) : null}
            </CardHeader>
            <CardContent className="flex-1 p-5">
              <ul className="space-y-2.5">
                {features.map((feature) => (
                  <li key={feature} className="flex gap-2.5 text-sm">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                    <span className="text-text">{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter className="p-5 pt-0">
              <Button
                asChild
                variant={cta.primary ? "default" : "outline"}
                className="w-full"
              >
                <Link href={cta.href}>{cta.label}</Link>
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      <p className="mt-8 text-xs text-muted-foreground">
        Questions about Pro or anything that&apos;s missing?{" "}
        <a
          href="mailto:hello@nookscript.dev"
          className="inline-flex min-h-11 min-w-11 items-center underline underline-offset-2 transition-colors hover:text-text"
        >
          Get in touch
        </a>
        .
      </p>
    </div>
  );
}
