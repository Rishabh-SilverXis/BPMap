/**
 * Application store (Architecture §14.1). Zustand + zundo.
 *
 * Only `overlays` is undoable (CUS-04): imports are not undone, you remove a definition instead.
 * Keystrokes in overlay fields are coalesced into one undo step (500 ms, DEC-019).
 */
import { create } from 'zustand';
import { temporal } from 'zundo';
import type { ProcessDefinition } from '@bpmap/model';
import type { ColumnMap, ImportOutcome } from '@bpmap/importer-xlsx';
import { emptyOverlay, type Overlay } from './overlay.ts';
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
export type PanelTab = 'step' | 'health' | 'report';

export interface ProjectState {
  definitions: ProcessDefinition[];
  reports: Record<string, ImportReport>;
  overlays: Record<string, Overlay>;
  activeId: string | null;
  selectedStepId: string | null;
  panel: PanelTab;
  importState: ImportState;
  mappingProfiles: Record<string, ColumnMap>;
  saveState: 'idle' | 'saving' | 'saved' | 'unavailable';
  themePref: ThemePref;

  importFiles(files: File[]): Promise<void>;
  applyMapping(map: ColumnMap): Promise<void>;
  dismissImportError(): void;
  setActive(id: string): void;
  removeDefinition(id: string): void;
  select(stepId: string | null): void;
  setPanel(tab: PanelTab): void;
  setThemePref(pref: ThemePref): void;
  setLabel(stepId: string, label: string): void;
  setNote(stepId: string, note: string): void;
  setHidden(stepId: string, hidden: boolean): void;
  setLaneName(laneId: string, name: string): void;
  replaceProject(p: { definitions: ProcessDefinition[]; overlays: Record<string, Overlay>; reports?: Record<string, ImportReport> }): void;
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
        activeId: null,
        selectedStepId: null,
        panel: 'step',
        importState: { status: 'idle' },
        mappingProfiles: {},
        saveState: 'idle',
        themePref: readThemePref(),

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
        setActive: (id) => set({ activeId: id, selectedStepId: null }),
        removeDefinition(id) {
          useStore.temporal.getState().clear(); // undo history refers to the removed definition
          const s = get();
          const definitions = s.definitions.filter((d) => d.id !== id);
          const { [id]: _o, ...overlays } = s.overlays;
          const { [id]: _r, ...reports } = s.reports;
          set({ definitions, overlays, reports, activeId: s.activeId === id ? (definitions[0]?.id ?? null) : s.activeId, selectedStepId: null });
        },
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
        setHidden: (stepId, hidden) =>
          withOverlay(`hidden|${stepId}|${Date.now()}`, (o) => ({ ...o, hidden: hidden ? [...new Set([...o.hidden, stepId])] : o.hidden.filter((x) => x !== stepId) })),
        setLaneName: (laneId, name) =>
          withOverlay(`lane|${laneId}`, (o) => {
            const laneNames = { ...o.laneNames };
            if (name.trim()) laneNames[laneId] = name;
            else delete laneNames[laneId];
            return { ...o, laneNames };
          }),
        replaceProject: (p) =>
          untracked(() => set({ definitions: p.definitions, overlays: p.overlays, reports: p.reports ?? {}, activeId: p.definitions[0]?.id ?? null, selectedStepId: null })),
      };
    },
    {
      partialize: (s) => ({ overlays: s.overlays }),
      equality: (a, b) => a.overlays === b.overlays,
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
