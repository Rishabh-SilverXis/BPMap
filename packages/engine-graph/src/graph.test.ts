import { describe, expect, it } from 'vitest';
import { readFixture } from '@bpmap/fixtures';
import { importWorkbook } from '@bpmap/importer-xlsx';
import { buildGraph } from './index.ts';

const r = importWorkbook(readFixture('changeJob'), { importedAt: '2026-11-10T00:00:00.000Z' });
if (r.status !== 'ok') throw new Error('fixture failed to import');
const def = r.definition;

describe('buildGraph', () => {
  const g = buildGraph(def);

  it('creates one stage per order value with parallel labels (MOD-03, VIS-02)', () => {
    expect(g.stages.map((s) => s.order)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'f1', 'g', 'h', 'i', 'j', 'k']);
    expect(g.stages.at(-1)!.label).toBe('Step k · 6 in parallel');
    expect(g.transitions).toHaveLength(11);
  });

  it('orders lanes by first appearance with system lanes last (VIS-01)', () => {
    expect(g.lanes.map((l) => l.label)).toEqual([
      'Initiator', 'Manager', "Manager's Manager", 'HR Partner', 'Compensation Partner', 'Works Council',
      'Security Administrator', 'Payroll Interface Partner', 'Organization Owner', 'Workday (automatic)',
    ]);
    expect(g.lanes.at(-1)!.system).toBe(true);
  });

  it('marks conditional steps without inventing edges for them (MOD-04)', () => {
    const conditional = Object.values(g.steps).filter((s) => s.conditional);
    expect(conditional).toHaveLength(16);
  });

  it('applies hidden steps and lane renames from the overlay', () => {
    const svc = def.steps.find((s) => s.kind === 'service')!;
    const g2 = buildGraph(def, { hiddenStepIds: new Set([svc.id]), laneNames: { 'lane-manager': 'Line manager' } });
    expect(g2.lanes.map((l) => l.label)).not.toContain('Workday (automatic)');
    expect(g2.lanes[1]!.label).toBe('Line manager');
    expect(g2.stages.at(-1)!.stepIds).toHaveLength(5);
  });
});
