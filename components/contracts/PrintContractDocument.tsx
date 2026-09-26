import { formatDate } from "@/lib/utils";
import type { Contract } from "@/lib/types/contract";

/**
 * The print-only contract document (Step 19, D4: member-only, no public
 * surface — browser print of the member detail page is the v1 export
 * story). On screen it is invisible (`hidden print:block`); when
 * printing the detail page, the app UI and the (app) chrome (topbar +
 * sidebar, both print:hidden) are hidden and this renders instead.
 */
export function PrintContractDocument({
  contract,
  briefTitle,
  workspaceName,
}: {
  contract: Contract;
  briefTitle: string | null;
  workspaceName: string;
}) {
  return (
    <div className="hidden max-w-3xl print:block">
      <h1 className="font-display text-3xl font-bold tracking-tight">
        {contract.title}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {contract.client_name}
        {briefTitle ? ` — ${briefTitle}` : ""}
      </p>

      <div className="mt-8 flex flex-wrap gap-x-10 gap-y-1 text-sm">
        <p>
          <span className="font-semibold">Sent:</span>{" "}
          {formatDate(contract.sent_at)}
        </p>
        <p>
          <span className="font-semibold">Signed:</span>{" "}
          {formatDate(contract.signed_at)}
        </p>
        <p>
          <span className="font-semibold">Expires:</span>{" "}
          {formatDate(contract.expires_on)}
        </p>
      </div>

      {contract.signed_by && (
        <p className="mt-4 text-sm">
          <span className="font-semibold">Signed by:</span>{" "}
          {contract.signed_by}
        </p>
      )}

      <pre className="mt-8 whitespace-pre-wrap font-sans text-sm leading-relaxed">
        {contract.terms || "—"}
      </pre>

      <p className="mt-12 text-xs text-muted-foreground">
        {workspaceName} — generated from nookscript
      </p>
    </div>
  );
}
