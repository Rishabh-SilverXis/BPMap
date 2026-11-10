/**
 * Stable identifiers (Architecture §6.2, MOD-02).
 *
 * A step ID is derived from *what the step is* (order + kind + task), never from its row
 * position, so overlays, dismissed findings and comments survive re-exports and row re-ordering.
 */
import type { StepId, StepKind } from './schema.ts';

export function slug(input: string, max = 48): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics after decomposition
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
}

export interface StepIdInput {
  order: string;
  kind: StepKind;
  task: string;
  rawType: string;
}

/**
 * IDs for a whole definition, in source-row order. Collisions get "~2", "~3"… in row order, so
 * the first occurrence keeps the clean ID.
 */
export function makeStepIds(steps: readonly StepIdInput[]): StepId[] {
  const seen = new Map<string, number>();
  return steps.map((s) => {
    const base = `${slug(s.order) || 'x'}-${s.kind}-${slug(s.task || s.rawType) || 'step'}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return (n === 1 ? base : `${base}~${n}`) as StepId;
  });
}

export const definitionIdOf = (process: string, variant: string): string =>
  variant ? `${slug(process)}--${slug(variant)}` : slug(process);
