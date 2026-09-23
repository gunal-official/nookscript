import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { VS_PAGES } from "./vs-pages";

interface VsPageProps {
  params: { slug: string };
}

// Only content-backed slugs generate pages; everything else 404s.
export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(VS_PAGES).map((slug) => ({ slug }));
}

export function generateMetadata({ params }: VsPageProps): Metadata {
  const entry = VS_PAGES[params.slug];
  if (!entry) return {};
  return {
    title: `${entry.heading} — nookscript`,
    description: entry.intro,
  };
}

/**
 * Step 13 — /vs/* competitor comparison pages. Content lives in
 * ./vs-pages.ts; comparisons stay factual and purpose-built-flavored, never
 * disparaging. Unknown slugs → notFound().
 */
export default function VsPage({ params }: VsPageProps) {
  const entry = VS_PAGES[params.slug];
  if (!entry) notFound();

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <Badge variant="secondary">Comparison</Badge>
      <h1 className="mt-4 font-display text-3xl font-bold tracking-tight">
        {entry.heading}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
        {entry.intro}
      </p>

      <Card className="mt-10 overflow-hidden">
        <CardHeader className="border-b border-border bg-muted/60 px-5 py-3.5">
          <div className="grid grid-cols-3 gap-4 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <span></span>
            <span className="font-display text-sm font-bold normal-case tracking-tight text-text">
              nook<span className="text-accent">script</span>
            </span>
            <CardTitle className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {entry.competitor}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="divide-y divide-border p-0">
          {entry.rows.map((row) => (
            <div key={row.feature} className="grid grid-cols-3 gap-4 px-5 py-4">
              <p className="text-sm font-medium">{row.feature}</p>
              <p className="text-sm leading-relaxed text-text">{row.nookscript}</p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {row.competitor}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <p className="mt-8 text-sm leading-relaxed text-muted-foreground sm:text-base">
        {entry.takeaway}
      </p>

      <div className="mt-8 flex items-center gap-3">
        <Button asChild>
          <Link href="/signup">Try nookscript</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/pricing">See pricing</Link>
        </Button>
      </div>
    </div>
  );
}
