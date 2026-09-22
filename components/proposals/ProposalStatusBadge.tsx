import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ProposalStatus } from "@/lib/types/proposal";

/**
 * Status badge for proposals — mirrors the StatusBadge approach for
 * briefs, with proposals' own 4-status vocabulary. Sketching → out the
 * door → a yes/no outcome, so: draft = muted, sent = accent outline,
 * accepted = solid accent, declined = error tint.
 */
const STATUS_STYLES: Record<
  ProposalStatus,
  { label: string; className: string }
> = {
  draft: {
    label: "Draft",
    className: "border-transparent bg-muted text-text",
  },
  sent: {
    label: "Sent",
    className: "border-accent bg-accent-soft text-accent",
  },
  accepted: {
    label: "Accepted",
    className: "border-transparent bg-accent text-white",
  },
  declined: {
    label: "Declined",
    className: "border-transparent bg-error/10 text-error",
  },
};

export function ProposalStatusBadge({
  status,
  className,
}: {
  status: ProposalStatus;
  className?: string;
}) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.draft;
  return (
    <Badge className={cn("font-medium", style.className, className)}>
      {style.label}
    </Badge>
  );
}
