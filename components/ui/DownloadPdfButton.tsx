import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * "PDF" download affordance (PDF export, 2026-09-27) — sits next to the
 * existing Print button on every document surface.
 *
 * A plain <a download> inside the Button's `asChild` slot ON PURPOSE: the
 * bytes come from a GET route, so this needs NO client JavaScript, works in
 * a Server Component, keeps middle-click / "Save link as…" honest, and
 * still degrades to a normal navigation if JS is off. (Contrast with
 * PrintButton, which must be a client island because window.print() is a
 * browser API.)
 *
 * `print:hidden` matches PrintButton: neither affordance belongs in the
 * printed page.
 */
export function DownloadPdfButton({
  href,
  label = "PDF",
  className,
  variant = "secondary",
}: {
  /** Usually `/api/pdf/<kind>/<id>` or `/api/pdf/shared/invoice/<token>`. */
  href: string;
  label?: string;
  className?: string;
  variant?: "secondary" | "outline" | "ghost";
}) {
  return (
    <Button
      asChild
      variant={variant}
      size="sm"
      className={cn("print:hidden", className)}
    >
      {/* `download` without a value: the filename comes from the route's
          content-disposition header, so it stays in one place. */}
      <a href={href} download>
        <Download className="mr-2 h-4 w-4" aria-hidden="true" />
        {label}
      </a>
    </Button>
  );
}
