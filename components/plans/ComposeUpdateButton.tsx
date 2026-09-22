"use client";

/**
 * "Compose update" entry point on the plan detail page. Calls the
 * composeUpdateFromPlan server action, which generates a starting draft
 * (title from today's date + markdown snapshot of the plan's tasks) and
 * redirects to the new update's composer. Ungated on plan status,
 * mirroring the generate-proposal / generate-plan precedents.
 */

import { useState } from "react";
import { Loader2, Send } from "lucide-react";

import { composeUpdateFromPlan } from "@/app/(app)/plans/[id]/actions";
import { Button } from "@/components/ui/button";

export function ComposeUpdateButton({ planId }: { planId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    setError(null);

    const result = await composeUpdateFromPlan({ planId });

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
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Send className="mr-2 h-4 w-4" />
        )}
        Compose update
      </Button>
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}
