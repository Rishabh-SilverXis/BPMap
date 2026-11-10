import { describe, expect, it } from 'vitest';
import { zipSync } from 'fflate';
import { readFixture } from '@bpmap/fixtures';
import { importWorkbook, LIMITS } from './index.ts';

const AT = '2026-11-10T00:00:00.000Z';
const ok = (r: ReturnType<typeof importWorkbook>) => {
  if (r.status !== 'ok') throw new Error(`expected ok, got ${r.status}: ${JSON.stringify(r)}`);
  return r;
};

describe('importWorkbook: canonical synthetic export (IMP-01, IMP-02)', () => {
  const r = ok(importWorkbook(readFixture('changeJob'), { fileName: 'change-job.xlsx', importedAt: AT }));
  const def = r.definition;

  it('detects sheets by header signature, not name or position', () => {
    expect(r.sheets.map((s) => [s.name, s.role])).toEqual([
      ['Business Process Definition', 'steps'],
      ['Notifications', 'notifications'],
      ['Other', 'ignored'],
    ]);
  });

  it('reads the process name from the Step label', () => {
    expect([def.process, def.variant, def.id]).toEqual(['Change Job', 'Synthetic Sample', 'change-job--synthetic-sample']);
  });

  it('builds 18 steps in 12 stages with two parallel stages (MOD-03)', () => {
    expect(r.stats).toMatchObject({ steps: 18, stages: 12, parallelStages: 2, conditionalSteps: 16, securityGroups: 10, warnings: 0 });
    expect(def.steps.filter((s) => s.order === 'k')).toHaveLength(6);
  });

  it('numbers conditions by first appearance, deduplicates by text, flags Workday-owned (MOD-08)', () => {
    expect(def.conditions).toHaveLength(18); // 19 condition lines in the fixture, "Location changed?" shared by i and k
    const loc = def.conditions.find((c) => c.text === 'Location changed?')!;
    expect(loc.stepIds).toHaveLength(2); // step i and step k reuse it
    expect(def.conditions[0]).toMatchObject({ id: 'C1', text: 'Initiated from the transfer request task?', workdayOwned: true });
    expect(def.conditions.filter((c) => c.workdayOwned)).toHaveLength(8);
  });

  it('keeps multi-group steps and flags (MOD-06, MOD-07)', () => {
    const pay = def.steps.find((s) => s.task === 'Assign Pay Group')!;
    expect(pay.groups).toEqual(['Payroll Interface Partner', 'Payroll Partner']);
    expect(pay.conditionIds).toHaveLength(2);
    expect(def.steps.find((s) => s.order === 'i')!.complete).toBe(true);
    expect(def.steps.find((s) => s.kind === 'service')!.groups).toEqual([]);
  });

  it('matches the golden model snapshot', async () => {
    await expect(JSON.stringify(def, null, 2)).toMatchFileSnapshot('../../fixtures/data/change-job-synthetic.expected.json');
  });
});

describe('robustness', () => {
  it('produces identical step IDs and conditions from renamed headers and shuffled rows (MOD-02, IMP-02)', () => {
    const a = ok(importWorkbook(readFixture('changeJob'), { importedAt: AT })).definition;
    const b = ok(importWorkbook(readFixture('changeJobRenamed'), { importedAt: AT })).definition;
    expect(new Set(b.steps.map((s) => s.id))).toEqual(new Set(a.steps.map((s) => s.id)));
    expect(b.conditions.map((c) => c.text).sort()).toEqual(a.conditions.map((c) => c.text).sort());
  });

  it('asks for a column mapping when the layout is unknown, then honours it (IMP-03)', () => {
    const first = importWorkbook(readFixture('unknownLayout'), { importedAt: AT });
    expect(first.status).toBe('needs-mapping');
    if (first.status !== 'needs-mapping') return;
    expect(first.headers).toEqual(['Seq', 'Kind', 'What', 'Who', 'Optional']);
    const map = { order: 0, rawType: 1, task: 2, groups: 3, optional: 4 };
    const second = ok(importWorkbook(readFixture('unknownLayout'), { importedAt: AT, mapping: { fingerprint: first.fingerprint, map } }));
    expect(second.definition.steps.map((s) => s.kind)).toEqual(['initiation', 'approval']);
    expect(second.definition.warnings.map((w) => w.code)).toContain('W-PROCESS-NAME-GUESSED');
    const third = ok(importWorkbook(readFixture('unknownLayout'), { importedAt: AT, mappingProfiles: { [first.fingerprint]: map } }));
    expect(third.mappingUsed.source).toBe('profile');
  });

  it('rejects non-XLSX input', () => {
    expect(importWorkbook(new TextEncoder().encode('hello'))).toMatchObject({ status: 'error', code: 'E-NOT-XLSX' });
  });

  it('stops zip bombs before inflating (NFR-SEC-02)', () => {
    const big = new Uint8Array(4 * 1024 * 1024); // compresses to a few KB
    const bomb = zipSync({ 'xl/workbook.xml': new Uint8Array(1), 'xl/worksheets/sheet1.xml': big }, { level: 9 });
    const r = importWorkbook(bomb, { limits: { ...LIMITS, maxUncompressedBytes: 1024 * 1024 } });
    expect(r).toMatchObject({ status: 'error', code: 'E-ZIP-LIMITS' });
  });
});
