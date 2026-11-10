import { describe, expect, it } from 'vitest';
import { compareStageKeys, kindOf, makeStepIds, parseOrder, slug, stageKeyOf, UNPARSEABLE_STAGE_KEY } from './index.ts';

describe('order → stage key (MOD-03)', () => {
  it('parses letters and numeric suffixes, case-insensitively', () => {
    expect(parseOrder('a')).toEqual({ letters: 'a', suffix: 0 });
    expect(parseOrder(' F1 ')).toEqual({ letters: 'f', suffix: 1 });
    expect(parseOrder('a-1')).toBeNull();
  });

  it('sorts a < b < f < f1 < f2 < g < z < aa', () => {
    const raw = ['aa', 'g', 'f2', 'a', 'z', 'f1', 'b', 'f'];
    const sorted = [...raw].sort((x, y) => compareStageKeys(stageKeyOf(x), stageKeyOf(y)));
    expect(sorted).toEqual(['a', 'b', 'f', 'f1', 'f2', 'g', 'z', 'aa']);
  });

  it('maps the same letter to the same stage (parallel steps)', () => {
    expect(stageKeyOf('k')).toBe(stageKeyOf('K'));
  });

  it('sends unparseable orders to the end', () => {
    expect(stageKeyOf('??')).toBe(UNPARSEABLE_STAGE_KEY);
    expect(compareStageKeys(stageKeyOf('zz'), UNPARSEABLE_STAGE_KEY)).toBe(-1);
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
