"use client";

/**
 * "Generate proposal" entry point on the brief detail page. Calls the
 * createProposalFromBrief server action, which copies the brief's fields
 * into a new draft proposal (deterministic — no AI) and redirects to it.
 */

import { useState } from "react";
import { FileSignature, Loader2 } from "lucide-react";

import { createProposalFromBrief } from "@/app/(app)/briefs/[id]/actions";
import { Button } from "@/components/ui/button";

export function GenerateProposalButton({ briefId }: { briefId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    setError(null);

    const result = await createProposalFromBrief({ briefId });

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
          <FileSignature className="mr-2 h-4 w-4" />
        )}
        Generate proposal
      </Button>
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}
