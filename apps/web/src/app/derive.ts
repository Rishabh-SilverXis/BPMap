/**
 * The derivation pipeline (Architecture §8) as React hooks:
 *   model + overlay → buildGraph → layout → buildExportScene
 * Pure functions, memoised on input identity. Increment 1 runs them on the main thread
 * (definitions are well under the 40-step worker threshold of §8; DEC-020).
 */
import { useEffect, useMemo, useState } from 'react';
import { buildGraph, type SemanticGraph } from '@bpmap/engine-graph';
import { layout, type LayoutResult } from '@bpmap/engine-layout';
import { buildExportScene, type Scene } from '@bpmap/scene';
import type { Theme } from '@bpmap/design-tokens';
import type { ProcessDefinition } from '@bpmap/model';
import { useStore } from '../store/store.ts';
import { emptyOverlay, type Overlay } from '../store/overlay.ts';

export interface Diagram {
  def: ProcessDefinition;
  overlay: Overlay;
  graph: SemanticGraph;
  layout: LayoutResult;
  scene: Scene;
}

export function useDiagram(def: ProcessDefinition | null, overlay: Overlay | undefined, theme: Theme): Diagram | null {
  return useMemo(() => {
    if (!def) return null;
    const ov = overlay ?? emptyOverlay();
    const graph = buildGraph(def, { hiddenStepIds: new Set(ov.hidden), laneNames: ov.laneNames });
    const L = layout(graph);
    const scene = buildExportScene(def, graph, L, theme, { labels: ov.labels, notes: ov.notes });
    return { def, overlay: ov, graph, layout: L, scene };
  }, [def, overlay, theme]);
}

/** Resolved theme from the user's preference + OS setting (Design System §15.1). */
export function useResolvedTheme(): Theme {
  const pref = useStore((s) => s.themePref);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const on = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const theme: Theme = pref === 'system' ? (systemDark ? 'dark' : 'light') : pref;
  useEffect(() => {
    const root = document.documentElement;
    if (pref === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', pref);
    root.classList.toggle('system-dark', systemDark);
  }, [pref, systemDark]);
  return theme;
}
