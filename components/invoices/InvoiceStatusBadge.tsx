import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { InvoiceStatus } from "@/lib/types/invoice";

/**
 * Status badge for invoices — fifth member of the badge family, with
 * invoices' 4-status vocabulary. The token palette is limited
 * (muted / accent / error), so each status reuses house conventions:
 * draft = solid muted (same as brief/proposal/update drafts), sent =
 * accent outline (same look as every other "sent"), paid = solid
 * accent (the terminal-success look of plan done / proposal
 * accepted), void = quiet outline (the "dead" look of plan
 * not_started — void is the audit-safe cancel, never a delete).
 */
const STATUS_STYLES: Record<
  InvoiceStatus,
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
  paid: {
    label: "Paid",
    className: "border-transparent bg-accent text-white",
  },
  void: {
    label: "Void",
    className: "border-border bg-card text-muted-foreground",
  },
};

export function InvoiceStatusBadge({
  status,
  className,
}: {
  status: InvoiceStatus;
  className?: string;
}) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.draft;
  return (
    <Badge className={cn("font-medium", style.className, className)}>
      {style.label}
    </Badge>
  );
}
