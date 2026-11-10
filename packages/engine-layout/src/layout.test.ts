import { describe, expect, it } from 'vitest';
import { readFixture } from '@bpmap/fixtures';
import { importWorkbook } from '@bpmap/importer-xlsx';
import { buildGraph } from '@bpmap/engine-graph';
import { MAX_NUDGE, layout, type LaidOutNode } from './index.ts';

const r = importWorkbook(readFixture('changeJob'), { importedAt: '2026-11-10T00:00:00.000Z' });
if (r.status !== 'ok') throw new Error('fixture failed to import');
const g = buildGraph(r.definition);
const L = layout(g);

const overlaps = (a: LaidOutNode, b: LaidOutNode) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe('grid layout (VIS-01, VIS-02, VIS-05)', () => {
  it('places every visible step exactly once, inside its lane and column', () => {
    expect(L.nodes).toHaveLength(18);
    for (const n of L.nodes) {
      const lane = L.lanes.find((l) => l.id === n.laneId)!;
      const st = L.stages[n.stageIndex]!;
      expect(n.y).toBeGreaterThanOrEqual(lane.y);
      expect(n.y + n.height).toBeLessThanOrEqual(lane.y + lane.height);
      expect(n.x).toBeGreaterThanOrEqual(st.x);
      expect(n.x + n.width).toBeLessThanOrEqual(st.x + st.width);
    }
  });

  it('never overlaps two nodes (stacking within a cell)', () => {
    for (let i = 0; i < L.nodes.length; i++) for (let j = i + 1; j < L.nodes.length; j++) expect(overlaps(L.nodes[i]!, L.nodes[j]!)).toBe(false);
    const hr = L.lanes.find((l) => l.label === 'HR Partner')!;
    expect(hr.height).toBeGreaterThan(L.lanes.find((l) => l.label === 'Manager')!.height); // 3 HR steps stacked in stage k
  });

  it('draws split and join bars for each parallel stage', () => {
    expect(L.bars.filter((b) => b.role === 'split')).toHaveLength(2);
    expect(L.bars.filter((b) => b.role === 'join')).toHaveLength(2);
  });

  it('routes transitions orthogonally, bending only in the gutter between columns', () => {
    const transitions = L.edges.filter((e) => e.id.startsWith('t-'));
    expect(transitions).toHaveLength(11);
    for (const e of transitions) {
      for (let i = 1; i < e.points.length; i++) {
        const [a, b] = [e.points[i - 1]!, e.points[i]!];
        expect(a[0] === b[0] || a[1] === b[1]).toBe(true); // axis-aligned
      }
      // vertical segments sit on a column boundary, never inside a column with nodes
      const verticals = e.points.slice(1).filter((p, i) => p[0] === e.points[i]![0]).map((p) => p[0]);
      for (const vx of verticals) expect(L.stages.some((s) => s.x + s.width === vx)).toBe(true);
    }
  });

  it('is deterministic', () => {
    expect(layout(buildGraph(r.definition))).toEqual(L);
  });
});

describe('decisions and markers on the real Workday layout (DEC-032)', () => {
  const rr = importWorkbook(readFixture('workdayLayout'), { importedAt: 'x' });
  if (rr.status !== 'ok') throw new Error('fixture failed to import');
  const gg = buildGraph(rr.definition);
  const LL = layout(gg);
  const node = (order: string) => LL.nodes.find((n) => gg.steps[n.id]!.step.order === order)!;

  it('puts a diamond in front of each conditional approval only (d, e, f, i)', () => {
    expect(LL.diamonds.map((d) => gg.steps[d.stepId]!.step.order)).toEqual(['d', 'e', 'f', 'i']);
    for (const d of LL.diamonds) {
      const n = LL.nodes.find((x) => x.id === d.stepId)!;
      const st = LL.stages[n.stageIndex]!;
      expect(d.cx - d.r).toBeGreaterThan(st.x); // diamond sits inside its own column
      expect(d.cx + d.r).toBeLessThan(n.x);
    }
  });

  it('routes "No, skip" under the step and rejoins after it, never backwards', () => {
    const d = node('d');
    const skip = LL.edges.find((e) => e.id === `skip-${d.id}`)!;
    expect(skip.label).toBe('No, skip');
    expect(skip.points.at(-1)![0]).toBeGreaterThan(d.x + d.width);
    expect(Math.max(...skip.points.map((p) => p[1]))).toBeGreaterThan(d.y + d.height);
    const transitionIntoD = LL.edges.find((e) => e.id.startsWith('t-') && e.points.at(-1)![1] === d.y + d.height / 2)!;
    expect(transitionIntoD.points.at(-1)![0]).toBeLessThan(d.x - 30); // enters the diamond, not the box
  });

  it('adds start and end markers and keeps ba…bd straight after a', () => {
    expect(LL.markers.start!.cx).toBeLessThan(node('a').x);
    expect(LL.markers.end!.cx).toBeGreaterThan(node('v').x + node('v').width);
    expect(node('ba').x).toBeLessThan(node('d').x);
    expect(node('bd').x).toBeLessThan(node('d').x);
  });
});

describe('manual nudges (VIS-11)', () => {
  // a step alone in a non-parallel stage, with a later stage after it
  const stage = g.stages.findIndex((s, i) => !s.parallel && s.stepIds.length === 1 && i > 0 && i < g.stages.length - 1);
  const id = g.stages[stage]!.stepIds[0]!;
  const base = L.nodes.find((n) => n.id === id)!;
  const laneOf = (res: typeof L, laneId: string) => res.lanes.find((l) => l.id === laneId)!;

  it('no nudges = identical layout; every node reports a zero nudge', () => {
    expect(layout(g, { nudges: {} })).toEqual(L);
    expect(L.nodes.every((n) => n.nudge.dx === 0 && n.nudge.dy === 0)).toBe(true);
  });

  it('down: the step moves and its lane grows, pushing later lanes down; edges follow', () => {
    const N = layout(g, { nudges: { [id]: { dx: 0, dy: 120 } } });
    const n = N.nodes.find((x) => x.id === id)!;
    expect(n.y - base.y).toBe(120);
    expect(laneOf(N, n.laneId).height).toBeGreaterThan(laneOf(L, n.laneId).height);
    expect(n.y + n.height).toBeLessThanOrEqual(laneOf(N, n.laneId).y + laneOf(N, n.laneId).height);
    expect(N.height).toBeGreaterThan(L.height);
    const into = N.edges.find((e) => e.id === `t-${stage - 1}-${stage}`)!;
    expect(into.points.at(-1)![1]).toBe(n.y + n.height / 2); // arrives at the moved step's centre
  });

  it('left/right: the column widens on that side, so the step never enters another stage', () => {
    for (const dx of [-150, 150]) {
      const N = layout(g, { nudges: { [id]: { dx, dy: 0 } } });
      const n = N.nodes.find((x) => x.id === id)!;
      const st = N.stages[stage]!;
      expect(n.x).toBeGreaterThanOrEqual(st.x);
      expect(n.x + n.width).toBeLessThanOrEqual(st.x + st.width);
      expect(N.stages[stage + 1]!.x - L.stages[stage + 1]!.x).toBe(150); // later stages shift by the added room
      expect(N.width - L.width).toBe(150);
    }
  });

  it('never above the lane top, never beyond MAX_NUDGE', () => {
    const up = layout(g, { nudges: { [id]: { dx: 0, dy: -500 } } }).nodes.find((x) => x.id === id)!;
    expect(up.y).toBe(laneOf(L, base.laneId).y + 4);
    const far = layout(g, { nudges: { [id]: { dx: 99999, dy: 99999 } } }).nodes.find((x) => x.id === id)!;
    expect(far.nudge).toEqual({ dx: MAX_NUDGE, dy: MAX_NUDGE });
  });

  it('nudged layouts keep steps from overlapping when moved apart', () => {
    const N = layout(g, { nudges: { [id]: { dx: 60, dy: 40 } } });
    for (const a of N.nodes) for (const b of N.nodes) if (a !== b) expect(overlaps(a, b)).toBe(false);
  });
});
