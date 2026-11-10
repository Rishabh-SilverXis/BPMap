/**
 * Application store (Architecture §14.1). Zustand + zundo.
 *
 * `overlays` and `scenarios` are undoable (CUS-04, Architecture §14.1): imports are not undone,
 * you remove a definition instead.
 * Keystrokes in overlay fields are coalesced into one undo step (500 ms, DEC-019).
 */
import { create } from 'zustand';
import { temporal } from 'zundo';
import type { ProcessDefinition } from '@bpmap/model';
import type { ColumnMap, ImportOutcome } from '@bpmap/importer-xlsx';
import { emptyOverlay, withoutOrphans, type Orphans, type Overlay, type View } from './overlay.ts';
import { emptyScenario, pruneScenario, type Answer, type ScenarioState } from '@bpmap/engine-scenario';
import { importFile } from '../workers/importClient.ts';

export interface ImportReport {
  fileName: string;
  stats: Extract<ImportOutcome, { status: 'ok' }>['stats'];
  sheets: Extract<ImportOutcome, { status: 'ok' }>['sheets'];
  mappingSource: 'auto' | 'profile' | 'explicit';
}

export type NeedsMapping = Extract<ImportOutcome, { status: 'needs-mapping' }>;

export type ImportState =
  | { status: 'idle' }
  | { status: 'reading'; fileName: string }
  | { status: 'needs-mapping'; fileName: string; bytes: Uint8Array; outcome: NeedsMapping; queue: File[] }
  | { status: 'error'; fileName?: string; message: string };

export type ThemePref = 'system' | 'light' | 'dark';
export type PanelTab = 'step' | 'scenario' | 'health' | 'report';

export interface RemovedDefinition {
  definition: ProcessDefinition;
  index: number;
  wasActive: boolean;
  overlay?: Overlay;
  report?: ImportReport;
  scenario?: ProjectState['scenarios'][string];
  view?: ProjectState['views'][string];
}

export interface ProjectState {
  definitions: ProcessDefinition[];
  reports: Record<string, ImportReport>;
  overlays: Record<string, Overlay>;
  scenarios: Record<string, ScenarioState>;
  views: Record<string, View>;
  activeId: string | null;
  selectedStepId: string | null;
  panel: PanelTab;
  importState: ImportState;
  mappingProfiles: Record<string, ColumnMap>;
  saveState: 'idle' | 'saving' | 'saved' | 'unavailable';
  /** Session-only UI: focus one lane (VIS-08) and the accessible step-list view (NFR-A11Y). */
  focusLaneId: string | null;
  listMode: boolean;
  /** The definition just closed, kept for the Undo toast until the next close or restore. */
  lastRemoved: RemovedDefinition | null;
  themePref: ThemePref;

  importFiles(files: File[]): Promise<void>;
  applyMapping(map: ColumnMap): Promise<void>;
  dismissImportError(): void;
  setActive(id: string): void;
  removeDefinition(id: string): void;
  restoreRemoved(): void;
  forgetRemoved(): void;
  select(stepId: string | null): void;
  setPanel(tab: PanelTab): void;
  setThemePref(pref: ThemePref): void;
  setLabel(stepId: string, label: string): void;
  setNote(stepId: string, note: string): void;
  /** Plain-word rewrite of a condition; key = conditionKey(Workday text). Empty text clears it. */
  setConditionText(key: string, text: string): void;
  setHidden(stepId: string, hidden: boolean): void;
  setLaneName(laneId: string, name: string): void;
  dismissFinding(fingerprint: string, reason: string): void;
  restoreFinding(fingerprint: string): void;
  setView(view: View): void;
  setFocusLane(laneId: string | null): void;
  setListMode(on: boolean): void;
  removeOrphans(orphans: Orphans): void;
  /**
   * Apply a colleague's customisations file to a definition (CUS-03): incoming entries win per key,
   * everything else is kept; presets are added (same name → replaced). Undoable.
   */
  applyCustomisations(definitionId: string, incoming: Overlay, presets: ScenarioState['presets'], view?: View): void;
  setAnswer(conditionId: string, answer: Answer): void;
  toggleDecision(conditionId: string): void;
  resetScenario(): void;
  savePreset(name: string): void;
  applyPreset(id: string): void;
  deletePreset(id: string): void;
  replaceProject(p: { definitions: ProcessDefinition[]; overlays: Record<string, Overlay>; scenarios?: Record<string, ScenarioState>; views?: Record<string, View>; reports?: Record<string, ImportReport> }): void;
}

const readThemePref = (): ThemePref => {
  try {
    const v = localStorage.getItem('bpmap-theme');
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
};

/**
 * Coalesce rapid overlay edits into one undo entry (zundo handleSet, DEC-019).
 * A burst ends after 500 ms of quiet OR when the user starts editing a different field
 * (`undoBoundary(key)`), so "label then note" are two undo steps, not one.
 */
let flushPending: (() => void) | null = null;
let lastEditKey = '';
function coalesce<A extends unknown[]>(fn: (...a: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  let first: A | undefined;
  const flush = () => {
    clearTimeout(t);
    if (first) fn(...first);
    first = undefined;
  };
  flushPending = flush;
  return (...a: A) => {
    if (!first) first = a; // keep the state from *before* the burst
    clearTimeout(t);
    t = setTimeout(flush, ms);
  };
}
function undoBoundary(key: string) {
  if (key !== lastEditKey) flushPending?.();
  lastEditKey = key;
}

export const useStore = create<ProjectState>()(
  temporal(
    (set, get) => {
      const withScenario = (key: string, f: (s: ScenarioState) => ScenarioState) => {
        const def = get().activeId;
        if (!def) return;
        undoBoundary(`${def}|scenario|${key}`);
        set({ scenarios: { ...get().scenarios, [def]: f(get().scenarios[def] ?? emptyScenario()) } });
      };

      const withOverlay = (key: string, f: (o: Overlay) => Overlay) => {
        const def = get().activeId;
        if (!def) return;
        undoBoundary(`${def}|${key}`);
        const cur = get().overlays[def] ?? emptyOverlay();
        set({ overlays: { ...get().overlays, [def]: f(cur) } });
      };

      async function runImport(file: File, bytes: Uint8Array, mapping?: { fingerprint: string; map: ColumnMap }, queue: File[] = []) {
        set({ importState: { status: 'reading', fileName: file.name } });
        let outcome: ImportOutcome;
        try {
          outcome = await importFile(bytes.slice(), { fileName: file.name, mappingProfiles: get().mappingProfiles, ...(mapping ? { mapping } : {}) });
        } catch (e) {
          set({ importState: { status: 'error', fileName: file.name, message: `Something went wrong while reading ${file.name}. ${(e as Error).message ?? ''}` } });
          return;
        }
        if (outcome.status === 'error') {
          set({ importState: { status: 'error', fileName: file.name, message: outcome.message } });
          return;
        }
        if (outcome.status === 'needs-mapping') {
          set({ importState: { status: 'needs-mapping', fileName: file.name, bytes, outcome, queue } });
          return;
        }
        const def = outcome.definition;
        const s = get();
        const exists = s.definitions.some((d) => d.id === def.id);
        untracked(() => set({
          definitions: exists ? s.definitions.map((d) => (d.id === def.id ? def : d)) : [...s.definitions, def],
          reports: { ...s.reports, [def.id]: { fileName: file.name, stats: outcome.stats, sheets: outcome.sheets, mappingSource: outcome.mappingUsed.source } },
          overlays: s.overlays[def.id] ? s.overlays : { ...s.overlays, [def.id]: emptyOverlay() },
          scenarios: { ...s.scenarios, [def.id]: pruneScenario(def, s.scenarios[def.id] ?? emptyScenario()) },
          activeId: def.id,
          selectedStepId: null,
          panel: def.warnings.length ? 'report' : s.panel,
          importState: { status: 'idle' },
          ...(mapping ? { mappingProfiles: { ...s.mappingProfiles, [mapping.fingerprint]: mapping.map } } : {}),
        }));
        const [next, ...rest] = queue;
        if (next) await runImport(next, new Uint8Array(await next.arrayBuffer()), undefined, rest);
      }

      return {
        definitions: [],
        reports: {},
        overlays: {},
        scenarios: {},
        views: {},
        activeId: null,
        selectedStepId: null,
        panel: 'step',
        importState: { status: 'idle' },
        mappingProfiles: {},
        saveState: 'idle',
        themePref: readThemePref(),
        focusLaneId: null,
        listMode: false,
        lastRemoved: null,
        setFocusLane: (laneId) => set({ focusLaneId: laneId }),
        setListMode: (on) => set({ listMode: on }),
        applyCustomisations(definitionId, incoming, presets, view) {
          const s = get();
          undoBoundary(`${definitionId}|customisations|${Date.now()}`);
          const cur = s.overlays[definitionId] ?? emptyOverlay();
          const merged: Overlay = {
            labels: { ...cur.labels, ...incoming.labels },
            notes: { ...cur.notes, ...incoming.notes },
            hidden: [...new Set([...cur.hidden, ...incoming.hidden])],
            laneNames: { ...cur.laneNames, ...incoming.laneNames },
            dismissedFindings: { ...cur.dismissedFindings, ...incoming.dismissedFindings },
            conditionText: { ...cur.conditionText, ...incoming.conditionText },
          };
          const sc = s.scenarios[definitionId] ?? emptyScenario();
          const names = new Set(presets.map((p) => p.name.trim().toLowerCase()));
          const kept = sc.presets.filter((p) => !names.has(p.name.trim().toLowerCase()));
          const taken = new Set(kept.map((p) => p.id));
          const scenario = { ...sc, presets: [...kept, ...presets.map((p, i) => (taken.has(p.id) ? { ...p, id: `${p.id}-${Date.now().toString(36)}${i}` } : p))] };
          set({
            overlays: { ...s.overlays, [definitionId]: merged },
            scenarios: { ...s.scenarios, [definitionId]: scenario },
            ...(view ? { views: { ...s.views, [definitionId]: view } } : {}),
            activeId: definitionId,
            selectedStepId: null,
          });
        },
        removeOrphans: (orphans) => withOverlay(`orphans|${Date.now()}`, (o) => withoutOrphans(o, orphans)),

        async importFiles(files) {
          const xs = files.filter(Boolean);
          const [first, ...rest] = xs;
          if (!first) return;
          await runImport(first, new Uint8Array(await first.arrayBuffer()), undefined, rest);
        },
        async applyMapping(map) {
          const st = get().importState;
          if (st.status !== 'needs-mapping') return;
          const file = new File([st.bytes as BlobPart], st.fileName);
          await runImport(file, st.bytes, { fingerprint: st.outcome.fingerprint, map }, st.queue);
        },
        dismissImportError: () => set({ importState: { status: 'idle' } }),
        setActive: (id) => set({ activeId: id, selectedStepId: null, focusLaneId: null }),
        removeDefinition(id) {
          const s = get();
          const index = s.definitions.findIndex((d) => d.id === id);
          if (index < 0) return;
          const definitions = s.definitions.filter((d) => d.id !== id);
          const { [id]: overlay, ...overlays } = s.overlays;
          const { [id]: report, ...reports } = s.reports;
          const { [id]: scenario, ...scenarios } = s.scenarios;
          const { [id]: view, ...views } = s.views;
          const lastRemoved: RemovedDefinition = { definition: s.definitions[index]!, index, wasActive: s.activeId === id, overlay, report, scenario, view };
          untracked(() =>
            set({ definitions, overlays, reports, scenarios, views, lastRemoved, activeId: s.activeId === id ? (definitions[Math.min(index, definitions.length - 1)]?.id ?? null) : s.activeId, selectedStepId: null, focusLaneId: null }),
          );
          useStore.temporal.getState().clear(); // undo history refers to the removed definition
        },
        restoreRemoved() {
          const s = get();
          const r = s.lastRemoved;
          if (!r || s.definitions.some((d) => d.id === r.definition.id)) return set({ lastRemoved: null });
          const definitions = [...s.definitions];
          definitions.splice(Math.min(r.index, definitions.length), 0, r.definition);
          const id = r.definition.id;
          untracked(() =>
            set({
              definitions,
              overlays: r.overlay ? { ...s.overlays, [id]: r.overlay } : s.overlays,
              reports: r.report ? { ...s.reports, [id]: r.report } : s.reports,
              scenarios: r.scenario ? { ...s.scenarios, [id]: r.scenario } : s.scenarios,
              views: r.view ? { ...s.views, [id]: r.view } : s.views,
              activeId: r.wasActive || !s.activeId ? id : s.activeId,
              lastRemoved: null,
            }),
          );
        },
        forgetRemoved: () => set({ lastRemoved: null }),
        select: (stepId) => set({ selectedStepId: stepId, ...(stepId ? { panel: 'step' as const } : {}) }),
        setPanel: (panel) => set({ panel }),
        setThemePref(pref) {
          try {
            localStorage.setItem('bpmap-theme', pref);
          } catch {
            /* private mode: preference lives for this session only */
          }
          set({ themePref: pref });
        },
        setLabel: (stepId, label) =>
          withOverlay(`label|${stepId}`, (o) => {
            const labels = { ...o.labels };
            if (label.trim()) labels[stepId] = label;
            else delete labels[stepId];
            return { ...o, labels };
          }),
        setNote: (stepId, note) =>
          withOverlay(`note|${stepId}`, (o) => {
            const notes = { ...o.notes };
            if (note.trim()) notes[stepId] = note;
            else delete notes[stepId];
            return { ...o, notes };
          }),
        setConditionText: (key, text) =>
          withOverlay(`cond|${key}`, (o) => {
            const conditionText = { ...o.conditionText };
            if (text.trim()) conditionText[key] = text;
            else delete conditionText[key];
            return { ...o, conditionText };
          }),
        setHidden: (stepId, hidden) =>
          withOverlay(`hidden|${stepId}|${Date.now()}`, (o) => ({ ...o, hidden: hidden ? [...new Set([...o.hidden, stepId])] : o.hidden.filter((x) => x !== stepId) })),
        setLaneName: (laneId, name) =>
          withOverlay(`lane|${laneId}`, (o) => {
            const laneNames = { ...o.laneNames };
            if (name.trim()) laneNames[laneId] = name;
            else delete laneNames[laneId];
            return { ...o, laneNames };
          }),
        dismissFinding: (fingerprint, reason) =>
          withOverlay(`dismiss|${fingerprint}`, (o) => ({ ...o, dismissedFindings: { ...o.dismissedFindings, [fingerprint]: { reason: reason.trim() || 'No reason given', at: new Date().toISOString() } } })),
        restoreFinding: (fingerprint) =>
          withOverlay(`restore|${fingerprint}`, (o) => {
            const { [fingerprint]: _d, ...rest } = o.dismissedFindings;
            return { ...o, dismissedFindings: rest };
          }),
        setView(view) {
          const def = get().activeId;
          if (def) set({ views: { ...get().views, [def]: view }, ...(view === 'executive' ? { selectedStepId: null } : {}) });
        },
        setAnswer: (conditionId, answer) =>
          withScenario(`answer|${conditionId}`, (sc) => {
            const answers = { ...sc.answers };
            if (answer === 'unset') delete answers[conditionId];
            else answers[conditionId] = answer;
            return { ...sc, answers };
          }),
        toggleDecision: (conditionId) =>
          withScenario(`decision|${conditionId}|${Date.now()}`, (sc) => ({ ...sc, decisions: sc.decisions.includes(conditionId) ? sc.decisions.filter((d) => d !== conditionId) : [...sc.decisions, conditionId] })),
        resetScenario: () => withScenario(`reset|${Date.now()}`, (sc) => ({ ...sc, answers: {} })),
        savePreset: (name) =>
          withScenario(`preset|${Date.now()}`, (sc) => ({ ...sc, presets: [...sc.presets, { id: `p${Date.now().toString(36)}`, name: name.trim() || `Scenario ${sc.presets.length + 1}`, answers: { ...sc.answers } }] })),
        applyPreset: (id) =>
          withScenario(`apply|${Date.now()}`, (sc) => {
            const p = sc.presets.find((x) => x.id === id);
            return p ? { ...sc, answers: { ...p.answers } } : sc;
          }),
        deletePreset: (id) => withScenario(`delpreset|${Date.now()}`, (sc) => ({ ...sc, presets: sc.presets.filter((x) => x.id !== id) })),
        replaceProject: (p) =>
          untracked(() => set({ definitions: p.definitions, overlays: p.overlays, scenarios: p.scenarios ?? {}, views: p.views ?? {}, reports: p.reports ?? {}, activeId: p.definitions[0]?.id ?? null, selectedStepId: null })),
      };
    },
    {
      partialize: (s) => ({ overlays: s.overlays, scenarios: s.scenarios }),
      equality: (a, b) => a.overlays === b.overlays && a.scenarios === b.scenarios,
      limit: 100,
      handleSet: (handleSet) => coalesce(handleSet, 500),
    },
  ),
);

/** Run a state change without recording an undo step (imports and loads are not user edits). */
export function untracked(fn: () => void) {
  const t = useStore.temporal.getState();
  t.pause();
  try {
    fn();
  } finally {
    t.resume();
  }
}

export const useActiveDefinition = () => useStore((s) => s.definitions.find((d) => d.id === s.activeId) ?? null);
export const useActiveOverlay = () => useStore((s) => (s.activeId ? s.overlays[s.activeId] : undefined));
export const useActiveScenario = () => useStore((s) => (s.activeId ? s.scenarios[s.activeId] : undefined));
export const useActiveView = (): View => useStore((s) => (s.activeId ? (s.views[s.activeId] ?? 'owner') : 'owner'));
