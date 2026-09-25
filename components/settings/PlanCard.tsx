/**
 * Plan & billing (Step 34(b)) — the subscription surface, honest per the
 * pricing doctrine (app/(marketing)/pricing/page.tsx): there is NO billing
 * system, so no prices are shown and no checkout is implied. Free = the
 * full product today; Pro = early-access roadmap with the same mailto CTA
 * the pricing page uses. Upgrade = request access; downgrade = nothing to
 * cancel on Free — plan changes are by request until billing lands.
 */

import Link from "next/link";
import { ArrowRight, Check, CreditCard, Sparkles } from "lucide-react";

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
  "Solo use · 1 workspace",
  "Intake → briefs → proposals → plans → updates",
  "Public, revocable share links + workspace templates",
  "Inbox threading + full edit history",
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
}: {
  memberCount: number;
  templateCount: number;
}) {
  return (
    <Card className="animate-rise-in">
      <CardHeader className="space-y-1 border-b border-border px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="icon-chip icon-chip-muted h-8 w-8">
            <CreditCard className="h-4 w-4" aria-hidden="true" />
          </span>
          <CardTitle className="text-base">Plan</CardTitle>
        </div>
        <CardDescription>
          Subscription and billing — free during early access. No prices and
          no checkout exist yet, and none are implied.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 p-5">
        {/* Current plan + usage */}
        <div className="flex flex-wrap items-center gap-3">
          <p className="font-display text-2xl font-bold tracking-tight">Free</p>
          <Badge className="border-accent bg-accent-soft text-accent">
            Early access
          </Badge>
          <p className="w-full text-sm text-muted-foreground sm:w-auto">
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
            <Button asChild variant="outline">
              <a href={PRO_MAILTO} className="inline-flex min-h-11 min-w-11 items-center">
                Request access
              </a>
            </Button>
            <Link
              href="/pricing"
              className="inline-flex min-h-11 min-w-11 items-center gap-1.5 text-sm text-accent underline-offset-2 hover:underline"
            >
              Compare plans
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <p className="text-xs text-muted-foreground">
            Changing plans is by request until billing lands — early users
            keep Free exactly as it is today. Nothing to cancel, ever.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
