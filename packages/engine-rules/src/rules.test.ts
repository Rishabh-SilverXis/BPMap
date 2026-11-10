import { describe, expect, it } from 'vitest';
import { readFixture } from '@bpmap/fixtures';
import { importWorkbook } from '@bpmap/importer-xlsx';
import { isAlwaysFalse, runRules } from './index.ts';

const load = (name: 'workdayLayout' | 'changeJob') => {
  const r = importWorkbook(readFixture(name), { importedAt: 'x' });
  if (r.status !== 'ok') throw new Error('fixture import failed');
  return r.definition;
};
const real = load('workdayLayout');
const clean = load('changeJob');
const orders = (ids: string[], def = real) => ids.map((id) => def.steps.find((s) => s.id === id)!.order);
const byRule = (id: string, def = real) => runRules(def).filter((f) => f.ruleId === id);

describe('HC-16 always-false condition', () => {
  it('recognises constant-false condition names', () => {
    for (const t of ['1=0?', '1 = 0?', '2==3', 'False?', 'Never?']) expect(isAlwaysFalse(t)).toBe(true);
    for (const t of ['1=1?', 'Country is Canada?', 'Proposed pay change above 10%?', 'Pay > 0?']) expect(isAlwaysFalse(t)).toBe(false);
  });

  it('flags steps s and s1 of the real-layout fixture, and nothing in the clean sample', () => {
    const f = byRule('HC-16');
    expect(f.map((x) => orders(x.stepIds)[0])).toEqual(['s', 's1']);
    expect(f[0]!.message).toContain('can never run');
    expect(byRule('HC-16', clean)).toEqual([]);
  });
});

describe('HC-01..HC-07 (DEC-036)', () => {
  it('HC-01 flags approvals not restricted from the initiator (i: "Subject" only)', () => {
    expect(byRule('HC-01').map((f) => orders(f.stepIds)[0])).toEqual(['i']);
    expect(byRule('HC-01')[0]!.severity).toBe('critical');
  });

  it('skips rules whose column is absent (the synthetic sample has no restrictions)', () => {
    expect(byRule('HC-01', clean)).toEqual([]);
  });

  it('HC-02 flags required person steps with no alternate, never Employee As Self', () => {
    const steps = byRule('HC-02').flatMap((f) => orders(f.stepIds));
    expect(steps).toContain('bd');
    expect(steps).not.toContain('t'); // Employee As Self
    expect(steps).not.toContain('bb'); // has an alternate
  });

  it('HC-04 finds the same group in consecutive single stages; HC-05 finds pile-ups', () => {
    const pairs = byRule('HC-04').map((f) => orders(f.stepIds).join('→'));
    expect(pairs).toContain('ba→bb'); // both HR Partner
    expect(byRule('HC-05', clean).map((f) => orders(f.stepIds, clean).length)).toEqual([3]); // 3 HR Partner tasks at k
  });

  it('HC-06 flags more than 4 serial approvals only', () => {
    expect(byRule('HC-06')).toEqual([]); // d, e, f, i = exactly 4
    const tight = runRules(real, undefined, { maxSerialApprovals: 3 }).filter((f) => f.ruleId === 'HC-06');
    expect(orders(tight[0]!.stepIds)).toEqual(['d', 'e', 'f', 'i']);
  });

  it('HC-07 summarises custom conditions once; fingerprints are unique and stable', () => {
    expect(byRule('HC-07')).toHaveLength(1);
    expect(byRule('HC-07')[0]!.message).toMatch(/^24 of 34 conditions/);
    const all = runRules(real);
    expect(new Set(all.map((f) => f.fingerprint)).size).toBe(all.length);
    expect(runRules(real).map((f) => f.fingerprint)).toEqual(all.map((f) => f.fingerprint));
    expect(all[0]!.severity).toBe('critical'); // sorted by severity
  });
});
