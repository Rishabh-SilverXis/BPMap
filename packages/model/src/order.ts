/**
 * Workday order letters → sortable stage keys (Architecture §7.4, MOD-03).
 *
 * Workday runs a definition in order: a, then b, then c. Steps that share an order value run in
 * parallel. Suffixed values such as "f1" form their own stage between "f" and "g".
 *
 * Workday sorts order letters ALPHABETICALLY (DEC-026): a real Change Job export lists its rows as
 * a, ba, bb, bc, bd, d, e … — "ba" runs after "a" and before "d", not after "z".
 * Within the same letters, a numeric suffix sorts numerically: k < k1 < k2 < k10 < m.
 *
 * Key format: letters RIGHT-padded with "_" to 3 chars + numeric suffix left-padded to 3 digits.
 * "_" (0x5F) sorts before "a" (0x61), so "b__" < "ba_" < "bb_" < "c__" (plain alphabetical order),
 * and "k__000" < "k__001" < "k__010" < "m__000".
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
  return `${p.letters.padEnd(3, '_')}${String(p.suffix).padStart(3, '0')}` as StageKey;
}

export const compareStageKeys = (a: StageKey, b: StageKey): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Migration for stored data (IndexedDB, .bpmap.json): stage keys written before DEC-026 used the
 * old shortest-first format. Keys are derived data, so we simply recompute them from `order`.
 */
export function withFreshStageKeys<T extends { steps: { order: string; stageKey: StageKey }[] }>(def: T): T {
  return { ...def, steps: def.steps.map((s) => ({ ...s, stageKey: stageKeyOf(s.order) })) };
}
