"use client";

/**
 * Inline "add a reply" composer for a brief's source thread (Step 12).
 * Used by BOTH /intake/inbox thread cards and the brief detail Sources
 * card: textarea + source-type select + submit → addSourceToBrief()
 * → the atomic add_brief_source() RPC.
 *
 * While the server action is in flight the reply shows as an optimistic
 * bubble; Next's action-response revalidation swaps in the real row
 * (revalidatePath covers /intake/inbox and /briefs/[id]), and the draft
 * clears. On error the draft is kept and the message is shown.
 */

import { useState } from "react";
import { Loader2, Send } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { addSourceToBrief } from "@/app/(app)/intake/actions";
import { SourceBubbles } from "@/components/intake/SourceBubbles";
import type { SourceType } from "@/lib/types/brief";

const SOURCE_TYPE_OPTIONS: { value: SourceType; label: string }[] = [
  { value: "email", label: "Email" },
  { value: "call_notes", label: "Call notes" },
  { value: "chat", label: "Chat" },
  { value: "manual", label: "Manual" },
];

export const MIN_REPLY_CHARS = 5;

export function AddSourceForm({ briefId }: { briefId: string }) {
  const [text, setText] = useState("");
  const [sourceType, setSourceType] = useState<SourceType>("email");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The reply currently on its way to the server — shown optimistically. */
  const [pending, setPending] = useState<string | null>(null);

  const trimmedLength = text.trim().length;
  const canSubmit = trimmedLength >= MIN_REPLY_CHARS && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    setPending(text.trim());

    const result = await addSourceToBrief({
      briefId,
      sourceType,
      rawContent: text,
    });

    setSubmitting(false);
    setPending(null);

    if (result?.error) {
      setError(result.error);
      return; // keep the draft so nothing is lost
    }

    setText(""); // revalidation has already landed the real row
  }

  return (
    <div className="space-y-3">
      {pending !== null && (
        <div aria-live="polite">
          <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Badge variant="secondary">{sourceType}</Badge>
            <span>You · sending…</span>
          </div>
          <SourceBubbles text={pending} />
        </div>
      )}

      <div className="border-t border-border pt-3.5">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-xs font-medium text-muted-foreground">
            Thread a follow-up
          </p>
          <Select
            value={sourceType}
            onValueChange={(v) => setSourceType(v as SourceType)}
            disabled={submitting}
          >
            <SelectTrigger className="h-8 w-[130px]" aria-label="Source type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SOURCE_TYPE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={submitting}
          aria-label="Follow-up reply"
          placeholder={"Reply from the client?\n\nPaste it here to thread it onto this brief — e.g. a follow-up email clarifying scope or budget."}
          className="min-h-[88px] resize-y bg-muted/40 text-sm leading-relaxed"
        />

        <div className="mt-2 flex items-center gap-3">
          <span
            className={cn(
              "text-xs text-muted-foreground",
              trimmedLength > 0 && trimmedLength < MIN_REPLY_CHARS && "text-error"
            )}
          >
            {trimmedLength.toLocaleString()} chars
          </span>
          {error && <p className="flex-1 text-xs text-error">{error}</p>}
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="ml-auto"
          >
            {submitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Adding…
              </>
            ) : (
              <>
                <Send className="h-3.5 w-3.5" />
                Add to thread
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
