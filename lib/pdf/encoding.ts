/**
 * Unicode → WinAnsiEncoding byte mapping for the PDF writer (PDF export).
 *
 * Every font the writer declares carries `/Encoding /WinAnsiEncoding`, so a
 * text string inside a content stream is a sequence of CP1252 bytes — NOT
 * UTF-8. App text is UTF-8 JavaScript, so it is transcoded here, once, at
 * the boundary.
 *
 * Three layers, in order:
 *   1. direct  — ASCII (32–126) and Latin-1 (160–255) are their own codes;
 *      the CP1252 typographic block (128–159: curly quotes, en/em dash,
 *      ellipsis, bullet, €, ™ …) is an explicit table. Those cover
 *      essentially everything the app renders, because the UI copy itself
 *      is written with typographic punctuation.
 *   2. transliterate — characters WinAnsi has no glyph for but that have an
 *      honest ASCII rendering (₹ → "Rs.", − → "-", ≤ → "<=", non-breaking
 *      space → space, zero-width characters → nothing).
 *   3. decompose — anything left is NFD-normalised and stripped of its
 *      combining marks (ā → a, ṣ → s), so accented text from scripts the
 *      base-14 fonts cannot draw still reads. Only then does a character
 *      become "?" — visible, never silent corruption, never a crash.
 *
 * The public surface is deliberately tiny: `toWinAnsi(text)` returns a
 * latin1 string (every char code ≤ 255) that both the metrics measurer and
 * the content-stream serialiser consume, so measurement and drawing can
 * never disagree about what will be painted.
 */

/** CP1252 0x80–0x9F: the codes WinAnsi adds over Latin-1. */
const CP1252_HIGH: Record<string, number> = {
  "\u20AC": 128, // €
  "\u201A": 130, // ‚
  "\u0192": 131, // ƒ
  "\u201E": 132, // „
  "\u2026": 133, // …
  "\u2020": 134, // †
  "\u2021": 135, // ‡
  "\u02C6": 136, // ˆ
  "\u2030": 137, // ‰
  "\u0160": 138, // Š
  "\u2039": 139, // ‹
  "\u0152": 140, // Œ
  "\u017D": 142, // Ž
  "\u2018": 145, // ‘
  "\u2019": 146, // ’
  "\u201C": 147, // “
  "\u201D": 148, // ”
  "\u2022": 149, // •
  "\u2013": 150, // –
  "\u2014": 151, // —
  "\u02DC": 152, // ˜
  "\u2122": 153, // ™
  "\u0161": 154, // š
  "\u203A": 155, // ›
  "\u0153": 156, // œ
  "\u017E": 158, // ž
  "\u0178": 159, // Ÿ
};

/** Characters with no WinAnsi glyph but an honest ASCII rendering. */
const TRANSLITERATIONS: Record<string, string> = {
  "\u00A0": " ", // no-break space → space (WinAnsi 160 exists but reads as a
  //                 space anyway; normalising avoids sticky wrap points)
  "\u2007": " ", // figure space
  "\u2009": " ", // thin space
  "\u202F": " ", // narrow no-break space
  "\u200B": "", // zero-width space
  "\u200C": "", // zero-width non-joiner
  "\u200D": "", // zero-width joiner
  "\uFEFF": "", // BOM
  "\u00AD": "", // soft hyphen
  "\u2010": "-",
  "\u2011": "-",
  "\u2012": "-",
  "\u2015": "-",
  "\u2212": "-", // minus sign
  "\u2044": "/", // fraction slash
  "\u2264": "<=",
  "\u2265": ">=",
  "\u2260": "!=",
  "\u2192": "->",
  "\u2190": "<-",
  "\u2248": "~",
  "\u20B9": "Rs.", // ₹ — the base-14 fonts have no rupee glyph
  "\u20BD": "RUB", // ₽
  "\u20A9": "W", // ₩
  "\u2B24": "*",
  "\u25CF": "*",
  "\u25AA": "*",
  "\u2713": "x", // ✓ — checkbox state is drawn as a mark, never as a glyph
  "\u2717": "x",
  "\t": "  ",
};

/** Replacement for a character that survives every layer above. */
const FALLBACK = "?";

function directCode(char: string): number | null {
  const cp = char.codePointAt(0);
  if (cp === undefined) return null;
  if (cp >= 32 && cp <= 126) return cp;
  if (cp >= 160 && cp <= 255) return cp;
  const high = CP1252_HIGH[char];
  return high === undefined ? null : high;
}

function encodeChar(char: string, out: number[]): void {
  // Transliterations run FIRST: a few of them (no-break space, soft hyphen)
  // do have WinAnsi codes, but keeping them would make wrapping
  // unpredictable — the layout measures what it draws, so exotic spaces are
  // normalised to real ones here, once.
  const ascii = TRANSLITERATIONS[char];
  if (ascii !== undefined) {
    for (const c of ascii) out.push(c.charCodeAt(0));
    return;
  }

  const direct = directCode(char);
  if (direct !== null) {
    out.push(direct);
    return;
  }

  // Strip combining marks (ā → a) and retry each resulting character once.
  const decomposed = char.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (decomposed !== char && decomposed.length > 0) {
    let encodedAny = false;
    for (const piece of decomposed) {
      const code = directCode(piece);
      if (code !== null) {
        out.push(code);
        encodedAny = true;
      }
    }
    if (encodedAny) return;
  }

  out.push(FALLBACK.charCodeAt(0));
}

/**
 * UTF-8 app text → a latin1 string whose char codes ARE the WinAnsi bytes
 * written into the PDF. Newlines/carriage returns are dropped: line breaks
 * are a layout decision (lib/pdf/layout.ts splits on them before calling).
 */
export function toWinAnsi(text: string): string {
  const out: number[] = [];
  // Iterating the string (not indexing) keeps surrogate pairs — emoji, CJK —
  // as single characters, so they cost exactly one "?" instead of two.
  for (const char of text.normalize("NFC")) {
    if (char === "\n" || char === "\r") continue;
    encodeChar(char, out);
  }
  // Chunked: String.fromCharCode(...out) would spread a whole contract's
  // worth of bytes onto the call stack (RangeError past ~64k arguments).
  let encoded = "";
  for (let i = 0; i < out.length; i += 4096) {
    encoded += String.fromCharCode.apply(null, out.slice(i, i + 4096));
  }
  return encoded;
}

/** WinAnsi byte codes for `text` — what the width tables are indexed by. */
export function winAnsiCodes(text: string): number[] {
  const encoded = toWinAnsi(text);
  const codes: number[] = [];
  for (let i = 0; i < encoded.length; i += 1) codes.push(encoded.charCodeAt(i));
  return codes;
}

/**
 * Escape a WinAnsi string for a PDF literal string `( … )`: backslash and
 * both parentheses are escaped, control bytes go octal. (Balanced parens
 * would be legal unescaped; escaping unconditionally keeps the writer
 * honest about strings it did not author, like client names.)
 */
export function escapePdfString(winAnsi: string): string {
  let out = "";
  for (let i = 0; i < winAnsi.length; i += 1) {
    const code = winAnsi.charCodeAt(i);
    const char = winAnsi[i];
    if (char === "\\" || char === "(" || char === ")") {
      out += `\\${char}`;
    } else if (code < 32 || code === 127) {
      out += `\\${code.toString(8).padStart(3, "0")}`;
    } else {
      out += char;
    }
  }
  return out;
}
