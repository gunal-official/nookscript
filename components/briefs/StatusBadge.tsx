import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { BriefStatus } from "@/lib/types/brief";

/**
 * Shared status badge for briefs — used on /briefs/:id (Step 5) and the
 * /briefs list (Step 6). Keep variants in one place so all screens agree.
 */
const STATUS_STYLES: Record<
  BriefStatus,
  { label: string; className: string }
> = {
  draft: {
    label: "Draft",
    className: "border-transparent bg-muted text-text",
  },
  in_review: {
    label: "In review",
    className: "border-accent bg-accent-soft text-accent",
  },
  approved: {
    label: "Approved",
    className: "border-transparent bg-accent text-white",
  },
};

export function StatusBadge({
  status,
  className,
}: {
  status: BriefStatus;
  className?: string;
}) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.draft;
  return (
    <Badge className={cn("font-medium", style.className, className)}>
      {style.label}
    </Badge>
  );
}
