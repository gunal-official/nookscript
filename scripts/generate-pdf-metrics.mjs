#!/usr/bin/env node
/**
 * Generator for lib/pdf/metrics-data.ts — the base-14 font width tables the
 * PDF writer measures text with (PDF export, 2026-09-27).
 *
 * WHY A GENERATOR AND NOT A DEPENDENCY: the PDF writer ships zero runtime
 * dependencies (house pattern — see lib/stripe.ts / lib/email/*). Base-14
 * fonts are NOT embedded in the file (every reader has them), but the app
 * still has to KNOW their glyph widths to wrap lines and right-align money.
 * Those widths are Adobe's published AFM metrics — data, not code — so they
 * are generated once into a checked-in TS table instead of pulling a font
 * library into the bundle.
 *
 * HOW TO RE-RUN (only needed if a font is added to lib/pdf/writer.ts):
 *
 *   mkdir -p /tmp/afm && cd /tmp/afm
 *   npm pack pdfkit@0.15.0                       # ships Adobe's AFM files
 *   tar xzf pdfkit-0.15.0.tgz 'package/js/data/*.afm'
 *   node scripts/generate-pdf-metrics.mjs /tmp/afm/package/js/data
 *
 * (Any copy of the Adobe Core-14 AFMs works — Ghostscript, PDFBox, pdfkit.
 * The .afm files themselves are NOT vendored: only the width numbers are.)
 *
 * Output: lib/pdf/metrics-data.ts — for each font a 256-entry array of
 * glyph widths in 1/1000 em, indexed by WinAnsiEncoding code (the encoding
 * the writer declares on every font).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const FONTS = ["Helvetica", "Helvetica-Bold", "Helvetica-Oblique"];

/**
 * WinAnsiEncoding (PDF 1.7 Annex D.2) — code → Adobe glyph name.
 * 32–126 is ASCII; 128–159 is the CP1252 typographic block; 160–255 is
 * Latin-1. Undefined codes stay null (the encoder never emits them).
 */
const WINANSI_NAMES = (() => {
  const names = new Array(256).fill(null);
  const ascii = [
    "space", "exclam", "quotedbl", "numbersign", "dollar", "percent",
    "ampersand", "quotesingle", "parenleft", "parenright", "asterisk",
    "plus", "comma", "hyphen", "period", "slash", "zero", "one", "two",
    "three", "four", "five", "six", "seven", "eight", "nine", "colon",
    "semicolon", "less", "equal", "greater", "question", "at",
  ];
  ascii.forEach((name, i) => (names[32 + i] = name));
  for (let c = 65; c <= 90; c += 1) names[c] = String.fromCharCode(c);
  const afterUpper = ["bracketleft", "backslash", "bracketright", "asciicircum", "underscore", "grave"];
  afterUpper.forEach((name, i) => (names[91 + i] = name));
  for (let c = 97; c <= 122; c += 1) names[c] = String.fromCharCode(c);
  ["braceleft", "bar", "braceright", "asciitilde"].forEach(
    (name, i) => (names[123 + i] = name)
  );

  const high = {
    128: "Euro", 130: "quotesinglbase", 131: "florin", 132: "quotedblbase",
    133: "ellipsis", 134: "dagger", 135: "daggerdbl", 136: "circumflex",
    137: "perthousand", 138: "Scaron", 139: "guilsinglleft", 140: "OE",
    142: "Zcaron", 145: "quoteleft", 146: "quoteright", 147: "quotedblleft",
    148: "quotedblright", 149: "bullet", 150: "endash", 151: "emdash",
    152: "tilde", 153: "trademark", 154: "scaron", 155: "guilsinglright",
    156: "oe", 158: "zcaron", 159: "Ydieresis", 160: "space",
    161: "exclamdown", 162: "cent", 163: "sterling", 164: "currency",
    165: "yen", 166: "brokenbar", 167: "section", 168: "dieresis",
    169: "copyright", 170: "ordfeminine", 171: "guillemotleft",
    172: "logicalnot", 173: "hyphen", 174: "registered", 175: "macron",
    176: "degree", 177: "plusminus", 178: "twosuperior",
    179: "threesuperior", 180: "acute", 181: "mu", 182: "paragraph",
    183: "periodcentered", 184: "cedilla", 185: "onesuperior",
    186: "ordmasculine", 187: "guillemotright", 188: "onequarter",
    189: "onehalf", 190: "threequarters", 191: "questiondown",
    192: "Agrave", 193: "Aacute", 194: "Acircumflex", 195: "Atilde",
    196: "Adieresis", 197: "Aring", 198: "AE", 199: "Ccedilla",
    200: "Egrave", 201: "Eacute", 202: "Ecircumflex", 203: "Edieresis",
    204: "Igrave", 205: "Iacute", 206: "Icircumflex", 207: "Idieresis",
    208: "Eth", 209: "Ntilde", 210: "Ograve", 211: "Oacute",
    212: "Ocircumflex", 213: "Otilde", 214: "Odieresis", 215: "multiply",
    216: "Oslash", 217: "Ugrave", 218: "Uacute", 219: "Ucircumflex",
    220: "Udieresis", 221: "Yacute", 222: "Thorn", 223: "germandbls",
    224: "agrave", 225: "aacute", 226: "acircumflex", 227: "atilde",
    228: "adieresis", 229: "aring", 230: "ae", 231: "ccedilla",
    232: "egrave", 233: "eacute", 234: "ecircumflex", 235: "edieresis",
    236: "igrave", 237: "iacute", 238: "icircumflex", 239: "idieresis",
    240: "eth", 241: "ntilde", 242: "ograve", 243: "oacute",
    244: "ocircumflex", 245: "otilde", 246: "odieresis", 247: "divide",
    248: "oslash", 249: "ugrave", 250: "uacute", 251: "ucircumflex",
    252: "udieresis", 253: "yacute", 254: "thorn", 255: "ydieresis",
  };
  for (const [code, name] of Object.entries(high)) names[Number(code)] = name;
  return names;
})();

/** "C 32 ; WX 278 ; N space ; …" → { space: 278, … } */
function parseAfm(text) {
  const widths = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("C ")) continue;
    const wx = /WX\s+(-?\d+)/.exec(line);
    const name = /N\s+([.\w]+)\s*;/.exec(line);
    if (wx && name) widths[name[1]] = Number(wx[1]);
  }
  return widths;
}

const dir = process.argv[2];
if (!dir) {
  console.error("usage: node scripts/generate-pdf-metrics.mjs <dir-with-afm-files>");
  process.exit(1);
}

const tables = [];
const missing = [];
for (const font of FONTS) {
  const widths = parseAfm(readFileSync(join(dir, `${font}.afm`), "utf8"));
  const row = new Array(256).fill(0);
  WINANSI_NAMES.forEach((name, code) => {
    if (!name) return;
    const w = widths[name];
    if (w === undefined) {
      missing.push(`${font}:${code}:${name}`);
      // Fall back to the space width so an exotic glyph can never make a
      // line measure as zero-width (which would break wrapping).
      row[code] = widths.space ?? 278;
      return;
    }
    row[code] = w;
  });
  tables.push({ font, row });
}

if (missing.length > 0) {
  console.warn(`⚠ ${missing.length} glyph(s) absent from the AFMs (space width substituted):`);
  console.warn(`  ${missing.join(", ")}`);
}

const lines = [];
lines.push("/**");
lines.push(" * GENERATED FILE — do not edit by hand.");
lines.push(" * Source: Adobe Core-14 AFM metrics (Helvetica family).");
lines.push(" * Regenerate: node scripts/generate-pdf-metrics.mjs <dir-with-afm-files>");
lines.push(" *");
lines.push(" * One array per font: glyph advance widths in 1/1000 em, indexed by");
lines.push(" * WinAnsiEncoding code (0–255). Codes WinAnsi leaves undefined are 0 —");
lines.push(" * lib/pdf/encoding.ts never emits them.");
lines.push(" */");
lines.push("");
for (const { font, row } of tables) {
  const constName = font.toUpperCase().replace(/-/g, "_");
  lines.push(`const ${constName}: readonly number[] = [`);
  for (let i = 0; i < 256; i += 16) {
    lines.push(`  ${row.slice(i, i + 16).join(", ")},`);
  }
  lines.push("];");
  lines.push("");
}
lines.push("/** Width table per base-14 font the writer can reference. */");
lines.push("export const FONT_WIDTHS = {");
for (const { font } of tables) {
  lines.push(`  "${font}": ${font.toUpperCase().replace(/-/g, "_")},`);
}
lines.push("} as const;");
lines.push("");

const out = join(process.cwd(), "lib/pdf/metrics-data.ts");
writeFileSync(out, lines.join("\n"));
console.log(`wrote ${out} (${tables.length} fonts × 256 codes)`);
