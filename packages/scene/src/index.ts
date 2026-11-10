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
import { executiveLayout, type LayoutResult, type Point } from '@bpmap/engine-layout';
import { canvasType, nodeTokens, semantic, type Theme } from '@bpmap/design-tokens';
import { textWidth, wrapText } from './text.ts';

export { wrapText, textWidth } from './text.ts';

export type SceneItem =
  | { t: 'rect'; x: number; y: number; w: number; h: number; r?: number; fill: string; stroke?: string; strokeWidth?: number; dash?: number[] }
  | { t: 'circle'; cx: number; cy: number; r: number; fill: string; stroke?: string; strokeWidth?: number }
  | { t: 'poly'; points: Point[]; fill: string; stroke?: string; strokeWidth?: number }
  | { t: 'path'; points: Point[]; stroke: string; width: number; dash?: number[]; arrow?: boolean }
  | { t: 'text'; x: number; y: number; text: string; size: number; weight: number; fill: string; anchor?: 'start' | 'middle' | 'end'; mono?: boolean; letterSpacing?: number }
  | { t: 'group'; role: SceneRole; id?: string; children: SceneItem[] };

export type SceneRole = 'lanes' | 'lane' | 'stage-headers' | 'bars' | 'edges' | 'decisions' | 'markers' | 'step' | 'stage-card' | 'header' | 'legend' | 'conditions' | 'footer';

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
const EDGE_SKIP_DASH = [5, 4];

/** "C5 and C6", "C4, C8 and C9"; more than three → "4 conditions" (no ambiguous "+", DEC-032). */
export function conditionPhrase(input: readonly string[], max = 3): string {
  const ids = [...input].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  if (ids.length > max) return `${ids.length} conditions`;
  if (ids.length <= 1) return ids[0] ?? '';
  return `${ids.slice(0, -1).join(', ')} and ${ids[ids.length - 1]}`;
}

const diamondPoints = (cx: number, cy: number, r: number): Point[] => [[cx, cy - r], [cx + r, cy], [cx, cy + r], [cx - r, cy]];

/** Overlay decorations the scene draws (CUS-01): label overrides and notes, keyed by StepId. */
export interface SceneDecor {
  labels?: Readonly<Record<string, string>>;
  notes?: Readonly<Record<string, string>>;
  /** Audience view (VW-01..03). Configurator adds detail lines; Executive draws stage cards. */
  view?: 'executive' | 'owner' | 'configurator';
  /** Appended to the export header, e.g. the active scenario. */
  subtitle?: string;
}

/** Node height per view: Configurator boxes carry up to 4 detail lines (DEC-035). */
export const NODE_HEIGHT = { owner: 76, configurator: 140 } as const;

/**
 * Configurator detail lines for a step (DS §11): due, alternate, routing, restriction, extra
 * groups, run-as, validations, notifications. Shared by the scene and the canvas node.
 */
export function stepMetaLines(step: Step, def: ProcessDefinition): string[] {
  const lines: string[] = [];
  if (step.dueDate) lines.push(`Due: ${step.dueDate}${step.dueOnEffectiveDate && !/effective/i.test(step.dueDate) ? ' (from effective date)' : ''}`);
  if (step.alternate) lines.push(`Alternate: ${step.alternate}`);
  if (step.routing) lines.push(`Routing: ${step.routing}`);
  if (step.restriction) lines.push(`Restricted: ${step.restriction}`);
  if (step.groups.length > 1) lines.push(`Also: ${step.groups.slice(1).join(', ')}`);
  if (step.runAs) lines.push(`Run as: ${step.runAs}`);
  if (step.validations.length) lines.push(`${step.validations.length} validation${step.validations.length === 1 ? '' : 's'}`);
  const n = def.notifications.filter((x) => x.stepId === step.id && !x.disabled).length;
  if (n) lines.push(`${n} notification${n === 1 ? '' : 's'}`);
  if (step.doNotAdvance) lines.push('Does not auto-advance');
  return lines;
}

/** At most `max` lines; the last becomes "+n more" when there are more. */
export function clampMeta(lines: string[], max = 4): string[] {
  return lines.length <= max ? lines : [...lines.slice(0, max - 1), `+${lines.length - max + 1} more`];
}

/** Width of the lane-name column (diagram coordinates). The viewer freezes this column (DEC-042). */
export const LANE_HEADER_WIDTH = 136;

/** The lane-name cell for one lane: shared by the diagram scene and the viewer's frozen column. */
export function laneHeaderItems(lane: { y: number; height: number; label: string; system: boolean }, theme: Theme = 'light'): SceneItem[] {
  const tk = nodeTokens(theme);
  const header = wrapText(lane.label, LANE_HEADER_WIDTH - 16, canvasType.laneHeader.size, 600, 3);
  const y0 = lane.y + lane.height / 2 - ((header.length - 1) * canvasType.laneHeader.line) / 2 + 4;
  return [
    { t: 'rect', x: 0, y: lane.y, w: LANE_HEADER_WIDTH, h: lane.height, fill: lane.system ? tk.laneHeader.systemBg : tk.laneHeader.bg, stroke: tk.lane.line, strokeWidth: 1 },
    ...header.map((line, j): SceneItem => ({ t: 'text', x: 12, y: y0 + j * canvasType.laneHeader.line, text: line, size: canvasType.laneHeader.size, weight: 600, fill: tk.laneHeader.text })),
  ];
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
    children: L.lanes.flatMap((lane, i): SceneItem[] => [
      { t: 'rect', x: 0, y: lane.y, w: L.width, h: lane.height, fill: i % 2 ? tk.lane.bgAlt : tk.lane.bg, stroke: tk.lane.line, strokeWidth: 1 },
      ...laneHeaderItems(lane, theme),
    ]),
  });

  items.push({
    t: 'group',
    role: 'stage-headers',
    children: L.stages.map((st): SceneItem => ({ t: 'text', x: st.x + st.width / 2, y: 22, text: st.label, size: canvasType.stageHeader.size, weight: 600, fill: tk.stageHeader, anchor: 'middle' })),
  });

  items.push({
    t: 'group',
    role: 'edges',
    children: L.edges.flatMap((e): SceneItem[] => {
      const skip = e.style === 'skip';
      const out: SceneItem[] = [{ t: 'path', points: e.points, stroke: skip ? tk.edgeSkip : tk.edge, width: 1.5, arrow: e.arrow, ...(skip ? { dash: EDGE_SKIP_DASH } : {}) }];
      if (e.label && e.style === 'yes') {
        const [[x1, y1], [x2]] = e.points as [Point, Point];
        out.push({ t: 'text', x: (x1 + x2) / 2, y: y1 - 5, text: e.label, size: 9.5, weight: 600, fill: s['text-secondary'], anchor: 'middle' });
      }
      if (e.label && skip) {
        // Label sits ON the line in a surface pill (DS §10.4) so it never crowds the step box.
        const [, [bx, by], [ex]] = e.points as [Point, Point, Point, Point];
        const w = textWidth(e.label, 9.5, 600) + 10;
        out.push({ t: 'rect', x: (bx + ex) / 2 - w / 2, y: by - 6.5, w, h: 13, r: 6.5, fill: s.surface });
        out.push({ t: 'text', x: (bx + ex) / 2, y: by + 3.3, text: e.label, size: 9.5, weight: 600, fill: s['on-conditional-subtle'], anchor: 'middle' });
      }
      return out;
    }),
  });

  items.push({
    t: 'group',
    role: 'decisions',
    children: L.diamonds.flatMap((d): SceneItem[] => [
      { t: 'poly', points: diamondPoints(d.cx, d.cy, d.r), fill: tk.conditionBadge.bg, stroke: tk.conditionalBorder, strokeWidth: 1.5 },
      { t: 'text', x: d.cx, y: d.cy + 3.5, text: '?', size: 10, weight: 700, fill: tk.conditionBadge.text, anchor: 'middle' },
      { t: 'text', x: d.cx, y: d.cy - d.r - 6, text: `${conditionPhrase(d.conditionIds)}?`, size: 10, weight: 700, fill: tk.conditionBadge.text, anchor: 'middle' },
    ]),
  });

  const markers: SceneItem[] = [];
  if (L.markers.start) markers.push({ t: 'circle', cx: L.markers.start.cx, cy: L.markers.start.cy, r: L.markers.start.r, fill: s.surface, stroke: tk.completion, strokeWidth: 2.5 });
  if (L.markers.end) markers.push({ t: 'circle', cx: L.markers.end.cx, cy: L.markers.end.cy, r: L.markers.end.r, fill: s.surface, stroke: s.primary, strokeWidth: 4 });
  items.push({ t: 'group', role: 'markers', children: markers });

  items.push({
    t: 'group',
    role: 'bars',
    children: L.bars.map((b): SceneItem => ({ t: 'rect', x: b.x, y: b.y, w: b.width, h: b.height, r: 2, fill: tk.parallelBar })),
  });

  for (const n of L.nodes) {
    const gs = graph.steps[n.id]!;
    const step = gs.step;
    const style = nodeStyleOf(step.kind);
    const t = tk[style];
    const conditional = gs.conditional; // unresolved conditions only (DEC-034)
    const pad = 10;
    const children: SceneItem[] = [
      { t: 'rect', x: n.x, y: n.y, w: n.width, h: n.height, r: 6, fill: t.bg, stroke: conditional ? tk.conditionalBorder : t.border, strokeWidth: conditional ? 1.75 : 1.5, ...(conditional ? { dash: SKIP_DASH } : {}) },
      { t: 'text', x: n.x + pad, y: n.y + pad + 9, text: stepKindTag(step), size: canvasType.kind.size, weight: 700, fill: t.meta, letterSpacing: 0.6 },
      ...wrapText(stepTitle(step, labels[n.id]), n.width - 2 * pad, canvasType.title.size, 600, 2).map(
        (line, i): SceneItem => ({ t: 'text', x: n.x + pad, y: n.y + pad + 30 + i * canvasType.title.line, text: line, size: canvasType.title.size, weight: 600, fill: t.text }),
      ),
    ];
    // Condition badges on the top edge, right-aligned (max 3 + "+n").
    const open = gs.openConditionIds;
    const ids = open.length > 3 ? [...open.slice(0, 2), `+${open.length - 2}`] : open;
    let bx = n.x + n.width - 6;
    for (const id of [...ids].reverse()) {
      const w = textWidth(id, canvasType.badge.size, 700) + 10;
      bx -= w;
      children.push({ t: 'rect', x: bx, y: n.y - 8, w, h: 16, r: 8, fill: tk.conditionBadge.bg, stroke: tk.conditionalBorder, strokeWidth: 1 });
      children.push({ t: 'text', x: bx + w / 2, y: n.y + 3.5, text: id, size: canvasType.badge.size, weight: 700, fill: tk.conditionBadge.text, anchor: 'middle', mono: true });
      bx -= 4;
    }
    if (decor.view === 'configurator') {
      clampMeta(stepMetaLines(step, def)).forEach((line, i) => {
        const text = wrapText(line, n.width - 2 * pad, canvasType.meta.size, 400, 1)[0] ?? '';
        children.push({ t: 'text', x: n.x + pad, y: n.y + 82 + i * canvasType.meta.line, text, size: canvasType.meta.size, weight: 400, fill: t.meta });
      });
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

/* ------------------------------------------------------------------ executive view (VW-01) */

const EXEC = { cardWidth: 236, pad: 12, titleLine: 17, caption: 14, gap: 10 } as const;

/** Stage cards: what happens, in which order, by whom; "only if" tags; parallel steps in one card (DEC-035). */
export function buildExecutiveDiagram(def: ProcessDefinition, graph: SemanticGraph, theme: Theme = 'light', decor: SceneDecor = {}): Scene {
  const tk = nodeTokens(theme);
  const s = semantic[theme];
  const labels = decor.labels ?? {};
  const textW = EXEC.cardWidth - 2 * EXEC.pad - 14;
  const titleLines = (id: string) => wrapText(stepTitle(graph.steps[id]!.step, labels[id]), textW, 13, 600, 2);
  /**
   * Caption lines under a step title (F-01/F-02, DEC-040): lane on its own line; the FULL
   * "only if" list (wrapped to 2 lines, never collapsed to "4 conditions"); completion on its own
   * line so nothing competes for space.
   */
  const captionLines = (id: string): { text: string; tone: 'muted' | 'conditional' | 'complete' }[] => {
    const gs = graph.steps[id]!;
    const out: { text: string; tone: 'muted' | 'conditional' | 'complete' }[] = [{ text: wrapText(laneLabel.get(gs.laneId) ?? '', textW, 11, 400, 1)[0] ?? '', tone: 'muted' }];
    if (gs.conditional) for (const l of wrapText(`only if ${conditionPhrase(gs.openConditionIds, Infinity)}`, textW, 11, 400, 2)) out.push({ text: l, tone: 'conditional' });
    if (gs.step.complete) out.push({ text: '✓ Process complete after this step', tone: 'complete' });
    return out;
  };
  const laneLabel = new Map(graph.lanes.map((l) => [l.id, l.label]));
  const EL = executiveLayout(graph, { cardWidth: EXEC.cardWidth, stepHeight: (id) => titleLines(id).length * EXEC.titleLine + captionLines(id).length * EXEC.caption + EXEC.gap });
  const items: SceneItem[] = [];

  items.push({ t: 'group', role: 'edges', children: EL.edges.map((e): SceneItem => ({ t: 'path', points: e.points, stroke: tk.edge, width: 1.5, arrow: true })) });

  for (const c of EL.cards) {
    const st = graph.stages[c.stageIndex]!;
    const allConditional = st.stepIds.every((id) => graph.steps[id]!.conditional);
    const children: SceneItem[] = [
      { t: 'rect', x: c.x, y: c.y, w: c.w, h: c.h, r: 10, fill: s.surface, stroke: allConditional ? tk.conditionalBorder : tk.action.border, strokeWidth: allConditional ? 1.75 : 1.25, ...(allConditional ? { dash: SKIP_DASH } : {}) },
      { t: 'text', x: c.x + EXEC.pad, y: c.y + 19, text: `STAGE ${c.stageIndex + 1} · STEP ${st.order.toUpperCase()}${st.parallel ? ' · PARALLEL' : ''}`, size: 10, weight: 700, fill: s['text-muted'], letterSpacing: 0.6 },
    ];
    for (const row of c.steps) {
      const gs = graph.steps[row.id]!;
      const style = tk[nodeStyleOf(gs.step.kind)];
      const y0 = c.y + row.y;
      children.push({ t: 'circle', cx: c.x + EXEC.pad + 4, cy: y0 + 9, r: 4, fill: style.bg, stroke: style.border, strokeWidth: 1.25 });
      const lines = titleLines(row.id);
      lines.forEach((l, i) => children.push({ t: 'text', x: c.x + EXEC.pad + 14, y: y0 + 13 + i * EXEC.titleLine, text: l, size: 13, weight: 600, fill: s.text }));
      const capY = y0 + 13 + lines.length * EXEC.titleLine - 2;
      captionLines(row.id).forEach((cl, i) =>
        children.push({
          t: 'text',
          x: c.x + EXEC.pad + 14,
          y: capY + i * EXEC.caption,
          text: cl.text,
          size: 11,
          weight: cl.tone === 'complete' ? 600 : 400,
          fill: cl.tone === 'conditional' ? s['on-conditional-subtle'] : cl.tone === 'complete' ? s.success : s['text-secondary'],
        }),
      );
    }
    // 'stage-card', not 'step': the canvas skips 'step' groups because React Flow draws those live.
    items.push({ t: 'group', role: 'stage-card', id: `stage-${c.stageIndex}`, children });
  }
  return { width: EL.width, height: EL.height, background: s.surface, items };
}

/* ------------------------------------------------------------------ export wrapper */

/** Top edge (scene y) of a top-level group, from its shapes. Used to pin page furniture (DEC-043). */
export function groupTop(scene: Scene, role: SceneRole): number | undefined {
  const g = scene.items.find((i): i is Extract<SceneItem, { t: 'group' }> => i.t === 'group' && i.role === role);
  if (!g) return undefined;
  const ys = g.children.flatMap(function top(i): number[] {
    if (i.t === 'text') return [i.y - i.size];
    if (i.t === 'rect') return [i.y];
    if (i.t === 'circle') return [i.cy - i.r];
    if (i.t === 'path' || i.t === 'poly') return i.points.map((pt) => pt[1]);
    return i.children.flatMap(top);
  });
  return ys.length ? Math.min(...ys) : undefined;
}

export function translate(items: SceneItem[], dx: number, dy: number): SceneItem[] {
  return items.map((it): SceneItem => {
    switch (it.t) {
      case 'rect': return { ...it, x: it.x + dx, y: it.y + dy };
      case 'circle': return { ...it, cx: it.cx + dx, cy: it.cy + dy };
      case 'poly': return { ...it, points: it.points.map(([x, y]): Point => [x + dx, y + dy]) };
      case 'text': return { ...it, x: it.x + dx, y: it.y + dy };
      case 'path': return { ...it, points: it.points.map(([x, y]): Point => [x + dx, y + dy]) };
      case 'group': return { ...it, children: translate(it.children, dx, dy) };
    }
  });
}

const VIEW_NAME = { executive: 'Executive', owner: 'Process owner', configurator: 'Configurator' } as const;

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
  const executive = decor.view === 'executive';
  const diagram = executive ? buildExecutiveDiagram(def, graph, theme, decor) : buildDiagramScene(def, graph, L, theme, decor);
  const s = semantic[theme];
  const tk = nodeTokens(theme);
  const M = EXPORT_DIAGRAM_OFFSET.x;
  const width = Math.max(diagram.width, 960) + 2 * M;
  const inner = width - 2 * M;
  const items: SceneItem[] = [];

  const title = def.variant ? `${def.process} (${def.variant})` : def.process;
  items.push({
    t: 'group',
    role: 'header',
    children: [
      { t: 'text', x: M, y: M + 18, text: title, size: 22, weight: 700, fill: s.primary },
      { t: 'text', x: M, y: M + 40, text: [`${VIEW_NAME[decor.view ?? 'owner']} view`, def.meta.effectiveDate && `effective ${def.meta.effectiveDate}`, def.meta.dueDate && `overall due ${def.meta.dueDate}`, summaryLine(def, graph), decor.subtitle].filter(Boolean).join(' · '), size: 12, weight: 400, fill: s['text-muted'] },
    ],
  });

  const diagramTop = EXPORT_DIAGRAM_OFFSET.y;
  items.push(...translate(diagram.items, M, diagramTop));

  // Legend (DS §10.6).
  let y = diagramTop + diagram.height + 28;
  const legend: SceneItem[] = [{ t: 'text', x: M, y, text: 'LEGEND', size: 10, weight: 800, fill: s['text-muted'], letterSpacing: 1 }];
  y += 14;
  const entries: [SceneItem, string][] = executive
    ? [
        [{ t: 'rect', x: 0, y: 0, w: 28, h: 16, r: 4, fill: s.surface, stroke: tk.action.border, strokeWidth: 1.25 }, 'Stage: steps in one card run at the same time'],
        [{ t: 'rect', x: 0, y: 0, w: 28, h: 16, r: 4, fill: s.surface, stroke: tk.conditionalBorder, strokeWidth: 1.75, dash: SKIP_DASH }, 'Every step in the stage is conditional'],
        [{ t: 'circle', cx: 14, cy: 8, r: 5, fill: tk.approval.bg, stroke: tk.approval.border, strokeWidth: 1.25 }, 'Approval (other dots: action, to do, system)'],
      ]
    : [
    [{ t: 'rect', x: 0, y: 0, w: 28, h: 16, r: 4, fill: tk.approval.bg, stroke: tk.approval.border, strokeWidth: 1.5 }, 'Approval / start'],
    [{ t: 'rect', x: 0, y: 0, w: 28, h: 16, r: 4, fill: tk.action.bg, stroke: tk.action.border, strokeWidth: 1.5 }, 'Action or review'],
    [{ t: 'rect', x: 0, y: 0, w: 28, h: 16, r: 4, fill: tk.todo.bg, stroke: tk.todo.border, strokeWidth: 1.5 }, 'To do'],
    [{ t: 'rect', x: 0, y: 0, w: 28, h: 16, r: 4, fill: tk.system.bg, stroke: tk.system.border, strokeWidth: 1.5 }, 'Workday service / integration'],
    [{ t: 'rect', x: 0, y: 0, w: 28, h: 16, r: 4, fill: tk.action.bg, stroke: tk.conditionalBorder, strokeWidth: 1.75, dash: SKIP_DASH }, 'Runs only if its condition (Cn) is true'],
    [{ t: 'rect', x: 11, y: -3, w: 6, h: 22, r: 2, fill: tk.parallelBar }, 'Steps run in parallel'],
    [{ t: 'circle', cx: 14, cy: 8, r: 8, fill: tk.completion }, 'Process is complete after this step'],
    [{ t: 'poly', points: diamondPoints(14, 8, 9), fill: tk.conditionBadge.bg, stroke: tk.conditionalBorder, strokeWidth: 1.5 }, 'Decision: Yes runs the approval, No skips it'],
    [{ t: 'circle', cx: 14, cy: 8, r: 7, fill: s.surface, stroke: tk.completion, strokeWidth: 2.5 }, 'Start'],
    [{ t: 'circle', cx: 14, cy: 8, r: 7, fill: s.surface, stroke: s.primary, strokeWidth: 3.5 }, 'End of the flow'],
      ];
  const colW = Math.min(inner / 4, 290); // readable legend even on very wide diagrams (DEC-033)
  entries.forEach(([shape, label], i) => {
    const x = M + (i % 4) * colW;
    const yy = y + Math.floor(i / 4) * 26;
    legend.push(...translate([shape], x, yy));
    legend.push({ t: 'text', x: x + 38, y: yy + 12, text: label, size: 11, weight: 400, fill: s['text-secondary'] });
  });
  y += Math.ceil(entries.length / 4) * 26 + 6;
  for (const line of wrapText(EXCEPTIONS_NOTE, Math.min(inner, 4 * colW), 11)) {
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
    const colWidth = Math.min(inner / 2, 600) - 16; // fixed reading width (DEC-033)
    const visible = new Set(Object.keys(graph.steps));
    const orderOf = new Map(Object.values(graph.steps).map((g) => [g.step.id, g.step.order]));
    let colY = [y, y];
    def.conditions.forEach((c, i) => {
      const col = i < half ? 0 : 1;
      const x = M + col * (colWidth + 32);
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
  items.push({ t: 'group', role: 'footer', children: [{ t: 'text', x: M, y: y + 12, text: 'Generated by BPMap · Independent product, not affiliated with Workday, Inc.', size: 9, weight: 400, fill: s['text-muted'] }] });

  return { width, height: Math.ceil(y + 12 + M), background: s.surface, items };
}

/* ------------------------------------------------------------------ SVG serialiser */

const n = (v: number) => (Math.round(v * 10) / 10).toString();
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function itemSvg(it: SceneItem): string {
  switch (it.t) {
    case 'rect':
      return `<rect x="${n(it.x)}" y="${n(it.y)}" width="${n(it.w)}" height="${n(it.h)}"${it.r ? ` rx="${n(it.r)}"` : ''} fill="${it.fill}"${it.stroke ? ` stroke="${it.stroke}" stroke-width="${n(it.strokeWidth ?? 1)}"` : ''}${it.dash ? ` stroke-dasharray="${it.dash.join(' ')}"` : ''}/>`;
    case 'poly':
      return `<polygon points="${it.points.map(([x, y]) => `${n(x)},${n(y)}`).join(' ')}" fill="${it.fill}"${it.stroke ? ` stroke="${it.stroke}" stroke-width="${n(it.strokeWidth ?? 1)}"` : ''}/>`;
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
