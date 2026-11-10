import { describe, expect, it } from 'vitest';
import { compareStageKeys, withFreshStageKeys, kindOf, makeStepIds, parseOrder, slug, stageKeyOf, UNPARSEABLE_STAGE_KEY } from './index.ts';

describe('order → stage key (MOD-03)', () => {
  it('parses letters and numeric suffixes, case-insensitively', () => {
    expect(parseOrder('a')).toEqual({ letters: 'a', suffix: 0 });
    expect(parseOrder(' F1 ')).toEqual({ letters: 'f', suffix: 1 });
    expect(parseOrder('a-1')).toBeNull();
  });

  it('sorts alphabetically like Workday: a < ba < bb < bd < d (real Change Job export, DEC-026)', () => {
    const raw = ['d', 'bd', 'a', 'bb', 'ba', 'e'];
    expect([...raw].sort((x, y) => compareStageKeys(stageKeyOf(x), stageKeyOf(y)))).toEqual(['a', 'ba', 'bb', 'bd', 'd', 'e']);
  });

  it('sorts numeric suffixes numerically: k < k1 < k2 < k10 < m', () => {
    const raw = ['k10', 'm', 'k2', 'k', 'k1', 'r2', 'r1'];
    expect([...raw].sort((x, y) => compareStageKeys(stageKeyOf(x), stageKeyOf(y)))).toEqual(['k', 'k1', 'k2', 'k10', 'm', 'r1', 'r2']);
  });

  it('maps the same letter to the same stage (parallel steps)', () => {
    expect(stageKeyOf('k')).toBe(stageKeyOf('K'));
  });

  it('sends unparseable orders to the end', () => {
    expect(stageKeyOf('??')).toBe(UNPARSEABLE_STAGE_KEY);
    expect(compareStageKeys(stageKeyOf('zzz'), UNPARSEABLE_STAGE_KEY)).toBe(-1);
  });
});

describe('stable IDs (MOD-02)', () => {
  it('slugs with diacritic folding and truncation', () => {
    expect(slug('Révision: Current Manager!')).toBe('revision-current-manager');
    expect(slug('x'.repeat(80)).length).toBe(48);
  });

  it('derives IDs from content, suffixing collisions in row order', () => {
    const ids = makeStepIds([
      { order: 'k', kind: 'action', task: 'Maintain Employee Contract', rawType: 'Action' },
      { order: 'k', kind: 'action', task: 'Maintain Employee Contract', rawType: 'Action' },
      { order: 'a', kind: 'initiation', task: '', rawType: 'Initiation' },
    ]);
    expect(ids).toEqual(['k-action-maintain-employee-contract', 'k-action-maintain-employee-contract~2', 'a-initiation-initiation']);
  });

  it('is independent of row position', () => {
    const a = { order: 'b', kind: 'approval' as const, task: 'Approve', rawType: 'Approval' };
    const b = { order: 'c', kind: 'todo' as const, task: 'Offboarding', rawType: 'To Do' };
    expect(makeStepIds([a, b])).toEqual([...makeStepIds([b, a])].reverse());
  });
});

describe('kinds (MOD-05)', () => {
  it('maps Workday type labels and keeps unknowns explicit', () => {
    expect(kindOf('To Do')).toBe('todo');
    expect(kindOf('Consolidated  Approval Chain')).toBe('consolidated-approval-chain');
    expect(kindOf('Batch')).toBe('unknown');
  });
});

describe('stored-data migration', () => {
  it('recomputes stage keys written in the old format', () => {
    const old = { steps: [{ order: 'ba', stageKey: '_ba000' as never }, { order: 'd', stageKey: '__d000' as never }] };
    expect(withFreshStageKeys(old).steps.map((s) => s.stageKey)).toEqual(['ba_000', 'd__000']);
  });
});
