"use client";

/**
 * "Generate plan" entry point on the proposal detail page. Calls the
 * createPlanFromProposal server action, which copies the proposal's fields
 * and turns its deliverables into tasks (deterministic — no AI), then
 * redirects to the new plan's page. Ungated on proposal status, mirroring
 * the proposal-generation precedent from briefs.
 */

import { useState } from "react";
import { ListTodo, Loader2 } from "lucide-react";

import { createPlanFromProposal } from "@/app/(app)/proposals/[id]/actions";
import { Button } from "@/components/ui/button";

export function GeneratePlanButton({ proposalId }: { proposalId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    setError(null);

    const result = await createPlanFromProposal({ proposalId });

    // On success the action redirects, so reaching this line with no error
    // just means navigation is in flight.
    setPending(false);
    if (result?.error) setError(result.error);
  }

  return (
    <div className="space-y-1.5">
      <Button
        type="button"
        variant="secondary"
        className="w-full"
        onClick={handleClick}
        disabled={pending}
      >
        {pending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin"  aria-hidden="true" />
        ) : (
          <ListTodo className="mr-2 h-4 w-4" />
        )}
        Generate plan
      </Button>
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}
