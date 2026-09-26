"use client";

/**
 * Hosted Stripe Customer Portal trigger (suggestions pass 5/10) — the
 * client island around the openCustomerPortal server action so its
 * error results reach the user (toast); the project's form-action
 * pattern (PlanCheckoutButton / PrintButton / TeamCard precedent).
 */

import { useTransition } from "react";
import { Loader2 } from "lucide-react";

import { openCustomerPortal } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export function ManageBillingButton() {
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  return (
    <Button
      type="button"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await openCustomerPortal();
          if (result?.error) toast(result.error);
        })
      }
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : null}
      Manage billing
    </Button>
  );
}
