import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PlanStatus } from "@/lib/types/plan";

/**
 * Status badge for plans — mirrors the StatusBadge/ProposalStatusBadge
 * approach with plans' own 3-status vocabulary. The token palette is
 * limited (muted / accent / error), so each status reuses the house
 * conventions: not_started = quiet outline, in_progress = accent outline
 * (the "active" look shared with brief in_review / proposal sent),
 * done = solid accent (the terminal-success look of approved/accepted).
 */
const STATUS_STYLES: Record<
  PlanStatus,
  { label: string; className: string }
> = {
  not_started: {
    label: "Not started",
    className: "border-border bg-card text-muted-foreground",
  },
  in_progress: {
    label: "In progress",
    className: "border-accent bg-accent-soft text-accent",
  },
  done: {
    label: "Done",
    className: "border-transparent bg-accent text-white",
  },
};

export function PlanStatusBadge({
  status,
  className,
}: {
  status: PlanStatus;
  className?: string;
}) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.not_started;
  return (
    <Badge className={cn("font-medium", style.className, className)}>
      {style.label}
    </Badge>
  );
}
