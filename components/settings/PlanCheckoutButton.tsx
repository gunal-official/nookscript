"use client";

/**
 * Stripe Checkout trigger for the Free → Pro upgrade (global
 * multi-currency, 2026-09-26) — the client island around the
 * startCheckout server action so its error results reach the user
 * (toast); the project's form-action pattern (PrintButton / TeamCard
 * precedent). With more than one configured currency the owner picks
 * before checkout; the price label follows the selection. Prices come
 * from the operator's STRIPE_PRICES config — nothing is hardcoded.
 */

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { startCheckout } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { formatPrice, type StripePriceConfig } from "@/lib/stripe";

export function PlanCheckoutButton({
  prices,
}: {
  prices: StripePriceConfig[];
}) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const [currency, setCurrency] = useState(prices[0]?.currency ?? "");
  const selected =
    prices.find((p) => p.currency === currency) ?? prices[0];

  return (
    <div className="flex flex-wrap items-center gap-3">
      {prices.length > 1 ? (
        <Select value={currency} onValueChange={setCurrency}>
          <SelectTrigger
            aria-label="Billing currency"
            className="h-11 min-h-11 w-auto gap-2"
          >
            <SelectValue placeholder="Currency" />
          </SelectTrigger>
          <SelectContent>
            {prices.map((p) => (
              <SelectItem key={p.currency} value={p.currency}>
                {formatPrice(p.amount, p.currency)} {p.currency}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      <Button
        type="button"
        variant="outline"
        disabled={pending || !selected}
        onClick={() => {
          if (!selected) return;
          const chosen = selected;
          startTransition(async () => {
            const result = await startCheckout(chosen.currency);
            if (result?.error) toast(result.error);
          });
        }}
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : null}
        {selected
          ? `Upgrade to Pro — ${formatPrice(selected.amount, selected.currency)} ${selected.currency}`
          : "Upgrade to Pro"}
      </Button>
    </div>
  );
}
