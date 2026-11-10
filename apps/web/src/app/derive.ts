/**
 * The derivation pipeline (Architecture §8) as React hooks:
 *   model + overlay + scenario (evaluateScenario) → buildGraph → layout(view) → buildExportScene(view)
 *   model → runRules (Health)
 * Pure functions, memoised on input identity. Increment 1 runs them on the main thread
 * (definitions are well under the 40-step worker threshold of §8; DEC-020).
 */
import { useEffect, useMemo, useState } from 'react';
import { buildGraph, type SemanticGraph } from '@bpmap/engine-graph';
import { layout, type LayoutResult } from '@bpmap/engine-layout';
import { NODE_HEIGHT, buildExportScene, type Scene } from '@bpmap/scene';
import { emptyScenario, evaluateScenario, type ScenarioResult, type ScenarioState } from '@bpmap/engine-scenario';
import { runRules, type Finding } from '@bpmap/engine-rules';
import type { Theme } from '@bpmap/design-tokens';
import type { ProcessDefinition } from '@bpmap/model';
import { useStore } from '../store/store.ts';
import { emptyOverlay, plainConditions, type Overlay, type View } from '../store/overlay.ts';

export interface Diagram {
  def: ProcessDefinition;
  overlay: Overlay;
  scenario: ScenarioState;
  view: View;
  /** Scenario outcome: skipped steps, resolved conditions, summary (SCN-01). */
  outcome: ScenarioResult;
  graph: SemanticGraph;
  layout: LayoutResult;
  scene: Scene;
  /** All findings for the definition (Health runs on the full definition, not the scenario). */
  findings: Finding[];
  /** Condition id → the user's plain words (CUS-01); absent = show the Workday text. */
  conditionText: Record<string, string>;
}

/** Pure derivation (no React): used by the hook below and by exporters, which always render light (DS §12). */
export function deriveDiagram(def: ProcessDefinition, overlay: Overlay | undefined, scenario: ScenarioState | undefined, view: View, theme: Theme): Diagram {
  {
    const ov = overlay ?? emptyOverlay();
    const sc = scenario ?? emptyScenario();
    const outcome = evaluateScenario(def, sc.answers);
    const graph = buildGraph(def, {
      hiddenStepIds: new Set([...ov.hidden, ...outcome.skipped]),
      laneNames: ov.laneNames,
      resolvedConditionIds: outcome.resolved,
      decisionConditionIds: new Set(sc.decisions),
    });
    const L = layout(graph, { nodeHeight: view === 'configurator' ? NODE_HEIGHT.configurator : NODE_HEIGHT.owner });
    const subtitle = outcome.summary ? `${outcome.summary} (${outcome.skipped.size} step${outcome.skipped.size === 1 ? '' : 's'} skipped)` : undefined;
    const conditionText = plainConditions(def.conditions, ov);
    const scene = buildExportScene(def, graph, L, theme, { labels: ov.labels, notes: ov.notes, conditionText, view, ...(subtitle ? { subtitle } : {}) });
    return { def, overlay: ov, scenario: sc, view, outcome, graph, layout: L, scene, findings: runRules(def), conditionText };
  }
}

export function useDiagram(def: ProcessDefinition | null, overlay: Overlay | undefined, scenario: ScenarioState | undefined, view: View, theme: Theme): Diagram | null {
  return useMemo(() => (def ? deriveDiagram(def, overlay, scenario, view, theme) : null), [def, overlay, scenario, view, theme]);
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
