"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { updateProposalStatus } from "@/app/(app)/proposals/[id]/actions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ProposalStatus } from "@/lib/types/proposal";

const STATUS_OPTIONS: { value: ProposalStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "accepted", label: "Accepted" },
  { value: "declined", label: "Declined" },
];

/** Draft → Sent → Accepted / Declined. Same optimistic-with-rollback
 *  pattern as the brief StatusSelect. */
export function ProposalStatusSelect({
  proposalId,
  status,
}: {
  proposalId: string;
  status: ProposalStatus;
}) {
  const [value, setValue] = useState<ProposalStatus>(status);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(next: string) {
    const nextStatus = next as ProposalStatus;
    if (nextStatus === value) return;

    const previous = value;
    setValue(nextStatus); // optimistic
    setPending(true);
    setError(null);

    const result = await updateProposalStatus({
      proposalId,
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
