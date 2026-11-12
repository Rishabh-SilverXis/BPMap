/**
 * Local persistence (Architecture §14.2, NFR-REL). IndexedDB via Dexie.
 * Increment 1 uses a small key-value table (DEC-017); everything read back passes the zod gate.
 */
import Dexie, { type Table } from 'dexie';
import { parseDefinition, withFreshStageKeys, type ProcessDefinition } from '@bpmap/model';
import { untracked, useStore, type ImportReport } from '../store/store.ts';
import { isView, normaliseOverlay, type Overlay, type View } from '../store/overlay.ts';
import { isScenarioState, type ScenarioState } from '@bpmap/engine-scenario';
import type { ColumnMap } from '@bpmap/importer-xlsx';

interface KV {
  key: string;
  value: unknown;
}

class BpmapDb extends Dexie {
  kv!: Table<KV, string>;
  constructor() {
    super('bpmap');
    this.version(1).stores({ kv: 'key' });
  }
}

let db: BpmapDb | null = null;
try {
  db = new BpmapDb();
} catch {
  db = null;
}

interface SavedProject {
  definitions: unknown[];
  overlays: Record<string, unknown>;
  scenarios?: Record<string, unknown>;
  views?: Record<string, unknown>;
  reports: Record<string, ImportReport>;
  activeId: string | null;
}

export async function hydrateFromStorage(): Promise<void> {
  if (!db) {
    useStore.setState({ saveState: 'unavailable' });
    return;
  }
  try {
    const [proj, profiles] = await Promise.all([db.kv.get('project'), db.kv.get('mappingProfiles')]);
    const saved = proj?.value as SavedProject | undefined;
    const definitions: ProcessDefinition[] = [];
    for (const d of saved?.definitions ?? []) {
      const r = parseDefinition(d);
      if (r.ok) definitions.push(withFreshStageKeys(r.value)); // invalid entries are dropped, never loaded unchecked
    }
    const overlays: Record<string, Overlay> = {};
    for (const [k, v] of Object.entries(saved?.overlays ?? {})) {
      const o = normaliseOverlay(v);
      if (o) overlays[k] = o;
    }
    const scenarios: Record<string, ScenarioState> = {};
    for (const [k, v] of Object.entries(saved?.scenarios ?? {})) if (isScenarioState(v)) scenarios[k] = v;
    const views: Record<string, View> = {};
    for (const [k, v] of Object.entries(saved?.views ?? {})) if (isView(v)) views[k] = v;
    untracked(() => useStore.setState({
      definitions,
      overlays,
      scenarios,
      views,
      reports: saved?.reports ?? {},
      activeId: definitions.some((d) => d.id === saved?.activeId) ? saved!.activeId : (definitions[0]?.id ?? null),
      mappingProfiles: (profiles?.value as Record<string, ColumnMap>) ?? {},
      saveState: definitions.length ? 'saved' : 'idle',
    }));
  } catch {
    useStore.setState({ saveState: 'unavailable' });
  }
}

/** Every tab of this origin shares the project; this id tells "my save" from another tab's (DEC-055). */
const TAB_ID = Math.random().toString(36).slice(2);
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('bpmap-project') : null;

/**
 * Debounced autosave of the persisted slices (500 ms after the last change). The pending save is
 * flushed when the tab is hidden or closed, so an edit made just before closing is not lost
 * (TEST-2026-11-11). Other tabs are told after each save and show a "changed elsewhere" notice.
 */
export function startAutosave(): void {
  if (!db) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const save = async () => {
    timer = undefined;
    const st = useStore.getState();
    try {
      await db!.kv.bulkPut([
        { key: 'project', value: { definitions: st.definitions, overlays: st.overlays, scenarios: st.scenarios, views: st.views, reports: st.reports, activeId: st.activeId } satisfies SavedProject },
        { key: 'mappingProfiles', value: st.mappingProfiles },
      ]);
      useStore.setState({ saveState: 'saved' });
      channel?.postMessage({ from: TAB_ID, at: Date.now() });
    } catch {
      useStore.setState({ saveState: 'unavailable' });
    }
  };
  useStore.subscribe((s, prev) => {
    if (s.definitions === prev.definitions && s.overlays === prev.overlays && s.scenarios === prev.scenarios && s.views === prev.views && s.activeId === prev.activeId && s.mappingProfiles === prev.mappingProfiles) return;
    clearTimeout(timer);
    if (s.saveState !== 'saving') useStore.setState({ saveState: 'saving' });
    timer = setTimeout(save, 500);
  });
  const flush = () => {
    if (timer === undefined) return;
    clearTimeout(timer);
    void save(); // IndexedDB writes started during pagehide complete in current browsers
  };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
  channel?.addEventListener('message', (e: MessageEvent<{ from: string }>) => {
    if (e.data?.from !== TAB_ID) useStore.setState({ changedInOtherTab: true });
  });
  void navigator.storage?.persist?.().catch(() => undefined);
}

/** "Remove everything from this browser" */
export async function clearStorage(): Promise<void> {
  await db?.kv.clear();
}
