/**
 * Executive view layout (VW-01, DS §11): one card per stage, parallel steps grouped in the card,
 * cards flow left→right and wrap after `perRow`, connected by orthogonal arrows (DEC-035).
 * Text measurement is injected (`stepHeight`) so this package stays DOM- and font-free.
 */
import type { SemanticGraph } from '@bpmap/engine-graph';
import type { LaidOutEdge, Point } from './index.ts';

export interface ExecutiveOptions {
  stepHeight: (stepId: string) => number;
  cardWidth: number;
  perRow: number;
  gapX: number;
  gapY: number;
  headerHeight: number;
  pad: number;
  margin: number;
}

export interface ExecCard {
  stageIndex: number;
  x: number;
  y: number;
  w: number;
  h: number;
  steps: { id: string; y: number; h: number }[];
}

export interface ExecutiveLayout {
  width: number;
  height: number;
  cards: ExecCard[];
  edges: LaidOutEdge[];
}

export function executiveLayout(graph: SemanticGraph, options: Partial<ExecutiveOptions> & Pick<ExecutiveOptions, 'stepHeight'>): ExecutiveLayout {
  const o: ExecutiveOptions = { cardWidth: 236, perRow: 6, gapX: 44, gapY: 56, headerHeight: 30, pad: 12, margin: 16, ...options };
  const cards: ExecCard[] = [];
  const edges: LaidOutEdge[] = [];
  let rowTop = o.margin;
  for (let start = 0; start < graph.stages.length; start += o.perRow) {
    const row = graph.stages.slice(start, start + o.perRow);
    const rowCards = row.map((st, i) => {
      let y = o.headerHeight;
      const steps = st.stepIds.map((id) => {
        const h = o.stepHeight(id);
        const s = { id, y, h };
        y += h;
        return s;
      });
      return { stageIndex: start + i, x: o.margin + i * (o.cardWidth + o.gapX), y: rowTop, w: o.cardWidth, h: y + o.pad, steps };
    });
    cards.push(...rowCards);
    rowTop += Math.max(...rowCards.map((c) => c.h)) + o.gapY;
  }

  const arrowY = (c: ExecCard) => c.y + o.headerHeight / 2 + 2;
  for (let i = 1; i < cards.length; i++) {
    const a = cards[i - 1]!;
    const b = cards[i]!;
    let points: Point[];
    if (b.y === a.y) points = [[a.x + a.w, arrowY(a)], [b.x, arrowY(b)]];
    else {
      // wrap to the next row: down from the last card, across the gap, down into the first card
      const rowBottom = Math.max(...cards.filter((c) => c.y === a.y).map((c) => c.y + c.h));
      const midY = rowBottom + o.gapY / 2;
      const ax = a.x + a.w / 2;
      const bx = b.x + b.w / 2;
      points = [[ax, a.y + a.h], [ax, midY], [bx, midY], [bx, b.y]];
    }
    edges.push({ id: `x-${i - 1}-${i}`, points, style: 'default', arrow: true });
  }
  const cols = Math.min(graph.stages.length, o.perRow);
  return { width: 2 * o.margin + cols * o.cardWidth + Math.max(0, cols - 1) * o.gapX, height: rowTop - o.gapY + o.margin, cards, edges };
}
