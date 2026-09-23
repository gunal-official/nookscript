"use client";

/**
 * The contract composer (detail page). One Save button — explicit, no
 * autosave (house convention). The client name is free text with a
 * <datalist> of brief client names; the brief picker includes a
 * Standalone option (brief_id null).
 */

import { useState } from "react";
import { Loader2, Save } from "lucide-react";

import { saveContract } from "@/app/(app)/contracts/[id]/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Contract } from "@/lib/types/contract";

const STANDALONE = "standalone";

export function ContractComposer({
  contract,
  briefTitles,
  clientSuggestions,
}: {
  contract: Contract;
  briefTitles: Record<string, string>;
  clientSuggestions: string[];
}) {
  const [title, setTitle] = useState(contract.title);
  const [client, setClient] = useState(contract.client_name);
  const [briefId, setBriefId] = useState(contract.brief_id ?? "");
  const [terms, setTerms] = useState(contract.terms);
  const [expiresOn, setExpiresOn] = useState(contract.expires_on ?? "");
  const [signedBy, setSignedBy] = useState(contract.signed_by);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await saveContract({
      contractId: contract.id,
      title,
      client_name: client,
      brief_id: briefId || null,
      terms,
      expires_on: expiresOn || null,
      signed_by: signedBy,
    });
    setSaving(false);
    if (result?.error) setError(result.error);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label
            htmlFor="contract-title"
            className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
          >
            Title
          </label>
          <Input
            id="contract-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <label
            htmlFor="contract-client"
            className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
          >
            Client
          </label>
          <Input
            id="contract-client"
            list="contract-client-suggestions"
            value={client}
            onChange={(e) => setClient(e.target.value)}
          />
          <datalist id="contract-client-suggestions">
            {clientSuggestions.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Brief
          </label>
          <Select
            value={briefId || STANDALONE}
            onValueChange={(value) =>
              setBriefId(value === STANDALONE ? "" : value)
            }
          >
            <SelectTrigger className="h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={STANDALONE}>
                Standalone (no brief)
              </SelectItem>
              {Object.entries(briefTitles).map(([id, bTitle]) => (
                <SelectItem key={id} value={id}>
                  {bTitle}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label
            htmlFor="contract-expires"
            className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
          >
            Expiry (optional)
          </label>
          <Input
            id="contract-expires"
            type="date"
            value={expiresOn}
            onChange={(e) => setExpiresOn(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="contract-terms"
          className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
        >
          Terms
        </label>
        <Textarea
          id="contract-terms"
          value={terms}
          onChange={(e) => setTerms(e.target.value)}
          placeholder="Scope, fee and payment terms, cancellation window…"
          className="min-h-48"
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="contract-signed-by"
          className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
        >
          Signed by (client)
        </label>
        <Input
          id="contract-signed-by"
          value={signedBy}
          onChange={(e) => setSignedBy(e.target.value)}
          placeholder="e.g. Dana Whitfield (Brightloop)"
        />
      </div>

      {error && <p className="text-sm text-error">{error}</p>}

      <div className="flex items-center gap-2">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save
        </Button>
      </div>
    </div>
  );
}
