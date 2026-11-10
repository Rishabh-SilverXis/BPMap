import { describe, expect, it } from 'vitest';
import { readFixture } from '@bpmap/fixtures';
import { importWorkbook } from '@bpmap/importer-xlsx';
import { evaluateScenario, isScenarioState, pruneScenario } from './index.ts';

const r = importWorkbook(readFixture('workdayLayout'), { importedAt: 'x' });
if (r.status !== 'ok') throw new Error('fixture failed');
const def = r.definition;
const idOf = (text: string) => def.conditions.find((c) => c.text === text)!.id;
const order = (ids: Set<string>) => def.steps.filter((s) => ids.has(s.id)).map((s) => s.order);

describe('evaluateScenario (SCN-01)', () => {
  it('skips every step that has a condition answered "no"', () => {
    const notApp = idOf('Not initiated from a job application?');
    const res = evaluateScenario(def, { [notApp]: 'no' });
    expect(order(res.skipped)).toEqual(['d', 'e', 'f', 'i']); // the whole approval chain
  });

  it('treats "yes" as resolved and "unset" as may-run', () => {
    const c = idOf('Proposed pay change above 10%?');
    const res = evaluateScenario(def, { [c]: 'yes', C999: 'no' });
    expect(res.skipped.size).toBe(0); // unknown IDs are ignored
    expect([...res.resolved]).toEqual([c]);
    expect(res.summary).toBe(`Scenario: ${c} yes`);
  });

  it('orders the summary numerically', () => {
    expect(evaluateScenario(def, { C10: 'no', C2: 'yes', C3: 'unset' }).summary).toBe('Scenario: C2 yes · C10 no');
  });

  it('prunes answers for conditions that no longer exist and validates stored state', () => {
    const s = { answers: { C1: 'yes' as const, C99: 'no' as const }, decisions: ['C1', 'C99'], presets: [{ id: 'p', name: 'x', answers: { C99: 'no' as const } }] };
    expect(pruneScenario(def, s)).toEqual({ answers: { C1: 'yes' }, decisions: ['C1'], presets: [{ id: 'p', name: 'x', answers: {} }] });
    expect(isScenarioState(s)).toBe(true);
    expect(isScenarioState({ answers: { C1: 'maybe' }, decisions: [], presets: [] })).toBe(false);
  });
});
