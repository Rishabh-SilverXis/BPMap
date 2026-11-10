import { describe, expect, it } from 'vitest';
import { readFixture } from '@bpmap/fixtures';
import { importWorkbook } from '@bpmap/importer-xlsx';
import { evaluateScenario, isScenarioState, presetAnswersFor, pruneScenario, rekeyScenario, withTextKeys } from './index.ts';

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

describe('condition renumbering on re-import (DEC-052)', () => {
  const r2 = importWorkbook(readFixture('workdayLayoutV2'), { importedAt: 'x' }); // step o and its 2 conditions removed
  if (r2.status !== 'ok') throw new Error('fixture failed');
  const def2 = r2.definition;
  // a condition that comes after step o, so its Cn shifts in v2
  const shifted = def.conditions.find((c) => {
    const n = def2.conditions.find((d) => d.text === c.text);
    return n && n.id !== c.id;
  })!;
  const newId = def2.conditions.find((c) => c.text === shifted.text)!.id;

  it('the fixture really renumbers a condition', () => {
    expect(shifted).toBeDefined();
    expect(newId).not.toBe(shifted.id);
  });

  it('rekeyScenario moves answers, decisions and presets to the new id by condition text', () => {
    const before = { answers: { [shifted.id]: 'no' as const }, decisions: [shifted.id], presets: [{ id: 'p1', name: 'Case', answers: { [shifted.id]: 'yes' as const } }] };
    const after = rekeyScenario(def, def2, before);
    expect(after.answers).toEqual({ [newId]: 'no' });
    expect(after.decisions).toEqual([newId]);
    expect(after.presets[0]!.answers).toEqual({ [newId]: 'yes' });
    // pruneScenario alone would have kept the OLD id, which now points at a different condition
    const naive = pruneScenario(def2, before);
    if (def2.conditions.some((c) => c.id === shifted.id)) expect(naive.answers[shifted.id]).toBe('no');
  });

  it('answers on conditions that no longer exist are dropped', () => {
    const gone = def.conditions.find((c) => !def2.conditions.some((d) => d.text === c.text))!;
    expect(rekeyScenario(def, def2, { answers: { [gone.id]: 'yes' }, decisions: [], presets: [] }).answers).toEqual({});
  });

  it('a text-keyed preset applies to a differently numbered export (customisations file)', () => {
    const p = withTextKeys(def, { id: 'p', name: 'Case', answers: { [shifted.id]: 'no' } });
    expect(presetAnswersFor(def2, p)).toEqual({ [newId]: 'no' });
    expect(isScenarioState({ answers: {}, decisions: [], presets: [p] })).toBe(true);
    // older presets without byText still apply by id
    expect(presetAnswersFor(def, { id: 'q', name: 'Old', answers: { [shifted.id]: 'yes' } })).toEqual({ [shifted.id]: 'yes' });
  });
});
