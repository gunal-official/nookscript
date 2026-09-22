import { Badge } from "@/components/ui/badge";

/**
 * Shared "Coming in Step X" placeholder used by every not-yet-built route.
 * `step` refers to the build-roadmap step number.
 */
export function Placeholder({
  title,
  step,
  children,
}: {
  title: string;
  step: number;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col items-start justify-center">
      <Badge variant="secondary" className="mb-4">
        Placeholder
      </Badge>
      <h1 className="font-display text-3xl font-bold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Coming in Step {step}
      </p>
      {children ? (
        <div className="mt-6 flex items-center gap-3">{children}</div>
      ) : null}
    </div>
  );
}
