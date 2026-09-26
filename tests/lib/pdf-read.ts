/**
 * A tiny PDF reader used ONLY by the tests (not shipped, not imported by
 * the app). It is the counterpart to lib/pdf/writer.ts: whatever the writer
 * emits, this parses back — object offsets, page dictionaries, content
 * streams and the text runs inside them.
 *
 * Why not assert on raw bytes: byte-level goldens rot the moment a margin
 * changes. Reading the document back and asserting what a READER would see
 * (this many pages, this text, at this x) is the assertion that actually
 * matches the promise the feature makes.
 *
 * (The same documents are additionally verified against a real PDF engine —
 * see scripts/verify-pdf.mjs and docs/pdf-export-closeout.md.)
 */

/** Bytes → latin1 text (the writer's own encoding, 1 char = 1 byte). */
export function decodePdf(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 4096) {
    out += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + 4096))
    );
  }
  return out;
}

export interface PdfObject {
  id: number;
  body: string;
  /** Decoded stream payload when the object carries one. */
  stream: string | null;
}

/** Every "N 0 obj … endobj" in document order. */
export function parseObjects(pdf: string): PdfObject[] {
  const objects: PdfObject[] = [];
  const re = /(\d+) 0 obj\n([\s\S]*?)\nendobj\n/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(pdf)) !== null) {
    const body = match[2];
    const stream = /stream\n([\s\S]*?)\nendstream$/.exec(body);
    objects.push({
      id: Number(match[1]),
      body,
      stream: stream ? stream[1] : null,
    });
  }
  return objects;
}

/** Byte offsets recorded in the cross-reference table (index = object id).
 *  Located via startxref — "startxref" itself CONTAINS "xref", so a naive
 *  lastIndexOf("xref") finds the wrong place. */
export function parseXref(pdf: string): number[] {
  const section = pdf.slice(parseStartXref(pdf));
  const rows = section.match(/^\d{10} \d{5} [nf] $/gm) ?? [];
  return rows.map((row) => Number(row.slice(0, 10)));
}

/** The `startxref` value at the end of the file. */
export function parseStartXref(pdf: string): number {
  const match = /startxref\n(\d+)\n%%EOF/.exec(pdf);
  if (!match) throw new Error("no startxref");
  return Number(match[1]);
}

/** Content streams, one per page, in page order. */
export function pageStreams(pdf: string): string[] {
  const objects = parseObjects(pdf);
  const byId = new Map(objects.map((o) => [o.id, o]));
  const pages = objects.filter((o) => o.body.includes("/Type /Page "));
  return pages.map((page) => {
    const ref = /\/Contents (\d+) 0 R/.exec(page.body);
    if (!ref) throw new Error(`page ${page.id} has no /Contents`);
    const contents = byId.get(Number(ref[1]));
    // `== null`, not falsy: an empty stream is a legal (if boring) page.
    if (contents?.stream == null) {
      throw new Error(`object ${ref[1]} is not a stream`);
    }
    return contents.stream;
  });
}

/** WinAnsi byte → Unicode (the inverse of lib/pdf/encoding.ts): the reader
 *  must speak the writer's encoding, or every assertion about an em dash
 *  would have to be written as a raw byte. */
const CP1252_REVERSE: Record<number, string> = {
  128: "\u20AC", 130: "\u201A", 131: "\u0192", 132: "\u201E",
  133: "\u2026", 134: "\u2020", 135: "\u2021", 136: "\u02C6",
  137: "\u2030", 138: "\u0160", 139: "\u2039", 140: "\u0152",
  142: "\u017D", 145: "\u2018", 146: "\u2019", 147: "\u201C",
  148: "\u201D", 149: "\u2022", 150: "\u2013", 151: "\u2014",
  152: "\u02DC", 153: "\u2122", 154: "\u0161", 155: "\u203A",
  156: "\u0153", 158: "\u017E", 159: "\u0178",
};

export function fromWinAnsi(bytes: string): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) {
    const code = bytes.charCodeAt(i);
    out += CP1252_REVERSE[code] ?? String.fromCharCode(code);
  }
  return out;
}

function unescapeLiteral(raw: string): string {
  const bytes = raw.replace(/\\(\d{3}|.)/g, (_, escaped: string) =>
    /^\d{3}$/.test(escaped)
      ? String.fromCharCode(parseInt(escaped, 8))
      : escaped
  );
  return fromWinAnsi(bytes);
}

/** Text runs drawn on one page, in the order they were painted. */
export function textRuns(stream: string): string[] {
  const runs: string[] = [];
  const re = /\((?:[^()\\]|\\.)*\) Tj/g;
  const found = stream.match(re) ?? [];
  for (const hit of found) {
    runs.push(unescapeLiteral(hit.slice(1, hit.length - 4)));
  }
  return runs;
}

/** Every text run in the document, page by page. */
export function documentText(bytes: Uint8Array): string[][] {
  return pageStreams(decodePdf(bytes)).map(textRuns);
}

/** All text, flattened — the convenient "does it say X" assertion. */
export function flatText(bytes: Uint8Array): string {
  return documentText(bytes)
    .map((page) => page.join("\n"))
    .join("\n");
}

export interface PlacedRun {
  x: number;
  y: number;
  size: number;
  font: string;
  text: string;
}

/** Text runs WITH their placement — used to assert margins and alignment. */
export function placedRuns(stream: string): PlacedRun[] {
  const runs: PlacedRun[] = [];
  let font = "";
  let size = 0;
  let x = 0;
  let y = 0;
  for (const line of stream.split("\n")) {
    const fontMatch = /^\/(F\d) ([\d.]+) Tf$/.exec(line);
    if (fontMatch) {
      font = fontMatch[1];
      size = Number(fontMatch[2]);
      continue;
    }
    const matrix = /^1 0 0 1 (-?[\d.]+) (-?[\d.]+) Tm$/.exec(line);
    if (matrix) {
      x = Number(matrix[1]);
      y = Number(matrix[2]);
      continue;
    }
    const text = /^\((.*)\) Tj$/.exec(line);
    if (text) {
      runs.push({ x, y, size, font, text: unescapeLiteral(text[1]) });
    }
  }
  return runs;
}

/** Rectangles painted on a page: [x, y, width, height]. */
export function rects(stream: string): number[][] {
  const out: number[][] = [];
  const re = /^(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) re$/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(stream)) !== null) {
    out.push([1, 2, 3, 4].map((i) => Number(match![i])));
  }
  return out;
}
