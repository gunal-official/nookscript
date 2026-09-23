import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

/**
 * Shared marketing chrome (Step 13): logo lockup on the left, light nav,
 * auth CTAs + theme toggle on the right. Server component — ThemeToggle is
 * the only client piece. Nav links collapse below sm (no hamburger needed;
 * About/Pricing remain reachable from the footer).
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-bg/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-6">
        <Link
          href="/"
          className="font-display text-lg font-bold tracking-tight"
        >
          nook<span className="text-accent">script</span>
        </Link>

        <nav className="hidden items-center gap-5 text-sm text-muted-foreground sm:flex">
          <Link href="/about" className="transition-colors hover:text-text">
            About
          </Link>
          <Link href="/pricing" className="transition-colors hover:text-text">
            Pricing
          </Link>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">Log in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/signup">Sign up</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
