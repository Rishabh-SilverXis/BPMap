/**
 * Scene: one render-agnostic display list for the canvas background and every exporter
 * (Architecture §16.1, ADR-007). Colours are resolved from design tokens when the scene is built
 * (DEC-014), so exporters only translate shapes.
 *
 *   buildDiagramScene(def, graph, layout, theme)   lanes, stage headers, bars, edges, step nodes
 *   buildExportScene(def, graph, layout, theme)     + title/summary header, legend, condition list
 *   toSvg(scene)                                    byte-stable SVG string
 */
import { KIND_LABEL, type ProcessDefinition, type Step, type StepKind } from '@bpmap/model';
import type { SemanticGraph } from '@bpmap/engine-graph';
import type { LayoutResult, Point } from '@bpmap/engine-layout';
import { canvasType, nodeTokens, semantic, type Theme } from '@bpmap/design-tokens';
import { textWidth, wrapText } from './text.ts';

export { wrapText, textWidth } from './text.ts';

export type SceneItem =
  | { t: 'rect'; x: number; y: number; w: number; h: number; r?: number; fill: string; stroke?: string; strokeWidth?: number; dash?: number[] }
  | { t: 'circle'; cx: number; cy: number; r: number; fill: string; stroke?: string; strokeWidth?: number }
  | { t: 'path'; points: Point[]; stroke: string; width: number; dash?: number[]; arrow?: boolean }
  | { t: 'text'; x: number; y: number; text: string; size: number; weight: number; fill: string; anchor?: 'start' | 'middle' | 'end'; mono?: boolean; letterSpacing?: number }
  | { t: 'group'; role: SceneRole; id?: string; children: SceneItem[] };

export type SceneRole = 'lanes' | 'lane' | 'stage-headers' | 'bars' | 'edges' | 'step' | 'header' | 'legend' | 'conditions';

export interface Scene {
  width: number;
  height: number;
  background: string;
  items: SceneItem[];
}

export type NodeStyle = 'initiation' | 'approval' | 'action' | 'todo' | 'system';

export function nodeStyleOf(kind: StepKind): NodeStyle {
  if (kind === 'initiation') return 'initiation';
  if (kind === 'approval' || kind === 'approval-chain' || kind === 'consolidated-approval-chain') return 'approval';
  if (kind === 'todo' || kind === 'checklist' || kind === 'questionnaire') return 'todo';
  if (kind === 'service' || kind === 'integration') return 'system';
  return 'action';
}

/** Title shown in a step box (overlay label wins; then the Workday task; then a kind default). */
export function stepTitle(step: Step, label?: string): string {
  if (label) return label;
  if (step.task) return step.task;
  if (step.kind === 'initiation') return 'Start the process';
  if (nodeStyleOf(step.kind) === 'approval') return 'Approve';
  return step.rawType || KIND_LABEL[step.kind];
}

/** Kind tag, e.g. "APPROVAL · OPTIONAL". Shape + text carry meaning, never colour alone (DS §2.1 #6). */
export function stepKindTag(step: Step): string {
  const parts = [KIND_LABEL[step.kind].toUpperCase()];
  if (step.optional) parts.push('OPTIONAL');
  if (step.allMustAct) parts.push('ALL MUST ACT');
  return parts.join(' · ');
}

const SKIP_DASH = [5, 3.5];

/** Overlay decorations the scene draws (CUS-01): label overrides and notes, keyed by StepId. */
export interface SceneDecor {
  labels?: Readonly<Record<string, string>>;
  notes?: Readonly<Record<string, string>>;
}

export function buildDiagramScene(def: ProcessDefinition, graph: SemanticGraph, L: LayoutResult, theme: Theme = 'light', decor: SceneDecor = {}): Scene {
  const labels = decor.labels ?? {};
  const notes = decor.notes ?? {};
  const tk = nodeTokens(theme);
  const s = semantic[theme];
  const items: SceneItem[] = [];

  // Lanes with header column.
  items.push({
    t: 'group',
    role: 'lanes',
    children: L.lanes.flatMap((lane, i): SceneItem[] => {
      const header = wrapText(lane.label, 120, canvasType.laneHeader.size, 600, 3);
      const y0 = lane.y + lane.height / 2 - ((header.length - 1) * canvasType.laneHeader.line) / 2 + 4;
      return [
        { t: 'rect', x: 0, y: lane.y, w: L.width, h: lane.height, fill: i % 2 ? tk.lane.bgAlt : tk.lane.bg, stroke: tk.lane.line, strokeWidth: 1 },
        { t: 'rect', x: 0, y: lane.y, w: 136, h: lane.height, fill: lane.system ? tk.laneHeader.systemBg : tk.laneHeader.bg, stroke: tk.lane.line, strokeWidth: 1 },
        ...header.map((line, j): SceneItem => ({ t: 'text', x: 12, y: y0 + j * canvasType.laneHeader.line, text: line, size: canvasType.laneHeader.size, weight: 600, fill: tk.laneHeader.text })),
      ];
    }),
  });

  items.push({
    t: 'group',
    role: 'stage-headers',
    children: L.stages.map((st): SceneItem => ({ t: 'text', x: st.x + st.width / 2, y: 22, text: st.label, size: canvasType.stageHeader.size, weight: 600, fill: tk.stageHeader, anchor: 'middle' })),
  });

  items.push({
    t: 'group',
    role: 'edges',
    children: L.edges.map((e): SceneItem => ({ t: 'path', points: e.points, stroke: tk.edge, width: 1.5, arrow: e.arrow })),
  });

  items.push({
    t: 'group',
    role: 'bars',
    children: L.bars.map((b): SceneItem => ({ t: 'rect', x: b.x, y: b.y, w: b.width, h: b.height, r: 2, fill: tk.parallelBar })),
  });

  for (const n of L.nodes) {
    const step = graph.steps[n.id]!.step;
    const style = nodeStyleOf(step.kind);
    const t = tk[style];
    const conditional = step.conditionIds.length > 0;
    const pad = 10;
    const children: SceneItem[] = [
      { t: 'rect', x: n.x, y: n.y, w: n.width, h: n.height, r: 6, fill: t.bg, stroke: conditional ? tk.conditionalBorder : t.border, strokeWidth: conditional ? 1.75 : 1.5, ...(conditional ? { dash: SKIP_DASH } : {}) },
      { t: 'text', x: n.x + pad, y: n.y + pad + 9, text: stepKindTag(step), size: canvasType.kind.size, weight: 700, fill: t.meta, letterSpacing: 0.6 },
      ...wrapText(stepTitle(step, labels[n.id]), n.width - 2 * pad, canvasType.title.size, 600, 2).map(
        (line, i): SceneItem => ({ t: 'text', x: n.x + pad, y: n.y + pad + 30 + i * canvasType.title.line, text: line, size: canvasType.title.size, weight: 600, fill: t.text }),
      ),
    ];
    // Condition badges on the top edge, right-aligned (max 3 + "+n").
    const ids = step.conditionIds.length > 3 ? [...step.conditionIds.slice(0, 2), `+${step.conditionIds.length - 2}`] : step.conditionIds;
    let bx = n.x + n.width - 6;
    for (const id of [...ids].reverse()) {
      const w = textWidth(id, canvasType.badge.size, 700) + 10;
      bx -= w;
      children.push({ t: 'rect', x: bx, y: n.y - 8, w, h: 16, r: 8, fill: tk.conditionBadge.bg, stroke: tk.conditionalBorder, strokeWidth: 1 });
      children.push({ t: 'text', x: bx + w / 2, y: n.y + 3.5, text: id, size: canvasType.badge.size, weight: 700, fill: tk.conditionBadge.text, anchor: 'middle', mono: true });
      bx -= 4;
    }
    if (notes[n.id]) {
      children.push({ t: 'circle', cx: n.x + 2, cy: n.y + n.height, r: 8, fill: s.primary, stroke: s.surface, strokeWidth: 1.5 });
      children.push({ t: 'text', x: n.x + 2, y: n.y + n.height + 3.5, text: 'N', size: 10, weight: 700, fill: s['on-primary'], anchor: 'middle' });
    }
    if (step.complete) {
      children.push({ t: 'circle', cx: n.x + n.width, cy: n.y + n.height, r: 8, fill: tk.completion, stroke: s.surface, strokeWidth: 1.5 });
      children.push({ t: 'path', points: [[n.x + n.width - 3.5, n.y + n.height], [n.x + n.width - 1, n.y + n.height + 2.5], [n.x + n.width + 3.5, n.y + n.height - 2.5]], stroke: '#FFFFFF', width: 1.6 });
    }
    items.push({ t: 'group', role: 'step', id: n.id, children });
  }

  return { width: L.width, height: L.height, background: s.surface, items };
}

/* ------------------------------------------------------------------ export wrapper */

function translate(items: SceneItem[], dx: number, dy: number): SceneItem[] {
  return items.map((it): SceneItem => {
    switch (it.t) {
      case 'rect': return { ...it, x: it.x + dx, y: it.y + dy };
      case 'circle': return { ...it, cx: it.cx + dx, cy: it.cy + dy };
      case 'text': return { ...it, x: it.x + dx, y: it.y + dy };
      case 'path': return { ...it, points: it.points.map(([x, y]): Point => [x + dx, y + dy]) };
      case 'group': return { ...it, children: translate(it.children, dx, dy) };
    }
  });
}

export const EXCEPTIONS_NOTE =
  'Not drawn on every step: at an approval or action the person can send back or deny, and allowed roles can cancel, rescind or correct the process (set in the business process security policy).';

export function summaryLine(def: ProcessDefinition, graph: SemanticGraph): string {
  const steps = Object.keys(graph.steps).length;
  const conditional = Object.values(graph.steps).filter((s) => s.conditional).length;
  const groups = new Set(Object.values(graph.steps).flatMap((s) => s.step.groups)).size;
  return `${steps} steps in ${graph.stages.length} stages · ${conditional} conditional · ${groups} security groups`;
}

/** Where the diagram sits inside the export scene; the canvas places its nodes with the same offset. */
export const EXPORT_DIAGRAM_OFFSET = { x: 32, y: 92 } as const;

export function buildExportScene(def: ProcessDefinition, graph: SemanticGraph, L: LayoutResult, theme: Theme = 'light', decor: SceneDecor = {}): Scene {
  const s = semantic[theme];
  const tk = nodeTokens(theme);
  const M = EXPORT_DIAGRAM_OFFSET.x;
  const width = Math.max(L.width, 960) + 2 * M;
  const inner = width - 2 * M;
  const items: SceneItem[] = [];

  const title = def.variant ? `${def.process} (${def.variant})` : def.process;
  items.push({
    t: 'group',
    role: 'header',
    children: [
      { t: 'text', x: M, y: M + 18, text: title, size: 22, weight: 700, fill: s.primary },
      { t: 'text', x: M, y: M + 40, text: `Workday business process definition · ${summaryLine(def, graph)}`, size: 12, weight: 400, fill: s['text-muted'] },
    ],
  });

  const diagramTop = EXPORT_DIAGRAM_OFFSET.y;
  items.push(...translate(buildDiagramScene(def, graph, L, theme, decor).items, M, diagramTop));

  // Legend (DS §10.6).
  let y = diagramTop + L.height + 28;
  const legend: SceneItem[] = [{ t: 'text', x: M, y, text: 'LEGEND', size: 10, weight: 800, fill: s['text-muted'], letterSpacing: 1 }];
  y += 14;
  const entries: [SceneItem, string][] = [
    [{ t: 'rect', x: 0, y: 0, w: 28, h: 16, r: 4, fill: tk.approval.bg, stroke: tk.approval.border, strokeWidth: 1.5 }, 'Approval / start'],
    [{ t: 'rect', x: 0, y: 0, w: 28, h: 16, r: 4, fill: tk.action.bg, stroke: tk.action.border, strokeWidth: 1.5 }, 'Action or review'],
    [{ t: 'rect', x: 0, y: 0, w: 28, h: 16, r: 4, fill: tk.todo.bg, stroke: tk.todo.border, strokeWidth: 1.5 }, 'To do'],
    [{ t: 'rect', x: 0, y: 0, w: 28, h: 16, r: 4, fill: tk.system.bg, stroke: tk.system.border, strokeWidth: 1.5 }, 'Workday service / integration'],
    [{ t: 'rect', x: 0, y: 0, w: 28, h: 16, r: 4, fill: tk.action.bg, stroke: tk.conditionalBorder, strokeWidth: 1.75, dash: SKIP_DASH }, 'Runs only if its condition (Cn) is true'],
    [{ t: 'rect', x: 11, y: -3, w: 6, h: 22, r: 2, fill: tk.parallelBar }, 'Steps run in parallel'],
    [{ t: 'circle', cx: 14, cy: 8, r: 8, fill: tk.completion }, 'Process is complete after this step'],
  ];
  const colW = inner / 4;
  entries.forEach(([shape, label], i) => {
    const x = M + (i % 4) * colW;
    const yy = y + Math.floor(i / 4) * 26;
    legend.push(...translate([shape], x, yy));
    legend.push({ t: 'text', x: x + 38, y: yy + 12, text: label, size: 11, weight: 400, fill: s['text-secondary'] });
  });
  y += Math.ceil(entries.length / 4) * 26 + 6;
  for (const line of wrapText(EXCEPTIONS_NOTE, inner, 11)) {
    legend.push({ t: 'text', x: M, y, text: line, size: 11, weight: 400, fill: s['text-secondary'] });
    y += 15;
  }
  items.push({ t: 'group', role: 'legend', children: legend });

  // Condition list, two columns (DS §10.6).
  const conds: SceneItem[] = [];
  if (def.conditions.length) {
    y += 18;
    conds.push({ t: 'text', x: M, y, text: 'CONDITIONS (A STEP RUNS ONLY WHEN ITS CONDITIONS ARE TRUE)', size: 10, weight: 800, fill: s['text-muted'], letterSpacing: 1 });
    y += 16;
    const half = Math.ceil(def.conditions.length / 2);
    const colWidth = inner / 2 - 16;
    const visible = new Set(Object.keys(graph.steps));
    const orderOf = new Map(Object.values(graph.steps).map((g) => [g.step.id, g.step.order]));
    let colY = [y, y];
    def.conditions.forEach((c, i) => {
      const col = i < half ? 0 : 1;
      const x = M + col * (inner / 2);
      const where = [...new Set(c.stepIds.filter((id) => visible.has(id)).map((id) => orderOf.get(id)))].join(', ');
      const lines = wrapText(c.text, colWidth - 44, 11);
      conds.push({ t: 'rect', x, y: colY[col]! - 11, w: 32, h: 15, r: 7.5, fill: tk.conditionBadge.bg, stroke: tk.conditionalBorder, strokeWidth: 1 });
      conds.push({ t: 'text', x: x + 16, y: colY[col]!, text: c.id, size: 10, weight: 700, fill: tk.conditionBadge.text, anchor: 'middle', mono: true });
      lines.forEach((ln, j) => conds.push({ t: 'text', x: x + 42, y: colY[col]! + j * 15, text: ln, size: 11, weight: 500, fill: s.text }));
      const metaY = colY[col]! + lines.length * 15;
      conds.push({ t: 'text', x: x + 42, y: metaY, text: `${c.workdayOwned ? 'Workday owned' : 'Custom'}${where ? ` · step ${where}` : ''}`, size: 10, weight: 400, fill: s['text-muted'] });
      colY = col === 0 ? [metaY + 20, colY[1]!] : [colY[0]!, metaY + 20];
    });
    y = Math.max(...colY);
  }
  items.push({ t: 'group', role: 'conditions', children: conds });

  y += 10;
  items.push({ t: 'text', x: M, y: y + 12, text: 'Generated by BPMap · Independent product, not affiliated with Workday, Inc.', size: 9, weight: 400, fill: s['text-muted'] });

  return { width, height: Math.ceil(y + 12 + M), background: s.surface, items };
}

/* ------------------------------------------------------------------ SVG serialiser */

const n = (v: number) => (Math.round(v * 10) / 10).toString();
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function itemSvg(it: SceneItem): string {
  switch (it.t) {
    case 'rect':
      return `<rect x="${n(it.x)}" y="${n(it.y)}" width="${n(it.w)}" height="${n(it.h)}"${it.r ? ` rx="${n(it.r)}"` : ''} fill="${it.fill}"${it.stroke ? ` stroke="${it.stroke}" stroke-width="${n(it.strokeWidth ?? 1)}"` : ''}${it.dash ? ` stroke-dasharray="${it.dash.join(' ')}"` : ''}/>`;
    case 'circle':
      return `<circle cx="${n(it.cx)}" cy="${n(it.cy)}" r="${n(it.r)}" fill="${it.fill}"${it.stroke ? ` stroke="${it.stroke}" stroke-width="${n(it.strokeWidth ?? 1)}"` : ''}/>`;
    case 'path':
      return `<path d="M${it.points.map(([x, y]) => `${n(x)},${n(y)}`).join(' L')}" fill="none" stroke="${it.stroke}" stroke-width="${n(it.width)}" stroke-linejoin="round"${it.dash ? ` stroke-dasharray="${it.dash.join(' ')}"` : ''}${it.arrow ? ' marker-end="url(#bpm-arrow)"' : ''}/>`;
    case 'text':
      return `<text x="${n(it.x)}" y="${n(it.y)}" font-size="${it.size}" font-weight="${it.weight}" fill="${it.fill}"${it.anchor && it.anchor !== 'start' ? ` text-anchor="${it.anchor}"` : ''}${it.mono ? ' font-family="SFMono-Regular, Menlo, Consolas, monospace"' : ''}${it.letterSpacing ? ` letter-spacing="${it.letterSpacing}"` : ''}>${esc(it.text)}</text>`;
    case 'group':
      return `<g data-role="${it.role}"${it.id ? ` data-id="${esc(it.id)}"` : ''}>${it.children.map(itemSvg).join('')}</g>`;
  }
}

export function toSvg(scene: Scene, title = 'Business process diagram'): string {
  const arrowColor = (scene.items.flatMap(function find(i): string[] { return i.t === 'path' ? [i.stroke] : i.t === 'group' ? i.children.flatMap(find) : []; })[0]) ?? '#64748B';
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.width}" height="${scene.height}" viewBox="0 0 ${scene.width} ${scene.height}" role="img" aria-label="${esc(title)}" font-family="Inter, -apple-system, 'Segoe UI', Roboto, sans-serif">`,
    `<title>${esc(title)}</title>`,
    `<defs><marker id="bpm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${arrowColor}"/></marker></defs>`,
    `<rect width="100%" height="100%" fill="${scene.background}"/>`,
    ...scene.items.map(itemSvg),
    '</svg>',
  ].join('\n');
}
