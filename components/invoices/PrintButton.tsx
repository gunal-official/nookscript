"use client";

/**
 * Print affordance for the public invoice form (Step 17). Browser print
 * is the v1 export story (no markdown/PDF endpoint — recorded cut).
 *
 * A client island ON PURPOSE: the public page is a Server Component
 * (it calls the server-only data layer), so the onClick handler must
 * live in a "use client" component — passing it inline from the page
 * would throw "Event handlers cannot be passed to Client Component
 * props" as soon as a real invoice renders.
 */

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PrintButton({ className }: { className?: string }) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      className={cn("print:hidden", className)}
      onClick={() => window.print()}
    >
      <Printer className="mr-2 h-3.5 w-3.5"  aria-hidden="true" />
      Print
    </Button>
  );
}
