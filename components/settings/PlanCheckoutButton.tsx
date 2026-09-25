"use client";

/**
 * Hosted Stripe Checkout trigger (Phase: events/webhooks foundation) —
 * the client island around the startCheckout server action so its error
 * results reach the user (toast), the project's form-action pattern
 * (PrintButton / TeamCard precedent).
 */

import { useTransition } from "react";
import { Loader2 } from "lucide-react";

import { startCheckout } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export function PlanCheckoutButton() {
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  return (
    <Button
      type="button"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await startCheckout();
          if (result?.error) toast(result.error);
        })
      }
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : null}
      Upgrade with Stripe Checkout
    </Button>
  );
}
