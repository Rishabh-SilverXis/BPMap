/**
 * Layout engine, phase 1 of ADR-004: deterministic grid placement (Architecture §9.1).
 * Columns = stages, rows = lanes; steps sharing lane + stage stack vertically.
 *
 * Edge routing is the "gutter router" (DEC-013): transitions bend only in the gutter between two
 * columns, so no edge can pass through a node.
 *
 * Increment 1.1 (DEC-032): a decision diamond before every conditional APPROVAL (DS §9: "diamonds
 * on approvals by default") with "Yes" into the step and a "No, skip" path that runs under the
 * step and rejoins after it; start and end markers around the flow.
 */
import { APPROVAL_KINDS } from '@bpmap/model';
import type { SemanticGraph } from '@bpmap/engine-graph';

export interface LayoutOptions {
  nodeWidth: number;
  nodeHeight: number;
  laneHeaderWidth: number;
  stageHeaderHeight: number;
  lanePadY: number;
  stackGap: number;
  colPad: number; // horizontal padding inside a single-step column
  parallelColPad: number; // inside a parallel column (room for split/join bars)
  barWidth: number;
  barInset: number; // bar distance from the column edge
  diamondSpace: number; // extra column width in front of a step that has a decision diamond
  diamondR: number; // diamond half-diagonal
  startSpace: number;
  endSpace: number;
  markerR: number;
}

export const DEFAULT_LAYOUT: LayoutOptions = {
  nodeWidth: 188,
  nodeHeight: 76,
  laneHeaderWidth: 148,
  stageHeaderHeight: 36,
  lanePadY: 18,
  stackGap: 14,
  colPad: 24,
  parallelColPad: 44,
  barWidth: 6,
  barInset: 14,
  diamondSpace: 96,
  diamondR: 13,
  startSpace: 48,
  endSpace: 56,
  markerR: 10,
};

export type Point = [number, number];

export interface LaidOutLane { id: string; label: string; system: boolean; y: number; height: number }
export interface LaidOutStage { index: number; label: string; x: number; width: number; parallel: boolean }
export interface LaidOutNode { id: string; x: number; y: number; width: number; height: number; stageIndex: number; laneId: string }
export interface LaidOutBar { stageIndex: number; role: 'split' | 'join'; x: number; y: number; width: number; height: number }
export interface LaidOutDiamond { stepId: string; cx: number; cy: number; r: number; conditionIds: string[] }
export interface LaidOutMarker { cx: number; cy: number; r: number }
export type EdgeStyle = 'default' | 'plain' | 'yes' | 'skip';
export interface LaidOutEdge { id: string; points: Point[]; style: EdgeStyle; arrow: boolean; label?: string }

export interface LayoutResult {
  width: number;
  height: number;
  lanes: LaidOutLane[];
  stages: LaidOutStage[];
  nodes: LaidOutNode[];
  bars: LaidOutBar[];
  diamonds: LaidOutDiamond[];
  markers: { start?: LaidOutMarker; end?: LaidOutMarker };
  edges: LaidOutEdge[];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function layout(graph: SemanticGraph, options: Partial<LayoutOptions> = {}): LayoutResult {
  const o = { ...DEFAULT_LAYOUT, ...options };
  const hasDiamond = (id: string) => {
    const gs = graph.steps[id]!;
    return gs.conditional && APPROVAL_KINDS.has(gs.step.kind);
  };

  // 1. Stack depth per lane = max steps that lane has in any one stage.
  const depth = new Map<string, number>(graph.lanes.map((l) => [l.id, 1]));
  const cellCount = new Map<string, number>();
  for (const gs of Object.values(graph.steps)) {
    const k = `${gs.laneId}|${gs.stageIndex}`;
    const n = (cellCount.get(k) ?? 0) + 1;
    cellCount.set(k, n);
    depth.set(gs.laneId, Math.max(depth.get(gs.laneId) ?? 1, n));
  }

  // 2. Lanes (rows).
  let y = o.stageHeaderHeight;
  const lanes: LaidOutLane[] = graph.lanes.map((l) => {
    const d = depth.get(l.id) ?? 1;
    const height = 2 * o.lanePadY + d * o.nodeHeight + (d - 1) * o.stackGap;
    const lane = { id: l.id, label: l.label, system: l.system, y, height };
    y += height;
    return lane;
  });
  const laneById = new Map(lanes.map((l) => [l.id, l]));

  // 3. Stages (columns). Room for the start marker before the first column.
  let x = o.laneHeaderWidth + o.startSpace;
  const pads: number[] = [];
  const stages: LaidOutStage[] = graph.stages.map((s, index) => {
    const pad = s.parallel ? o.parallelColPad : o.colPad;
    pads.push(pad);
    const width = o.nodeWidth + 2 * pad + (s.stepIds.some(hasDiamond) ? o.diamondSpace : 0);
    const st = { index, label: s.label, x, width, parallel: s.parallel };
    x += width;
    return st;
  });

  // 4. Nodes: right-aligned in the column (centred when there is no diamond), stacked by source row.
  const nodes: LaidOutNode[] = [];
  const nodeById = new Map<string, LaidOutNode>();
  const used = new Map<string, number>();
  graph.stages.forEach((s, si) => {
    for (const id of s.stepIds) {
      const gs = graph.steps[id]!;
      const lane = laneById.get(gs.laneId)!;
      const k = `${gs.laneId}|${si}`;
      const slot = used.get(k) ?? 0;
      used.set(k, slot + 1);
      const st = stages[si]!;
      const node = {
        id,
        x: st.x + st.width - pads[si]! - o.nodeWidth,
        y: lane.y + o.lanePadY + slot * (o.nodeHeight + o.stackGap),
        width: o.nodeWidth,
        height: o.nodeHeight,
        stageIndex: si,
        laneId: gs.laneId,
      };
      nodes.push(node);
      nodeById.set(id, node);
    }
  });
  const cy = (n: LaidOutNode) => n.y + n.height / 2;

  // 5. Decision diamonds (DEC-032) and the point where flow enters each step.
  const diamonds: LaidOutDiamond[] = [];
  const edges: LaidOutEdge[] = [];
  const entryX = new Map<string, number>();
  for (const n of nodes) {
    if (!hasDiamond(n.id)) {
      entryX.set(n.id, n.x);
      continue;
    }
    const d = { stepId: n.id, cx: n.x - o.diamondSpace / 2, cy: cy(n), r: o.diamondR, conditionIds: graph.steps[n.id]!.step.conditionIds };
    diamonds.push(d);
    entryX.set(n.id, d.cx - d.r);
    edges.push({ id: `yes-${n.id}`, points: [[d.cx + d.r, d.cy], [n.x, d.cy]], style: 'yes', arrow: true, label: 'Yes' });
    const below = n.y + n.height + 10;
    const rejoin = n.x + n.width + 10;
    edges.push({ id: `skip-${n.id}`, points: [[d.cx, d.cy + d.r], [d.cx, below], [rejoin, below], [rejoin, d.cy]], style: 'skip', arrow: false, label: 'No, skip' });
  }

  // 6. Parallel split/join bars + their short connectors (VIS-02).
  const bars: LaidOutBar[] = [];
  const barSpan = new Map<number, { top: number; bottom: number; mid: number; splitX: number; joinX: number }>();
  graph.stages.forEach((s, si) => {
    if (!s.parallel) return;
    const st = stages[si]!;
    const ns = s.stepIds.map((id) => nodeById.get(id)!);
    const top = Math.min(...ns.map(cy)) - 16;
    const bottom = Math.max(...ns.map(cy)) + 16;
    const splitX = st.x + o.barInset;
    const joinX = st.x + st.width - o.barInset - o.barWidth;
    bars.push({ stageIndex: si, role: 'split', x: splitX, y: top, width: o.barWidth, height: bottom - top });
    bars.push({ stageIndex: si, role: 'join', x: joinX, y: top, width: o.barWidth, height: bottom - top });
    barSpan.set(si, { top, bottom, mid: (top + bottom) / 2, splitX, joinX });
    for (const n of ns) {
      edges.push({ id: `split-${n.id}`, points: [[splitX + o.barWidth, cy(n)], [entryX.get(n.id)!, cy(n)]], style: 'default', arrow: true });
      edges.push({ id: `join-${n.id}`, points: [[n.x + n.width, cy(n)], [joinX, cy(n)]], style: 'plain', arrow: false });
    }
  });

  /** Where flow enters / leaves a stage, given the y of the other end. */
  const enter = (si: number, fromY: number): Point => {
    const s = graph.stages[si]!;
    if (!s.parallel) {
      const n = nodeById.get(s.stepIds[0]!)!;
      return [entryX.get(n.id)!, cy(n)];
    }
    const b = barSpan.get(si)!;
    return [b.splitX, clamp(fromY, b.top + 8, b.bottom - 8)];
  };
  const exitBase = (si: number): Point => {
    const s = graph.stages[si]!;
    if (!s.parallel) {
      const n = nodeById.get(s.stepIds[0]!)!;
      return [n.x + n.width, cy(n)];
    }
    const b = barSpan.get(si)!;
    return [b.joinX + o.barWidth, b.mid];
  };

  // 7. Transitions between consecutive stages, routed in the gutter (DEC-013).
  for (const t of graph.transitions) {
    const [sx, sBase] = exitBase(t.from);
    const [tx, ty] = enter(t.to, sBase);
    const fromParallel = graph.stages[t.from]!.parallel;
    const sy = fromParallel ? clamp(ty, barSpan.get(t.from)!.top + 8, barSpan.get(t.from)!.bottom - 8) : sBase;
    const gutter = stages[t.from]!.x + stages[t.from]!.width;
    const points: Point[] = sy === ty ? [[sx, sy], [tx, ty]] : [[sx, sy], [gutter, sy], [gutter, ty], [tx, ty]];
    edges.push({ id: `t-${t.from}-${t.to}`, points, style: 'default', arrow: true });
  }

  // 8. Start and end markers.
  const markers: LayoutResult['markers'] = {};
  const first = stages[0];
  const last = stages[stages.length - 1];
  if (first && last) {
    const firstY = graph.stages[0]!.parallel ? barSpan.get(0)!.mid : enter(0, 0)[1];
    const [tx, ty] = enter(0, firstY);
    markers.start = { cx: o.laneHeaderWidth + o.startSpace / 2, cy: ty, r: o.markerR };
    edges.push({ id: 'start', points: [[markers.start.cx + o.markerR, ty], [tx, ty]], style: 'default', arrow: true });
    const [ex, ey] = exitBase(last.index);
    markers.end = { cx: last.x + last.width + o.endSpace / 2, cy: ey, r: o.markerR };
    edges.push({ id: 'end', points: [[ex, ey], [markers.end.cx - o.markerR, ey]], style: 'default', arrow: true });
  }

  return {
    width: (last ? last.x + last.width + o.endSpace : o.laneHeaderWidth) + 16,
    height: y + 8,
    lanes,
    stages,
    nodes,
    bars,
    diamonds,
    markers,
    edges,
  };
}
