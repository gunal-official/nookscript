/**
 * Top-down flow layout on top of the raw PDF writer (PDF export).
 *
 * The writer paints at absolute coordinates with the origin bottom-left;
 * documents are written top-down. This module owns that inversion, plus the
 * three things every nookscript document needs and nothing else:
 *
 *   1. PAGE FURNITURE — a letterhead header (workspace name + document kind
 *      + accent rule) redrawn on every page, and a footer with "Page i of n"
 *      stamped once the page count is known (finish()).
 *   2. FLOW + PAGE BREAKS — a cursor that descends, with `ensure(h)` starting
 *      a new page before a block would cross the bottom margin. Tables repeat
 *      their header row after a break.
 *   3. THE HOUSE VOCABULARY — the same pieces the screen documents use
 *      (title block, uppercase field labels, paper card rules, line-item
 *      table, totals block), so a downloaded PDF reads as the same product
 *      as `/invoices/:id`.
 *
 * Everything is pure: no DB, no Date.now(), no env. Callers pass the data
 * and the timestamp, which is what makes tests/lib/pdf-documents.test.ts
 * able to assert bytes.
 */

import {
  createPage,
  drawLine,
  drawRect,
  drawText,
  PAGE_SIZES,
  renderPdf,
  type PageSizeName,
  type PdfPage,
  type Rgb,
} from "./writer.ts";
import { ellipsize, measureText, wrapParagraphs, wrapText, type PdfFont } from "./metrics.ts";

/** The ui.webp design tokens, as print colours. */
export const COLORS = {
  accent: { r: 1, g: 0.416, b: 0.169 }, // #ff6a2b
  ink: { r: 0.102, g: 0.102, b: 0.122 }, // #1a1a1f
  muted: { r: 0.42, g: 0.447, b: 0.502 }, // #6b7280
  hairline: { r: 0.898, g: 0.906, b: 0.922 }, // #e5e7eb
  zebra: { r: 0.969, g: 0.969, b: 0.976 }, // #f7f7f9
  border: { r: 0.78, g: 0.788, b: 0.812 }, // #c7c9cf — readable at 6pt
  white: { r: 1, g: 1, b: 1 },
} as const satisfies Record<string, Rgb>;

const BODY: PdfFont = "Helvetica";
const BOLD: PdfFont = "Helvetica-Bold";
const ITALIC: PdfFont = "Helvetica-Oblique";

const SIZES = {
  title: 20,
  heading: 12,
  body: 9.5,
  label: 7.5,
  small: 8,
} as const;

export interface LayoutOptions {
  pageSize?: PageSizeName;
  /** Letterhead: the workspace the document belongs to. */
  workspaceName: string;
  /** "Invoice" / "Contract" / "Proposal" — the right-hand header chip. */
  documentKind: string;
  /** PDF /Title (what a reader shows in its title bar / the print dialog). */
  title: string;
  subject?: string;
  /** Injected for determinism; also printed in the footer. */
  generatedAt: Date;
}

export interface TableColumn {
  header: string;
  /** Share of the content width (weights, normalised — not points). */
  width: number;
  align?: "left" | "right";
  /** Wrap long cell text (default) or ellipsise to one line. */
  wrap?: boolean;
}

export interface TableSpec {
  columns: TableColumn[];
  rows: string[][];
  /** Rendered instead of the rows when there are none. */
  emptyText?: string;
}

export interface TotalsRow {
  label: string;
  value: string;
  emphasis?: boolean;
}

/** Formats "Sep 27, 2026" without pulling the app's Intl helpers into the
 *  writer — a PDF must render identically on every server locale. */
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function pdfDateLabel(value: string | Date | null | undefined): string {
  if (!value) return "\u2014";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "\u2014";
  // Date-only strings ("YYYY-MM-DD") parse as UTC midnight, so read the date
  // in UTC — otherwise a due date can print as the day before.
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

export function createLayout(options: LayoutOptions) {
  const size = PAGE_SIZES[options.pageSize ?? "a4"];
  const margin = 54;
  const contentWidth = size.width - margin * 2;
  const left = margin;
  const right = size.width - margin;
  const headerBottom = size.height - margin - 38;
  const footerTop = margin + 26;

  const pages: PdfPage[] = [];
  let page: PdfPage = createPage(size);
  let y = 0;

  function drawHeader() {
    drawText(page, left, size.height - margin - 10, options.workspaceName, {
      font: BOLD,
      size: 11,
      color: COLORS.ink,
    });
    const kind = options.documentKind.toUpperCase();
    const kindWidth = measureText(kind, BOLD, SIZES.label) + 1.2 * (kind.length - 1);
    drawText(page, right - kindWidth, size.height - margin - 10, kind, {
      font: BOLD,
      size: SIZES.label,
      color: COLORS.accent,
      charSpacing: 1.2,
    });
    drawRect(page, left, size.height - margin - 22, contentWidth, 1.6, COLORS.accent);
  }

  function startPage() {
    page = createPage(size);
    pages.push(page);
    drawHeader();
    y = headerBottom;
  }

  /** Break to a new page unless `height` still fits above the footer. */
  function ensure(height: number) {
    if (y - height < footerTop) startPage();
  }

  function lineBlock(
    lines: string[],
    font: PdfFont,
    fontSize: number,
    color: Rgb,
    lineHeight: number,
    indent = 0
  ) {
    for (const line of lines) {
      ensure(lineHeight);
      if (line.length > 0) {
        const baseline = y - (lineHeight - fontSize) / 2 - fontSize * 0.78;
        drawText(page, left + indent, baseline, line, { font, size: fontSize, color });
      }
      y -= lineHeight;
    }
  }

  startPage();

  const api = {
    /** Remaining vertical space on the current page (points). */
    get remaining() {
      return y - footerTop;
    },

    gap(height: number) {
      y -= height;
    },

    /**
     * Document title + optional one-line subtitle (client, brief …).
     * The title is a heading, not a body: it is capped at `maxLines` and
     * ellipsised, so a 400-character title can never push the actual
     * document off the first page (the full text still lives in the app).
     */
    titleBlock(title: string, subtitle?: string, maxLines = 4) {
      const wrapped = wrapText(title, BOLD, SIZES.title, contentWidth);
      const lines = wrapped.slice(0, maxLines);
      if (wrapped.length > maxLines) {
        lines[maxLines - 1] = ellipsize(
          `${lines[maxLines - 1]} ${wrapped[maxLines]}`,
          BOLD,
          SIZES.title,
          contentWidth
        );
      }
      lineBlock(lines, BOLD, SIZES.title, COLORS.ink, SIZES.title * 1.25);
      if (subtitle) {
        y -= 2;
        lineBlock(
          wrapText(subtitle, BODY, SIZES.body + 0.5, contentWidth),
          BODY,
          SIZES.body + 0.5,
          COLORS.muted,
          (SIZES.body + 0.5) * 1.35
        );
      }
    },

    /** Uppercase section label — the app's field-label treatment. */
    label(text: string) {
      ensure(SIZES.label * 2);
      const baseline = y - SIZES.label;
      drawText(page, left, baseline, text.toUpperCase(), {
        font: BOLD,
        size: SIZES.label,
        color: COLORS.muted,
        charSpacing: 0.6,
      });
      y -= SIZES.label * 1.9;
    },

    heading(text: string) {
      ensure(SIZES.heading * 2);
      lineBlock(
        wrapText(text, BOLD, SIZES.heading, contentWidth),
        BOLD,
        SIZES.heading,
        COLORS.ink,
        SIZES.heading * 1.5
      );
    },

    /** Body copy. Explicit newlines survive; long lines wrap. */
    paragraph(
      text: string,
      opts: { color?: Rgb; italic?: boolean; size?: number } = {}
    ) {
      const fontSize = opts.size ?? SIZES.body;
      const font = opts.italic ? ITALIC : BODY;
      lineBlock(
        wrapParagraphs(text, font, fontSize, contentWidth),
        font,
        fontSize,
        opts.color ?? COLORS.ink,
        fontSize * 1.45
      );
    },

    /** Deliverables / scope lists. `done` draws a filled marker. */
    checklist(items: { text: string; done?: boolean }[]) {
      const fontSize = SIZES.body;
      const lineHeight = fontSize * 1.45;
      const indent = 16;
      const box = 6.5;
      for (const item of items) {
        const lines = wrapText(item.text, BODY, fontSize, contentWidth - indent);
        ensure(lineHeight);
        const markerY = y - lineHeight / 2 - 2.6;
        if (item.done) {
          drawRect(page, left + 1, markerY, box, box, COLORS.accent);
        } else {
          // Hairline is too faint to read as a box at 6.5pt — the unchecked
          // marker uses the border tone, hollowed out with a white inset.
          drawRect(page, left + 1, markerY, box, box, COLORS.border);
          drawRect(page, left + 2, markerY + 1, box - 2, box - 2, COLORS.white);
        }
        lineBlock(lines, BODY, fontSize, COLORS.ink, lineHeight, indent);
      }
    },

    /** Label/value pairs laid out in N columns (the meta grid). */
    metaGrid(pairs: { label: string; value: string }[], columns = 3) {
      if (pairs.length === 0) return;
      const colWidth = contentWidth / columns;
      for (let i = 0; i < pairs.length; i += columns) {
        const row = pairs.slice(i, i + columns);
        ensure(26);
        const labelBaseline = y - SIZES.label;
        const valueBaseline = labelBaseline - SIZES.body - 3;
        row.forEach((pair, col) => {
          const x = left + col * colWidth;
          drawText(page, x, labelBaseline, pair.label.toUpperCase(), {
            font: BOLD,
            size: SIZES.label,
            color: COLORS.muted,
            charSpacing: 0.6,
          });
          drawText(
            page,
            x,
            valueBaseline,
            ellipsize(pair.value, BODY, SIZES.body, colWidth - 8),
            { font: BODY, size: SIZES.body, color: COLORS.ink }
          );
        });
        y -= 26;
      }
    },

    rule(spaceBefore = 8, spaceAfter = 10) {
      ensure(spaceBefore + spaceAfter + 1);
      y -= spaceBefore;
      drawLine(page, left, y, right, y, COLORS.hairline, 0.7);
      y -= spaceAfter;
    },

    /** Line-item table with a repeating header and zebra rows. */
    table(spec: TableSpec) {
      const totalWeight = spec.columns.reduce((sum, c) => sum + c.width, 0);
      const widths = spec.columns.map((c) => (c.width / totalWeight) * contentWidth);
      const xs: number[] = [];
      let cursor = left;
      for (const w of widths) {
        xs.push(cursor);
        cursor += w;
      }
      const pad = 6;
      const fontSize = SIZES.body;
      const lineHeight = fontSize * 1.35;

      const drawHeaderRow = () => {
        ensure(22);
        const baseline = y - 12;
        spec.columns.forEach((col, i) => {
          const text = col.header.toUpperCase();
          const x =
            col.align === "right"
              ? xs[i] + widths[i] - pad - measureText(text, BOLD, SIZES.label) - 0.6 * (text.length - 1)
              : xs[i] + pad;
          drawText(page, x, baseline, text, {
            font: BOLD,
            size: SIZES.label,
            color: COLORS.muted,
            charSpacing: 0.6,
          });
        });
        y -= 18;
        drawLine(page, left, y, right, y, COLORS.hairline, 0.7);
        y -= 2;
      };

      drawHeaderRow();

      if (spec.rows.length === 0) {
        api.gap(4);
        api.paragraph(spec.emptyText ?? "No items.", {
          color: COLORS.muted,
          italic: true,
        });
        return;
      }

      spec.rows.forEach((row, rowIndex) => {
        const cells = spec.columns.map((col, i) => {
          const text = row[i] ?? "";
          const inner = widths[i] - pad * 2;
          return col.wrap === false
            ? [ellipsize(text, BODY, fontSize, inner)]
            : wrapText(text, BODY, fontSize, inner);
        });
        const rowHeight = Math.max(...cells.map((c) => c.length)) * lineHeight + 9;

        // A row never straddles a page: break first, then repeat the header.
        if (y - rowHeight < footerTop) {
          startPage();
          drawHeaderRow();
        }

        if (rowIndex % 2 === 1) {
          drawRect(page, left, y - rowHeight, contentWidth, rowHeight, COLORS.zebra);
        }

        cells.forEach((lines, i) => {
          const col = spec.columns[i];
          lines.forEach((line, lineIndex) => {
            const baseline = y - 5 - lineHeight * lineIndex - fontSize * 0.85;
            const x =
              col.align === "right"
                ? xs[i] + widths[i] - pad - measureText(line, BODY, fontSize)
                : xs[i] + pad;
            drawText(page, x, baseline, line, {
              font: BODY,
              size: fontSize,
              color: COLORS.ink,
            });
          });
        });
        y -= rowHeight;
      });

      drawLine(page, left, y, right, y, COLORS.hairline, 0.7);
    },

    /** Right-aligned subtotal → tax → total block. */
    totals(rows: TotalsRow[]) {
      const blockWidth = 220;
      const blockLeft = right - blockWidth;
      for (const row of rows) {
        const font = row.emphasis ? BOLD : BODY;
        const fontSize = row.emphasis ? SIZES.body + 2 : SIZES.body;
        const rowHeight = fontSize * 1.9;
        ensure(rowHeight);
        if (row.emphasis) {
          drawLine(page, blockLeft, y - 2, right, y - 2, COLORS.hairline, 0.7);
        }
        const baseline = y - rowHeight / 2 - fontSize * 0.3;
        drawText(page, blockLeft, baseline, row.label, {
          font,
          size: fontSize,
          color: row.emphasis ? COLORS.ink : COLORS.muted,
        });
        const valueWidth = measureText(row.value, font, fontSize);
        drawText(page, right - valueWidth, baseline, row.value, {
          font,
          size: fontSize,
          color: row.emphasis ? COLORS.accent : COLORS.ink,
        });
        y -= rowHeight;
      }
    },

    /**
     * Two side-by-side signature lines (contracts). Rules first, captions
     * under them — the print convention, and the honest surface while the
     * product has no e-signature.
     */
    signatures(leftParty: string, rightParty: string) {
      const gutter = 32;
      const columnWidth = (contentWidth - gutter) / 2;
      ensure(54);
      y -= 26;
      const ruleY = y;
      drawLine(page, left, ruleY, left + columnWidth, ruleY, COLORS.ink, 0.7);
      drawLine(page, right - columnWidth, ruleY, right, ruleY, COLORS.ink, 0.7);
      const captionY = ruleY - 11;
      drawText(page, left, captionY, ellipsize(leftParty, BODY, SIZES.small, columnWidth), {
        font: BODY,
        size: SIZES.small,
        color: COLORS.ink,
      });
      drawText(
        page,
        right - columnWidth,
        captionY,
        ellipsize(rightParty, BODY, SIZES.small, columnWidth),
        { font: BODY, size: SIZES.small, color: COLORS.ink }
      );
      const dateY = captionY - 11;
      drawText(page, left, dateY, "Signature and date", {
        font: BODY,
        size: SIZES.small,
        color: COLORS.muted,
      });
      drawText(page, right - columnWidth, dateY, "Signature and date", {
        font: BODY,
        size: SIZES.small,
        color: COLORS.muted,
      });
      y = dateY - 8;
    },

    /** A tinted status strip — the print stand-in for the app's badge. */
    statusStrip(label: string, note?: string) {
      const height = 22;
      ensure(height + 6);
      drawRect(page, left, y - height, contentWidth, height, COLORS.zebra);
      drawRect(page, left, y - height, 3, height, COLORS.accent);
      const baseline = y - height + 7.5;
      drawText(page, left + 12, baseline, label.toUpperCase(), {
        font: BOLD,
        size: SIZES.label,
        color: COLORS.ink,
        charSpacing: 0.6,
      });
      if (note) {
        const noteWidth = measureText(note, BODY, SIZES.small);
        drawText(page, right - 12 - noteWidth, baseline, note, {
          font: BODY,
          size: SIZES.small,
          color: COLORS.muted,
        });
      }
      y -= height + 6;
    },

    /** Stamp footers (page count is only knowable now) and serialise. */
    finish(): Uint8Array {
      const stamp = `Generated ${pdfDateLabel(options.generatedAt)} \u00b7 nookscript`;
      pages.forEach((p, index) => {
        drawLine(p, left, margin + 18, right, margin + 18, COLORS.hairline, 0.7);
        drawText(p, left, margin + 7, stamp, {
          font: BODY,
          size: SIZES.small,
          color: COLORS.muted,
        });
        const pageLabel = `Page ${index + 1} of ${pages.length}`;
        const labelWidth = measureText(pageLabel, BODY, SIZES.small);
        drawText(p, right - labelWidth, margin + 7, pageLabel, {
          font: BODY,
          size: SIZES.small,
          color: COLORS.muted,
        });
      });

      return renderPdf(pages, {
        title: options.title,
        author: options.workspaceName,
        subject: options.subject,
        createdAt: options.generatedAt,
      });
    },
  };

  return api;
}

export type Layout = ReturnType<typeof createLayout>;
