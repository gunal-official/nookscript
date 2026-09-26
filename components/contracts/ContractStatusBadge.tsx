import { Badge } from "@/components/ui/badge";
import { cn, localToday } from "@/lib/utils";
import type { ContractStatus } from "@/lib/types/contract";

/**
 * Status badge for contracts — same badge family and 4-status mapping
 * as invoices (Step 17): draft = solid muted, sent = accent outline,
 * signed = solid accent (the terminal-success look of invoice "paid"),
 * void = quiet outline (the "dead" look — void is the audit-safe cancel,
 * never a delete). "Expired" is NOT a badge: it's derived from
 * expires_on and rendered separately.
 */
const STATUS_STYLES: Record<
  ContractStatus,
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
  signed: {
    label: "Signed",
    className: "border-transparent bg-accent text-white",
  },
  void: {
    label: "Void",
    className: "border-border bg-card text-muted-foreground",
  },
};

export function ContractStatusBadge({
  status,
  className,
}: {
  status: ContractStatus;
  className?: string;
}) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.draft;
  return (
    <Badge className={cn("font-medium", style.className, className)}>
      {style.label}
    </Badge>
  );
}

/** Derived "expired" chip — rendered next to the status badge when
 *  expires_on is in the past (and the contract isn't void). */
export function ExpiredBadge({
  expiresOn,
  status,
  className,
}: {
  expiresOn: string | null;
  status: ContractStatus;
  className?: string;
}) {
  if (!expiresOn || status === "void") return null;
  if (expiresOn >= localToday()) return null;
  return (
    <Badge
      className={cn(
        "font-medium border-destructive/40 bg-destructive/10 text-destructive",
        className
      )}
    >
      Expired
    </Badge>
  );
}
