"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { setInvoiceStatus } from "@/app/(app)/invoices/[id]/actions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { InvoiceStatus } from "@/lib/types/invoice";

const STATUS_OPTIONS: { value: InvoiceStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "paid", label: "Paid" },
  { value: "void", label: "Void" },
];

/** Lifecycle selector. Same optimistic-with-rollback pattern as the
 *  plan/update StatusSelects; the server action stamps sent_at/paid_at
 *  (and clears paid_at when leaving "paid") as part of the transition. */
export function InvoiceStatusSelect({
  invoiceId,
  status,
}: {
  invoiceId: string;
  status: InvoiceStatus;
}) {
  const [value, setValue] = useState<InvoiceStatus>(status);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(next: string) {
    const nextStatus = next as InvoiceStatus;
    if (nextStatus === value) return;

    const previous = value;
    setValue(nextStatus); // optimistic
    setPending(true);
    setError(null);

    const result = await setInvoiceStatus({
      invoiceId,
      status: nextStatus,
    });

    setPending(false);
    if (result?.error) {
      setValue(previous); // roll back
      setError(result.error);
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Select value={value} onValueChange={handleChange} disabled={pending}>
          <SelectTrigger className="h-11 w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {pending && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground"  aria-hidden="true" />
        )}
      </div>
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}
