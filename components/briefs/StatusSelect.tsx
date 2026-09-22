"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { updateBriefStatus } from "@/app/(app)/briefs/[id]/actions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BriefStatus } from "@/lib/types/brief";

const STATUS_OPTIONS: { value: BriefStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "in_review", label: "In review" },
  { value: "approved", label: "Approved" },
];

/** Draft → In review → Approved. Goes through a plain UPDATE so the
 *  status-change DB trigger logs old → new into brief_edit_history. */
export function StatusSelect({
  briefId,
  status,
}: {
  briefId: string;
  status: BriefStatus;
}) {
  const [value, setValue] = useState<BriefStatus>(status);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(next: string) {
    const nextStatus = next as BriefStatus;
    if (nextStatus === value) return;

    const previous = value;
    setValue(nextStatus); // optimistic
    setPending(true);
    setError(null);

    const result = await updateBriefStatus({
      briefId,
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
          <SelectTrigger className="h-8 w-[150px]">
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
