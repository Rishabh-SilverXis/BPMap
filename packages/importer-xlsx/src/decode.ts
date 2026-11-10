/**
 * Workday export text quirks (DEC-027).
 *
 * The real "View Definition" export writes line breaks inside a cell as the LITERAL text "&#xa;"
 * (the XML holds "&amp;#xa;"), and separates list items with two of them. Text must be decoded
 * BEFORE any splitting: the entity ends in ";", so splitting on ";" first shreds every cell.
 */

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Decode numeric (&#xa; &#10;) and basic named entities; normalise line endings to "\n". */
export function decodeCell(s: string): string {
  if (!s.includes('&') && !s.includes('\r')) return s;
  return s
    .replace(/&#x([0-9a-f]{1,6});?/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d{1,7});?/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, n: string) => NAMED[n]!)
    .replace(/\r\n?/g, '\n');
}

/** Anything that still looks like an entity after decoding means double-encoding we don't understand. */
export const hasEncodingResidue = (s: string): boolean => /&#x?[0-9a-f]+;|&(amp|lt|gt|quot|apos);/i.test(s);

/** Split a decoded cell into its non-empty lines (list items). Never splits on ";" (DEC-027). */
export function cellLines(s: string): string[] {
  return s
    .split('\n')
    .map((x) => x.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/** Excel serial date (e.g. "46336" or "46336.0") → ISO date; any other text is returned trimmed. */
export function excelDate(v: string): string | undefined {
  const t = v.trim();
  if (!t) return undefined;
  if (/^\d{4,6}(\.\d+)?$/.test(t)) {
    const ms = Date.UTC(1899, 11, 30) + Math.floor(Number(t)) * 86_400_000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  return t;
}
