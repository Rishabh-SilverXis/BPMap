import { describe, expect, it } from 'vitest';
import { readFixture } from '@bpmap/fixtures';
import { importWorkbook } from '@bpmap/importer-xlsx';
import { isAlwaysFalse, runRules } from './index.ts';

describe('HC-16 always-false condition', () => {
  it('recognises constant-false condition names', () => {
    for (const t of ['1=0?', '1 = 0?', '2==3', 'False?', 'Never?']) expect(isAlwaysFalse(t)).toBe(true);
    for (const t of ['1=1?', 'Country is Canada?', 'Proposed pay change above 10%?', 'Pay > 0?']) expect(isAlwaysFalse(t)).toBe(false);
  });

  it('flags steps s and s1 of the real-layout fixture, and nothing in the clean sample', () => {
    const real = importWorkbook(readFixture('workdayLayout'), { importedAt: 'x' });
    const clean = importWorkbook(readFixture('changeJob'), { importedAt: 'x' });
    if (real.status !== 'ok' || clean.status !== 'ok') throw new Error('fixture import failed');
    const f = runRules(real.definition);
    expect(f.map((x) => x.stepIds[0]!.split('-')[0])).toEqual(['s', 's1']);
    expect(f[0]!.message).toContain('can never run');
    expect(new Set(f.map((x) => x.fingerprint)).size).toBe(2);
    expect(runRules(clean.definition)).toEqual([]);
  });
});
