/**
 * A minimal, dependency-free PDF 1.7 writer (PDF export, 2026-09-27).
 *
 * WHY IN-HOUSE: the repo's standing rule is no new runtime dependencies for
 * things it can own honestly (lib/stripe.ts talks to Stripe over fetch,
 * lib/email/* does OAuth with node:crypto). A PDF that only needs the
 * base-14 fonts is a text format with a byte-offset table at the end —
 * ~200 lines — and owning it keeps the output deterministic and testable
 * (tests/lib/pdf-writer.test.ts parses the bytes back).
 *
 * WHAT IT SUPPORTS (exactly what the documents need):
 *   - multiple pages of one size, portrait
 *   - Helvetica / Helvetica-Bold / Helvetica-Oblique, WinAnsiEncoding
 *   - text runs at absolute positions, in RGB
 *   - filled rectangles and straight lines (rules, table zebra, marks)
 *   - a Document Information dictionary (title/author/subject/dates)
 *
 * WHAT IT DOES NOT: embedded fonts, images, links, outlines, encryption,
 * compression. Streams are written UNCOMPRESSED on purpose — a
 * nookscript PDF is a few kilobytes, and a plain-text content stream is
 * greppable in tests and debuggable by a human with `less`.
 *
 * COORDINATES: PDF user space — origin BOTTOM-LEFT, y grows upward, units
 * are points (1/72"). lib/pdf/layout.ts is the top-down flow layer on top.
 */

import { escapePdfString, toWinAnsi } from "./encoding.ts";
import type { PdfFont } from "./metrics.ts";

/** Font resource names inside the page dictionary. */
const FONT_RESOURCE: Record<PdfFont, string> = {
  Helvetica: "F1",
  "Helvetica-Bold": "F2",
  "Helvetica-Oblique": "F3",
};

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface TextOptions {
  font: PdfFont;
  size: number;
  color?: Rgb;
  /** Extra space between glyphs (points) — used for small-caps labels. */
  charSpacing?: number;
}

export interface PdfPageSize {
  width: number;
  height: number;
}

/** ISO A4 and US Letter, in points. */
export const PAGE_SIZES = {
  a4: { width: 595.28, height: 841.89 },
  letter: { width: 612, height: 792 },
} as const;

export type PageSizeName = keyof typeof PAGE_SIZES;

export interface PdfMetadata {
  title: string;
  author: string;
  subject?: string;
  /** Injected so a document's bytes are deterministic in tests. */
  createdAt: Date;
}

function fmt(n: number): string {
  // 2dp is finer than any printer's resolution and keeps streams short;
  // `-0` and `1.50` are normalised so byte output is stable.
  const rounded = Math.round(n * 100) / 100;
  const out = (Object.is(rounded, -0) ? 0 : rounded).toFixed(2);
  return out.replace(/\.?0+$/, "") || "0";
}

function color(c: Rgb): string {
  return `${fmt(c.r)} ${fmt(c.g)} ${fmt(c.b)}`;
}

/**
 * A PDF *text string* (used in the Info dictionary — NOT in content
 * streams, which are WinAnsi bytes). ASCII goes out as a literal; anything
 * else becomes a UTF-16BE hex string with a BOM, which is the only encoding
 * readers agree on for metadata. (Writing an em dash as a raw WinAnsi byte
 * here makes Acrobat/pdf.js read it back through PDFDocEncoding and show
 * "Š" in the title bar — this is the fix for that.)
 */
function textString(value: string): string {
  if (/^[\x20-\x7e]*$/.test(value)) {
    return `(${escapePdfString(value)})`;
  }
  let hex = "FEFF";
  for (const char of value) {
    const cp = char.codePointAt(0) ?? 0x3f;
    if (cp > 0xffff) {
      // Surrogate pair — write both halves.
      const v = cp - 0x10000;
      hex += (0xd800 + (v >> 10)).toString(16).padStart(4, "0").toUpperCase();
      hex += (0xdc00 + (v & 0x3ff)).toString(16).padStart(4, "0").toUpperCase();
    } else {
      hex += cp.toString(16).padStart(4, "0").toUpperCase();
    }
  }
  return `<${hex}>`;
}

/** "D:20260927103000Z" — the PDF date string, always in UTC. */
export function pdfDate(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `D:${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}` +
    `${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}Z`
  );
}

/** One page under construction: a content-stream op list + the fonts used. */
export interface PdfPage {
  size: PdfPageSize;
  ops: string[];
  fonts: Set<PdfFont>;
}

export function createPage(size: PdfPageSize): PdfPage {
  return { size, ops: [], fonts: new Set() };
}

/** Draw a single line of text with its BASELINE at (x, y). */
export function drawText(
  page: PdfPage,
  x: number,
  y: number,
  text: string,
  options: TextOptions
): void {
  const encoded = toWinAnsi(text);
  if (encoded.length === 0) return;
  page.fonts.add(options.font);
  const fill = options.color ?? { r: 0, g: 0, b: 0 };
  const spacing = options.charSpacing ?? 0;
  page.ops.push(
    "BT",
    `${color(fill)} rg`,
    `/${FONT_RESOURCE[options.font]} ${fmt(options.size)} Tf`,
    ...(spacing !== 0 ? [`${fmt(spacing)} Tc`] : []),
    `1 0 0 1 ${fmt(x)} ${fmt(y)} Tm`,
    `(${escapePdfString(encoded)}) Tj`,
    ...(spacing !== 0 ? ["0 Tc"] : []),
    "ET"
  );
}

/** Filled rectangle with (x, y) at its BOTTOM-left corner. */
export function drawRect(
  page: PdfPage,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: Rgb
): void {
  page.ops.push(
    "q",
    `${color(fill)} rg`,
    `${fmt(x)} ${fmt(y)} ${fmt(width)} ${fmt(height)} re`,
    "f",
    "Q"
  );
}

/** Straight line from (x1, y1) to (x2, y2). */
export function drawLine(
  page: PdfPage,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  stroke: Rgb,
  lineWidth = 0.5
): void {
  page.ops.push(
    "q",
    `${color(stroke)} RG`,
    `${fmt(lineWidth)} w`,
    `${fmt(x1)} ${fmt(y1)} m`,
    `${fmt(x2)} ${fmt(y2)} l`,
    "S",
    "Q"
  );
}

/**
 * Serialise pages into PDF bytes.
 *
 * Object layout: 1 Catalog, 2 Pages, 3 Info, then per page a Page dict and
 * its Contents stream, then one Font object per font actually used. The
 * cross-reference table records each object's byte offset, so the body is
 * assembled as latin1 text and measured as it grows.
 */
export function renderPdf(pages: PdfPage[], meta: PdfMetadata): Uint8Array {
  if (pages.length === 0) throw new Error("renderPdf: no pages");

  const usedFonts: PdfFont[] = [];
  for (const page of pages) {
    page.fonts.forEach((font) => {
      if (!usedFonts.includes(font)) usedFonts.push(font);
    });
  }
  // Always resource at least one font: a page of pure rules is legal, but a
  // /Font dictionary that resolves nothing is a broken reader experience.
  if (usedFonts.length === 0) usedFonts.push("Helvetica");

  const CATALOG = 1;
  const PAGES = 2;
  const INFO = 3;
  const firstPageObj = 4;
  const pageObjId = (i: number) => firstPageObj + i * 2;
  const contentObjId = (i: number) => firstPageObj + i * 2 + 1;
  const fontObjId = (i: number) => firstPageObj + pages.length * 2 + i;
  const totalObjects = 3 + pages.length * 2 + usedFonts.length;

  const fontResources = usedFonts
    .map((font, i) => `/${FONT_RESOURCE[font]} ${fontObjId(i)} 0 R`)
    .join(" ");

  const objects: string[] = [];
  const push = (id: number, body: string) => {
    objects[id] = `${id} 0 obj\n${body}\nendobj\n`;
  };

  push(CATALOG, `<< /Type /Catalog /Pages ${PAGES} 0 R >>`);
  push(
    PAGES,
    `<< /Type /Pages /Count ${pages.length} /Kids [${pages
      .map((_, i) => `${pageObjId(i)} 0 R`)
      .join(" ")}] >>`
  );

  const info = [
    `/Title ${textString(meta.title)}`,
    `/Author ${textString(meta.author)}`,
    meta.subject ? `/Subject ${textString(meta.subject)}` : "",
    "/Creator (nookscript)",
    "/Producer (nookscript pdf writer)",
    `/CreationDate (${pdfDate(meta.createdAt)})`,
    `/ModDate (${pdfDate(meta.createdAt)})`,
  ]
    .filter(Boolean)
    .join(" ");
  push(INFO, `<< ${info} >>`);

  pages.forEach((page, i) => {
    push(
      pageObjId(i),
      `<< /Type /Page /Parent ${PAGES} 0 R ` +
        `/MediaBox [0 0 ${fmt(page.size.width)} ${fmt(page.size.height)}] ` +
        `/Resources << /Font << ${fontResources} >> >> ` +
        `/Contents ${contentObjId(i)} 0 R >>`
    );
    const stream = page.ops.join("\n");
    push(
      contentObjId(i),
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
    );
  });

  usedFonts.forEach((font, i) => {
    push(
      fontObjId(i),
      `<< /Type /Font /Subtype /Type1 /BaseFont /${font} ` +
        "/Encoding /WinAnsiEncoding >>"
    );
  });

  // %PDF header + a binary comment line: the convention that tells tools
  // handling the file (mail servers, proxies) to treat it as binary.
  let body = "%PDF-1.7\n%\u00E2\u00E3\u00CF\u00D3\n";
  const offsets: number[] = [];
  for (let id = 1; id <= totalObjects; id += 1) {
    offsets[id] = body.length;
    body += objects[id];
  }

  const xrefOffset = body.length;
  let xref = `xref\n0 ${totalObjects + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= totalObjects; id += 1) {
    xref += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }

  const trailer =
    `trailer\n<< /Size ${totalObjects + 1} /Root ${CATALOG} 0 R ` +
    `/Info ${INFO} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  // latin1 by construction: every char in the document is a WinAnsi byte
  // (lib/pdf/encoding.ts guarantees it), so the string's length IS its byte
  // length — which is what the xref offsets and /Length entries above were
  // computed from. Written out by hand rather than with Buffer so the writer
  // stays runtime-agnostic (Node, edge, or a browser worker).
  const text = body + xref + trailer;
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i) & 0xff;
  return bytes;
}
