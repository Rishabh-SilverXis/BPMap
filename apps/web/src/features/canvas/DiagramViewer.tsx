/**
 * Diagram viewer (DEC-042): a fixed diagram in a native scroll container, replacing the free
 * pan/zoom canvas, which made wide processes hard to read.
 *
 *  ┌ scroll container (overflow: auto) ───────────────────────────────────────────┐
 *  │ ┌ sized box (scene × zoom) ───────────────────────────────────────────────┐ │
 *  │ │ [sticky lane column]  ← position: sticky; left: 0 (frozen while scrolling)│ │
 *  │ │ [scaled layer: scene SVG background + step buttons]  (absolute, scale z)  │ │
 *  │ └──────────────────────────────────────────────────────────────────────────┘ │
 *  └──────────────────────────────────────────────────────────────────────────────┘
 *
 * The frozen column draws the same `laneHeaderItems` as the scene, at the same coordinates, so
 * at scroll 0 it sits exactly over the scene's own lane headers.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { Minus, Plus, MoveVertical, MoveHorizontal } from 'lucide-react';
import { EXPORT_DIAGRAM_OFFSET, LANE_HEADER_WIDTH, clampMeta, laneHeaderItems, stepMetaLines, stepTitle, translate } from '@bpmap/scene';
import { KIND_LABEL } from '@bpmap/model';
import { nodeTokens, semantic, type Theme } from '@bpmap/design-tokens';
import type { Diagram } from '../../app/derive.ts';
import { useStore } from '../../store/store.ts';
import { SceneSvg } from './SceneSvg.tsx';
import { StepNode } from './StepNode.tsx';

const ZOOM_MIN = 0.3;
const ZOOM_MAX = 2;
const STEPS = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));

export function DiagramViewer({ diagram, theme }: { diagram: Diagram; theme: Theme }) {
  const selected = useStore((s) => s.selectedStepId);
  const select = useStore((s) => s.select);
  const scroller = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState<number | null>(null); // null = not chosen yet → auto-fit on first size
  const [scrolledX, setScrolledX] = useState(false);
  const { scene, layout: L, view } = diagram;
  const ox = EXPORT_DIAGRAM_OFFSET.x;
  const oy = EXPORT_DIAGRAM_OFFSET.y;
  const tokens = useMemo(() => nodeTokens(theme), [theme]);
  const surface = semantic[theme].surface;
  const hasLanes = view !== 'executive' && L.lanes.length > 0;

  // Default zoom: show every lane (fit height) for swimlanes, fit width for the card view; never
  // below 60% (readability) or above 100% (DEC-042).
  const fitHeight = useCallback(() => clampZoom(Math.min(1, Math.max(0.6, (size.h - 16) / scene.height))), [size.h, scene.height]);
  const fitWidth = useCallback(() => clampZoom(Math.min(1, Math.max(0.6, (size.w - 16) / scene.width))), [size.w, scene.width]);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e!.contentRect.width, h: e!.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => setZoom(null), [diagram.def.id, view]); // re-fit when the definition or view changes
  const z = zoom ?? (size.h ? (hasLanes ? fitHeight() : fitWidth()) : 1);

  /** Change zoom keeping the point under (cx, cy) — viewport coordinates — still. */
  const zoomTo = useCallback(
    (next: number, cx?: number, cy?: number) => {
      const el = scroller.current;
      const nz = clampZoom(next);
      if (!el) return setZoom(nz);
      const ax = cx ?? el.clientWidth / 2;
      const ay = cy ?? el.clientHeight / 2;
      const px = (el.scrollLeft + ax) / z;
      const py = (el.scrollTop + ay) / z;
      setZoom(nz);
      requestAnimationFrame(() => {
        el.scrollLeft = px * nz - ax;
        el.scrollTop = py * nz - ay;
      });
    },
    [z],
  );

  // Ctrl/⌘ + wheel (and trackpad pinch) zooms; plain wheel scrolls natively.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomTo(z * Math.exp(-e.deltaY * 0.0025), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [z, zoomTo]);

  // Bring the selected step into view (e.g. "Show step" from Health or Import).
  useEffect(() => {
    if (!selected) return;
    const target = scroller.current?.querySelector<HTMLElement>(`[data-step-id="${CSS.escape(selected)}"]`);
    target?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  }, [selected]);

  const nodes = useMemo(
    () =>
      view === 'executive'
        ? []
        : L.nodes.map((n) => {
            const gs = diagram.graph.steps[n.id]!;
            const step = gs.step;
            const conds = gs.openConditionIds.length ? `, runs only if ${gs.openConditionIds.join(' and ')}` : '';
            return {
              id: n.id,
              style: { left: n.x + ox, top: n.y + oy, width: n.width, height: n.height },
              ariaLabel: `${KIND_LABEL[step.kind]}, step ${step.order}, ${step.groups[0] ?? 'system'}: ${stepTitle(step, diagram.overlay.labels[n.id])}${conds}`,
              data: {
                step,
                openConditionIds: gs.openConditionIds,
                label: diagram.overlay.labels[n.id],
                note: diagram.overlay.notes[n.id],
                ...(view === 'configurator' ? { meta: clampMeta(stepMetaLines(step, diagram.def)) } : {}),
                tokens,
                surface,
              },
            };
          }),
    [diagram, view, L.nodes, ox, oy, tokens, surface],
  );

  // Frozen lane column: background strip + the same lane-name cells as the scene.
  const frozenWidth = ox + LANE_HEADER_WIDTH;
  const laneTop = oy + (L.lanes[0]?.y ?? 0);
  const laneBottom = oy + (L.lanes.at(-1) ? L.lanes.at(-1)!.y + L.lanes.at(-1)!.height : 0);
  const frozenItems = useMemo(() => translate(L.lanes.flatMap((l) => laneHeaderItems(l, theme)), ox, oy), [L.lanes, theme, ox, oy]);

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div
        ref={scroller}
        tabIndex={0}
        role="region"
        aria-label={`Diagram of ${diagram.def.process}. Scroll to explore; Ctrl or Command with the mouse wheel zooms.`}
        onScroll={(e) => setScrolledX((e.currentTarget as HTMLDivElement).scrollLeft > 4)}
        className="min-h-0 flex-1 overflow-auto bg-bg focus-visible:outline-none"
      >
        <div
          className="relative"
          style={{ width: scene.width * z, height: scene.height * z }}
          onClick={(e) => {
            if (!(e.target as HTMLElement).closest('[data-step-id]')) select(null);
          }}
        >
          {hasLanes && (
            <div
              aria-hidden="true"
              data-testid="frozen-lanes"
              className={clsx('pointer-events-none sticky left-0 top-0 z-20', scrolledX && 'drop-shadow-[2px_0_4px_rgba(15,23,42,0.18)]')}
              style={{ width: frozenWidth * z, height: scene.height * z }}
            >
              <svg width={frozenWidth * z} height={scene.height * z} viewBox={`0 0 ${frozenWidth} ${scene.height}`} fontFamily="'Inter Variable', Inter, -apple-system, 'Segoe UI', Roboto, sans-serif">
                <rect x={0} y={laneTop} width={frozenWidth} height={laneBottom - laneTop} fill={scene.background} />
                {frozenItems.map((it, i) =>
                  it.t === 'rect' ? (
                    <rect key={i} x={it.x} y={it.y} width={it.w} height={it.h} fill={it.fill} stroke={it.stroke} strokeWidth={it.strokeWidth} />
                  ) : it.t === 'text' ? (
                    <text key={i} x={it.x} y={it.y} fontSize={it.size} fontWeight={it.weight} fill={it.fill}>
                      {it.text}
                    </text>
                  ) : null,
                )}
              </svg>
            </div>
          )}
          <div className="absolute left-0 top-0 origin-top-left" style={{ width: scene.width, height: scene.height, transform: `scale(${z})` }}>
            <SceneSvg scene={scene} skip={['step']} />
            {nodes.map((n) => (
              <StepNode key={n.id} id={n.id} data={n.data} style={n.style} selected={n.id === selected} ariaLabel={n.ariaLabel} onSelect={select} />
            ))}
          </div>
        </div>
      </div>

      <div className="absolute bottom-3 left-3 z-30 flex items-center gap-0.5 rounded-[var(--radius-md)] border border-border bg-surface p-1 shadow-[var(--shadow-e2)]" role="toolbar" aria-label="Zoom">
        <button type="button" aria-label="Zoom out" title="Zoom out (Ctrl/⌘ + wheel)" onClick={() => zoomTo([...STEPS].reverse().find((s) => s < z - 0.001) ?? ZOOM_MIN)} className="grid h-7 w-7 place-items-center rounded text-text-secondary hover:bg-surface-sunken">
          <Minus className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => zoomTo(1)} title="Reset to 100%" className="h-7 min-w-[3.25rem] rounded px-1 text-xs font-semibold tabular-nums text-text-secondary hover:bg-surface-sunken" data-testid="zoom-level">
          {Math.round(z * 100)}%
        </button>
        <button type="button" aria-label="Zoom in" title="Zoom in (Ctrl/⌘ + wheel)" onClick={() => zoomTo(STEPS.find((s) => s > z + 0.001) ?? ZOOM_MAX)} className="grid h-7 w-7 place-items-center rounded text-text-secondary hover:bg-surface-sunken">
          <Plus className="h-4 w-4" />
        </button>
        <span className="mx-1 h-4 w-px bg-border" />
        <button type="button" onClick={() => setZoom(fitHeight())} title="Fit all lanes in the height" className="flex h-7 items-center gap-1 rounded px-1.5 text-xs font-medium text-text-secondary hover:bg-surface-sunken">
          <MoveVertical className="h-3.5 w-3.5" aria-hidden /> Fit height
        </button>
        <button type="button" onClick={() => setZoom(fitWidth())} title="Fit the width (min 60%)" className="flex h-7 items-center gap-1 rounded px-1.5 text-xs font-medium text-text-secondary hover:bg-surface-sunken">
          <MoveHorizontal className="h-3.5 w-3.5" aria-hidden /> Fit width
        </button>
      </div>
    </div>
  );
}
