import Link from "next/link";
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

export const metadata: Metadata = {
  title: "Pricing — nookscript",
  description:
    "nookscript pricing: free during early access. Free tier is the full core pipeline; Pro early access adds share links, templates, and inbox threading.",
};

// No dollar amounts — there is no billing system yet, and inventing prices
// on a public page would be a false claim. Early-access framing only.
// NOTE: Templates, share links, and inbox threading are genuinely available
// to every workspace TODAY — they live in the Free list because that's
// what's true in code; the Pro list is forward-looking roadmap only.
const TIERS: {
  name: string;
  badge?: string;
  blurb: string;
  features: string[];
  cta: { label: string; href: string; primary?: boolean };
}[] = [
  {
    name: "Free",
    blurb: "The full product as it exists today — early access.",
    features: [
      "Solo use · 1 workspace",
      "Intake → briefs (AI or built-in parser)",
      "Proposals from briefs",
      "Plans from proposals",
      "Updates from plans",
      "Public, revocable share links",
      "Workspace templates",
      "Inbox threading — replies onto brief source threads",
      "Full edit history on briefs",
    ],
    cta: { label: "Sign up free", href: "/signup", primary: true },
  },
  {
    name: "Pro",
    badge: "Early access",
    blurb: "Nothing here exists yet — this is the shape of the roadmap.",
    features: [
      "Everything in Free",
      "Custom domains for share links — planned",
      "Custom role tiers (admin and beyond) — planned",
      "Priority support — planned",
      "Early builds of whatever ships next",
    ],
    cta: {
      label: "Request access",
      href: "mailto:hello@nookscript.dev?subject=nookscript%20Pro%20early%20access",
    },
  },
];

/**
 * Step 13 — /pricing. Two tiers, no invented prices: Free today, Pro framed
 * as early-access with a mailto CTA — no billing system exists or is implied.
 */
export default function PricingPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16 text-center">
      <h1 className="font-display text-3xl font-bold tracking-tight">Pricing</h1>
      <p className="mt-3 text-sm text-muted-foreground sm:text-base">
        Everything that exists today is free during early access — paid
        plans land before general availability, and early users keep the
        Free tier as-is.
      </p>

      <div className="mt-10 grid gap-5 text-left sm:grid-cols-2">
        {TIERS.map(({ name, badge, blurb, features, cta }) => (
          <Card key={name} className="flex flex-col">
            <CardHeader className="space-y-1.5 border-b border-border px-5 py-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{name}</CardTitle>
                {badge && <Badge variant="secondary">{badge}</Badge>}
              </div>
              <CardDescription className="text-sm">{blurb}</CardDescription>
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
                {cta.href.startsWith("mailto:") ? (
                  <a href={cta.href}>{cta.label}</a>
                ) : (
                  <Link href={cta.href}>{cta.label}</Link>
                )}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      <p className="mt-8 text-xs text-muted-foreground">
        Questions about teams or multiple workspaces?{" "}
        <a
          href="mailto:hello@nookscript.dev"
          className="underline underline-offset-2 transition-colors hover:text-text"
        >
          Get in touch
        </a>
        .
      </p>
    </div>
  );
}
