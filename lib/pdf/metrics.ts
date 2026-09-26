/**
 * Text measurement for the PDF writer (PDF export).
 *
 * Base-14 fonts are not embedded, so the app measures with Adobe's published
 * AFM widths (lib/pdf/metrics-data.ts, generated). Everything here is pure
 * arithmetic on those tables — it is what makes wrapped paragraphs,
 * right-aligned money columns and ellipsised table cells land where the
 * layout says they will.
 *
 * Unit note: AFM widths are 1/1000 em, so a glyph's advance at size `s` is
 * `width/1000 * s`.
 */

// Runtime (value) imports between lib modules are relative with the .ts
// extension — the house pattern that keeps `node --test` type-stripping
// able to resolve them (lib/events.ts precedent).
import { winAnsiCodes } from "./encoding.ts";
import { FONT_WIDTHS } from "./metrics-data.ts";

export type PdfFont = keyof typeof FONT_WIDTHS;

/** Advance width of `text` in points at `size`, as it will be PAINTED
 *  (i.e. after WinAnsi transcoding — measurement can't drift from drawing). */
export function measureText(text: string, font: PdfFont, size: number): number {
  const widths = FONT_WIDTHS[font];
  let total = 0;
  for (const code of winAnsiCodes(text)) total += widths[code] ?? 0;
  return (total * size) / 1000;
}

/**
 * Greedy word wrap to `maxWidth` points. Words longer than the line (URLs,
 * hashes) are hard-split so nothing ever bleeds into the margin. Returns at
 * least one line, and preserves explicit blank lines when the caller has
 * already split on "\n".
 */
export function wrapText(
  text: string,
  font: PdfFont,
  size: number,
  maxWidth: number
): string[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let current = "";

  const push = () => {
    if (current.length > 0) lines.push(current);
    current = "";
  };

  for (const word of words) {
    const candidate = current.length === 0 ? word : `${current} ${word}`;
    if (measureText(candidate, font, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    push();
    if (measureText(word, font, size) <= maxWidth) {
      current = word;
      continue;
    }
    // Unbreakable run: split it at the last character that still fits.
    let chunk = "";
    for (const char of word) {
      if (measureText(chunk + char, font, size) > maxWidth && chunk.length > 0) {
        lines.push(chunk);
        chunk = char;
      } else {
        chunk += char;
      }
    }
    current = chunk;
  }
  push();

  return lines.length > 0 ? lines : [""];
}

/** Split on explicit newlines FIRST, then wrap each paragraph — blank lines
 *  survive as empty strings so plain-text bodies (contract terms, notes)
 *  keep their shape. */
export function wrapParagraphs(
  text: string,
  font: PdfFont,
  size: number,
  maxWidth: number
): string[] {
  const out: string[] = [];
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    if (raw.trim().length === 0) {
      out.push("");
      continue;
    }
    out.push(...wrapText(raw, font, size, maxWidth));
  }
  return out;
}

/** Truncate with an ellipsis so the result measures ≤ maxWidth (single
 *  line — table cells, header chips). Returns "" only if even "…" doesn't
 *  fit. */
export function ellipsize(
  text: string,
  font: PdfFont,
  size: number,
  maxWidth: number
): string {
  if (measureText(text, font, size) <= maxWidth) return text;
  const ellipsis = "\u2026";
  if (measureText(ellipsis, font, size) > maxWidth) return "";
  let out = "";
  for (const char of text) {
    if (measureText(out + char + ellipsis, font, size) > maxWidth) break;
    out += char;
  }
  return `${out.trimEnd()}${ellipsis}`;
}
