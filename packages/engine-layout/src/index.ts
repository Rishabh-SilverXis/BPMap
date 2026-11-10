/**
 * Layout engine, phase 1 of ADR-004: deterministic grid placement (Architecture §9.1).
 * Columns = stages, rows = lanes; steps sharing lane + stage stack vertically.
 *
 * Edge routing (phase 2 of ADR-004) is a simple orthogonal "gutter router" for Increment 1
 * (DEC-013): every transition bends only inside the gutter between two columns, so no edge can
 * pass through a node. The ELK vs libavoid spike (T2) can replace `routeTransition` later without
 * touching placement.
 */
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
};

export type Point = [number, number];

export interface LaidOutLane { id: string; label: string; system: boolean; y: number; height: number }
export interface LaidOutStage { index: number; label: string; x: number; width: number; parallel: boolean }
export interface LaidOutNode { id: string; x: number; y: number; width: number; height: number; stageIndex: number; laneId: string }
export interface LaidOutBar { stageIndex: number; role: 'split' | 'join'; x: number; y: number; width: number; height: number }
export interface LaidOutEdge { id: string; points: Point[]; style: 'default' | 'plain'; arrow: boolean }

export interface LayoutResult {
  width: number;
  height: number;
  lanes: LaidOutLane[];
  stages: LaidOutStage[];
  nodes: LaidOutNode[];
  bars: LaidOutBar[];
  edges: LaidOutEdge[];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function layout(graph: SemanticGraph, options: Partial<LayoutOptions> = {}): LayoutResult {
  const o = { ...DEFAULT_LAYOUT, ...options };

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

  // 3. Stages (columns).
  let x = o.laneHeaderWidth;
  const stages: LaidOutStage[] = graph.stages.map((s, index) => {
    const width = o.nodeWidth + 2 * (s.parallel ? o.parallelColPad : o.colPad);
    const st = { index, label: s.label, x, width, parallel: s.parallel };
    x += width;
    return st;
  });

  // 4. Nodes: centred in their column, stacked in source-row order within a cell.
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
        x: st.x + (st.width - o.nodeWidth) / 2,
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

  // 5. Parallel split/join bars + their short connectors (VIS-02).
  const bars: LaidOutBar[] = [];
  const edges: LaidOutEdge[] = [];
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
      edges.push({ id: `split-${n.id}`, points: [[splitX + o.barWidth, cy(n)], [n.x, cy(n)]], style: 'default', arrow: true });
      edges.push({ id: `join-${n.id}`, points: [[n.x + n.width, cy(n)], [joinX, cy(n)]], style: 'plain', arrow: false });
    }
  });

  // 6. Transitions between consecutive stages, routed in the gutter (DEC-013).
  for (const t of graph.transitions) {
    const from = graph.stages[t.from]!;
    const to = graph.stages[t.to]!;
    const fromBar = barSpan.get(t.from);
    const toBar = barSpan.get(t.to);
    const srcNode = from.parallel ? null : nodeById.get(from.stepIds[0]!)!;
    const tgtNode = to.parallel ? null : nodeById.get(to.stepIds[0]!)!;
    const srcBase = srcNode ? cy(srcNode) : fromBar!.mid;
    const tgtY = tgtNode ? cy(tgtNode) : clamp(srcBase, toBar!.top + 8, toBar!.bottom - 8);
    const srcY = srcNode ? cy(srcNode) : clamp(tgtY, fromBar!.top + 8, fromBar!.bottom - 8);
    const sx = srcNode ? srcNode.x + srcNode.width : fromBar!.joinX + o.barWidth;
    const tx = tgtNode ? tgtNode.x : toBar!.splitX;
    const gutter = stages[t.from]!.x + stages[t.from]!.width;
    const points: Point[] = srcY === tgtY ? [[sx, srcY], [tx, tgtY]] : [[sx, srcY], [gutter, srcY], [gutter, tgtY], [tx, tgtY]];
    edges.push({ id: `t-${t.from}-${t.to}`, points, style: 'default', arrow: true });
  }

  const last = stages[stages.length - 1];
  return {
    width: (last ? last.x + last.width : o.laneHeaderWidth) + 16,
    height: y + 8,
    lanes,
    stages,
    nodes,
    bars,
    edges,
  };
}
