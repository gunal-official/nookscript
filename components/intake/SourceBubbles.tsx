/**
 * Shared chat-style rendering of a source's raw text: the paragraphs
 * (split on blank lines) become read-only message bubbles.
 *
 * Extracted in Step 12 from the SourcePanel "thread" mode so BOTH the
 * /intake generate flow (/intake preview) and the /intake/inbox threads —
 * plus the brief detail Sources card — render sources identically.
 * Presentational only; safe to use from server or client components.
 */
import { MessageSquare } from "lucide-react";
import { toMessages } from "@/lib/to-messages";

export function SourceBubbles({ text }: { text: string }) {
  return (
    <div className="space-y-3">
      {toMessages(text).map((msg, i) => (
        <div key={i} className="flex gap-2.5">
          <span className="icon-chip icon-chip-accent mt-1 h-6 w-6 shrink-0 rounded-full">
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1 rounded-lg border border-border bg-card px-4 py-3">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-text">
              {msg}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
