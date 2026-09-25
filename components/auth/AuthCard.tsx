import Link from "next/link";

/**
 * Shared visual frame for /login, /signup, and /onboarding:
 * centered ~400px card on --bg, Georgia logo, card-level radius-lg.
 */
export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="w-full max-w-[400px]">
      <Link
        href="/"
        className="inline-flex min-h-11 min-w-11 items-center mb-6 block text-center font-display text-2xl font-bold tracking-tight text-text"
      >
        nook<span className="text-accent">script</span>
      </Link>

      <div className="rounded-lg border border-border bg-card p-8 shadow-sm">
        <h1 className="font-display text-xl font-semibold tracking-tight">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        ) : null}
        <div className="mt-6">{children}</div>
      </div>

      {footer ? (
        <p className="mt-4 text-center text-sm text-muted-foreground">
          {footer}
        </p>
      ) : null}
    </div>
  );
}
