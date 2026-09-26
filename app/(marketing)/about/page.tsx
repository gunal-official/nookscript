import Link from "next/link";
import { MessageSquare, PenLine, Share2, Workflow } from "lucide-react";
import type { Metadata } from "next";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "About — nookscript",
  description:
    "What nookscript is: a writing studio that turns messy client communication into structured briefs, proposals, plans, and updates.",
};

const BUILT_TODAY = [
  {
    icon: PenLine,
    title: "Intake with gap-flagged briefs",
    copy: "Paste a client email, call notes, or a chat log; get a structured draft that flags what's vague or missing as tracked open questions.",
  },
  {
    icon: MessageSquare,
    title: "A real source trail",
    copy: "Every pasted message stays verbatim and immutable, threaded onto its brief — you can always point back to what the client actually said.",
  },
  {
    icon: Workflow,
    title: "A pipeline, not a pile of docs",
    copy: "Briefs become proposals, proposals become plans, plans drive client updates. Each stage carries the last one's structure forward.",
  },
  {
    icon: Share2,
    title: "Client-facing output",
    copy: "Public, revocable share links for updates, plus reusable templates for the messages you send most.",
  },
];

/**
 * Step 13 — /about. Grounded in what's actually built: no founding myth,
 * just what the product does today and who it's for.
 */
export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="font-display text-3xl font-bold tracking-tight">About</h1>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
        nookscript is a <strong className="font-medium text-text">client-work writing studio</strong>{": "}
        a single workspace for the writing trail that runs through every
        freelance or studio engagement — intake, briefs, proposals, plans,
        and client updates.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
        Client work starts as scattered communication: an email here, a call
        note there, a &ldquo;quick question&rdquo; in chat. nookscript takes
        that raw material as-is and structures it — flagging gaps early,
        keeping every source attached, and carrying the result forward stage
        by stage instead of asking you to re-type it into five different
        documents.
      </p>

      <h2 className="mt-10 font-display text-xl font-bold tracking-tight">
        What&apos;s inside today
      </h2>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {BUILT_TODAY.map(({ icon: Icon, title, copy }) => (
          <Card key={title}>
            <CardHeader className="space-y-1 p-4">
              <div className="flex items-center gap-2.5">
                <span className="icon-chip icon-chip-accent h-8 w-8">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <CardTitle className="text-sm">{title}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <p className="text-xs leading-relaxed text-muted-foreground">
                {copy}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="mt-10 text-sm leading-relaxed text-muted-foreground">
        It&apos;s built for the people who live in this workflow — freelance
        designers, developers, writers, and small studios — and it&apos;s in
        early access, which means the people using it now shape what ships
        next. Built on Next.js and Supabase, with every workspace&apos;s data
        walled off behind row-level security.
      </p>

      <div className="mt-10 flex items-center gap-3">
        <Button asChild>
          <Link href="/signup">Try it</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/pricing">See pricing</Link>
        </Button>
      </div>
    </div>
  );
}
