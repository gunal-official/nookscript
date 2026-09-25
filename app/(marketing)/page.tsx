import Link from "next/link";
import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "nookscript — client-work writing studio",
  description:
    "Turn messy client messages into structured briefs, proposals, plans, and weekly updates — one purpose-built pipeline.",
};

/** The core pipeline, in product order (Steps 4→9 of what the app does). */
const PIPELINE = [
  {
    step: 1,
    title: "Intake",
    copy: "Paste what the client sent — an email, call notes, a chat log — and get a structured, gap-flagged brief draft back.",
  },
  {
    step: 2,
    title: "Brief",
    copy: "Edit the draft inline. Open questions stay tracked until resolved, and every field change lands in the edit history.",
  },
  {
    step: 3,
    title: "Proposal",
    copy: "Generate a client-ready proposal from any brief — scope, deliverables, and budget carried over automatically.",
  },
  {
    step: 4,
    title: "Plan",
    copy: "Turn the accepted proposal into a working plan: deliverables become tasks you check off as the work moves.",
  },
  {
    step: 5,
    title: "Update",
    copy: "Compose weekly client updates straight from plan progress — no re-typing, no forgotten wins.",
  },
];

/** Supporting features, present but deliberately not part of the pipeline. */
const SUPPORTING = [
  {
    title: "Share links",
    copy: "Send clients a read-only public link to an update. Revoke it or regenerate a fresh token anytime.",
  },
  {
    title: "Templates",
    copy: "Save your best follow-ups and sign-offs as workspace snippets, ready for the next client who asks.",
  },
];

/**
 * Step 13 — marketing homepage.
 * Hero → the five-step pipeline → supporting features → closing CTA.
 * Writes copy for a public audience in the product's voice.
 */
export default function HomePage() {
  return (
    <>
      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="mx-auto flex max-w-5xl flex-col items-center px-6 pb-20 pt-24 text-center">
        <Badge variant="secondary">For freelancers & small studios</Badge>
        <h1 className="mt-6 font-display text-[clamp(2.25rem,12vw,3.75rem)] font-bold tracking-tight sm:text-7xl">
          nook<span className="text-accent">script</span>
        </h1>
        <p className="mt-4 font-display text-xl font-semibold tracking-tight sm:text-2xl">
          Messy client messages in. Polished proposals out.
        </p>
        <p className="mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
          A writing studio for client work: paste what your client sent, get
          a gap-flagged brief, then carry it all the way through proposals,
          plans, and weekly updates — one pipeline, one workspace.
        </p>
        <div className="mt-8 flex items-center gap-3">
          <Button asChild size="lg">
            <Link href="/signup">Sign up</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/login">Log in</Link>
          </Button>
        </div>
      </section>

      {/* ── The pipeline ─────────────────────────────────── */}
      <section className="border-t border-border bg-muted/40">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <h2 className="font-display text-2xl font-bold tracking-tight">
            From first email to final update
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Each stage hands its structure to the next — nothing is ever
            re-typed, and the source trail stays attached the whole way.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {PIPELINE.map(({ step, title, copy }) => (
              <Card key={step} className="flex flex-col">
                <CardHeader className="space-y-2 p-4">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-white">
                    {step}
                  </span>
                  <CardTitle className="text-base">{title}</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {copy}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── Supporting features ──────────────────────────── */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <h2 className="font-display text-xl font-bold tracking-tight">
            And the pieces around it
          </h2>
          <div className="mt-6 grid max-w-3xl gap-4 sm:grid-cols-2">
            {SUPPORTING.map(({ title, copy }) => (
              <Card key={title}>
                <CardHeader className="space-y-1 p-4">
                  <CardTitle className="text-base">{title}</CardTitle>
                  <CardDescription className="text-xs leading-relaxed">
                    {copy}
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── Closing CTA ──────────────────────────────────── */}
      <section className="border-t border-border bg-muted/40">
        <div className="mx-auto flex max-w-5xl flex-col items-center px-6 py-16 text-center">
          <h2 className="font-display text-2xl font-bold tracking-tight">
            Ready when your next client email lands.
          </h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Free while in early access — bring one client project and run it
            through the pipeline.
          </p>
          <Button asChild size="lg" className="mt-6">
            <Link href="/signup">Sign up free</Link>
          </Button>
        </div>
      </section>
    </>
  );
}
