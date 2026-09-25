"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { setContractStatus } from "@/app/(app)/contracts/[id]/actions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ContractStatus } from "@/lib/types/contract";

const STATUS_OPTIONS: { value: ContractStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "signed", label: "Signed" },
  { value: "void", label: "Void" },
];

/** Lifecycle selector. Same optimistic-with-rollback pattern as the
 *  invoice/plan/update StatusSelects; the server action stamps
 *  sent_at/signed_at (and clears signed_at when leaving "signed") as
 *  part of the transition. */
export function ContractStatusSelect({
  contractId,
  status,
}: {
  contractId: string;
  status: ContractStatus;
}) {
  const [value, setValue] = useState<ContractStatus>(status);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(next: string) {
    const nextStatus = next as ContractStatus;
    if (nextStatus === value) return;

    const previous = value;
    setValue(nextStatus); // optimistic
    setPending(true);
    setError(null);

    const result = await setContractStatus({
      contractId,
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
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        )}
      </div>
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}
