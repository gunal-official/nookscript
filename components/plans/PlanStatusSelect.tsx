"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { updatePlanStatus } from "@/app/(app)/plans/[id]/actions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PlanStatus } from "@/lib/types/plan";

const STATUS_OPTIONS: { value: PlanStatus; label: string }[] = [
  { value: "not_started", label: "Not started" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
];

/** Not started → In progress → Done. Same optimistic-with-rollback
 *  pattern as the proposal StatusSelect. */
export function PlanStatusSelect({
  planId,
  status,
}: {
  planId: string;
  status: PlanStatus;
}) {
  const [value, setValue] = useState<PlanStatus>(status);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(next: string) {
    const nextStatus = next as PlanStatus;
    if (nextStatus === value) return;

    const previous = value;
    setValue(nextStatus); // optimistic
    setPending(true);
    setError(null);

    const result = await updatePlanStatus({
      planId,
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
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground"  aria-hidden="true" />
        )}
      </div>
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}
