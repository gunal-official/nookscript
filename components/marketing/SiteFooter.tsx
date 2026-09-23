import Link from "next/link";

/**
 * Shared marketing footer (Step 13): small and unobtrusive — logo, the
 * public route set, and a one-line tagline restate.
 */
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-8">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
          <Link href="/" className="font-display text-sm font-bold text-text">
            nook<span className="text-accent">script</span>
          </Link>
          <Link href="/about" className="transition-colors hover:text-text">
            About
          </Link>
          <Link href="/pricing" className="transition-colors hover:text-text">
            Pricing
          </Link>
          <Link href="/vs/notion" className="transition-colors hover:text-text">
            nookscript vs Notion
          </Link>
          <Link href="/login" className="transition-colors hover:text-text">
            Log in
          </Link>
        </div>
        <p className="text-xs text-muted-foreground">
          © 2026 nookscript — client-work writing studio: intake → briefs →
          proposals → plans → updates.
        </p>
      </div>
    </footer>
  );
}
