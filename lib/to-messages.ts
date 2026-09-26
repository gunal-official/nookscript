/**
 * Raw source text → message bubbles (shared by SourceBubbles: the /intake
 * generate preview, /intake/inbox threads, and the brief detail Sources
 * card). Paragraphs (blank-line separated) become separate messages.
 * Presentational pure text helper — kept out of the .tsx so the zero-dep
 * test runner can load it (same convention as lib/reports.ts).
 */

export function toMessages(raw: string): string[] {
  return raw
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}
