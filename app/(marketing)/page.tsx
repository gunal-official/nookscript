import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// Full v1 route surface per the build roadmap — temporary, for verifying the
// shell + theme across every placeholder. Removed when Step 13 builds this page.
const ROUTE_MAP: { href: string; label: string; step: number }[] = [
  { href: "/login", label: "Log in", step: 2 },
  { href: "/signup", label: "Sign up", step: 2 },
  { href: "/intake", label: "Intake", step: 4 },
  { href: "/intake/inbox", label: "Inbox", step: 12 },
  { href: "/briefs", label: "Briefs", step: 6 },
  { href: "/briefs/00000000-0000-0000-0000-000000000010", label: "Brief detail (seed)", step: 5 },
  { href: "/proposals", label: "Proposals", step: 7 },
  { href: "/proposals/demo", label: "Proposal detail", step: 7 },
  { href: "/plans", label: "Plans", step: 8 },
  { href: "/plans/demo", label: "Plan detail", step: 8 },
  { href: "/updates", label: "Updates", step: 9 },
  { href: "/updates/demo", label: "Update detail", step: 9 },
  { href: "/settings", label: "Settings", step: 11 },
  { href: "/share/demo-token", label: "Shared view", step: 10 },
  { href: "/about", label: "About", step: 13 },
  { href: "/pricing", label: "Pricing", step: 13 },
  { href: "/vs/notion", label: "vs page", step: 13 },
];

// Step 13 — marketing homepage
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <Badge variant="secondary">Placeholder</Badge>
      <h1 className="font-display text-5xl font-bold tracking-tight">
        nook<span className="text-accent">script</span>
      </h1>
      <p className="text-sm text-muted-foreground">
        Homepage — Coming in Step 13
      </p>

      <div className="flex items-center gap-3">
        <Button asChild>
          <Link href="/intake">Enter app</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/pricing">Pricing</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/about">About</Link>
        </Button>
      </div>

      <ThemeToggle />

      <div className="rounded-lg border border-border bg-card p-4 text-left">
        <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Route map — temporary, for shell verification
        </p>
        <div className="flex flex-wrap gap-1.5">
          {ROUTE_MAP.map(({ href, label, step }) => (
            <Button key={href} asChild variant="ghost" size="sm">
              <Link href={href}>
                {label}
                <span className="text-muted-foreground">·{step}</span>
              </Link>
            </Button>
          ))}
        </div>
      </div>
    </main>
  );
}
