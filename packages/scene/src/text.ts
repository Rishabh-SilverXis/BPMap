/**
 * DOM-free text measurement for the scene (exports run in workers / Node, so no canvas measureText).
 * Inter's average advance is ~0.54em (regular) and ~0.58em (semibold+). Approximations err wide so
 * wrapped text never overflows its box; the canvas uses real DOM layout with CSS clamping instead.
 */
export const textWidth = (s: string, size: number, weight = 400) => s.length * size * (weight >= 600 ? 0.58 : 0.54);

export function wrapText(text: string, maxWidth: number, size: number, weight = 400, maxLines = Infinity): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (textWidth(next, size, weight) <= maxWidth || !cur) cur = next;
    else {
      out.push(cur);
      cur = w;
    }
  }
  if (cur) out.push(cur);
  if (out.length <= maxLines) return out;
  const kept = out.slice(0, maxLines);
  let last = kept[maxLines - 1]!;
  while (last.length > 1 && textWidth(`${last}…`, size, weight) > maxWidth) last = last.slice(0, -1).trimEnd();
  kept[maxLines - 1] = `${last}…`;
  return kept;
}
