/**
 * Workday order letters → sortable stage keys (Architecture §7.4, MOD-03).
 *
 * Workday runs a definition in order: a, then b, then c. Steps that share an order value run in
 * parallel. Suffixed values such as "f1" form their own stage between "f" and "g".
 *
 * Key format: letters left-padded with "_" to 3 chars + numeric suffix left-padded to 3 digits.
 * Because "_" (0x5F) sorts before "a" (0x61), shorter letter runs sort first, which gives
 * a … z, aa … zz (length, then alphabet), then by suffix: "__f000" < "__f001" < "__g000".
 *
 * NOTE (Architecture T1): ordering beyond "z" and suffix behaviour must be confirmed against
 * the fixture corpus of real exports.
 */
import type { StageKey } from './schema.ts';

export interface ParsedOrder {
  letters: string;
  suffix: number;
}

const ORDER_RE = /^([a-z]{1,3})(\d{0,3})$/i;
export const UNPARSEABLE_STAGE_KEY = 'zzz999' as StageKey;

export function parseOrder(raw: string): ParsedOrder | null {
  const m = ORDER_RE.exec(raw.trim());
  if (!m) return null;
  return { letters: m[1]!.toLowerCase(), suffix: m[2] ? Number(m[2]) : 0 };
}

export function stageKeyOf(raw: string): StageKey {
  const p = parseOrder(raw);
  if (!p) return UNPARSEABLE_STAGE_KEY;
  return `${p.letters.padStart(3, '_')}${String(p.suffix).padStart(3, '0')}` as StageKey;
}

export const compareStageKeys = (a: StageKey, b: StageKey): number => (a < b ? -1 : a > b ? 1 : 0);
