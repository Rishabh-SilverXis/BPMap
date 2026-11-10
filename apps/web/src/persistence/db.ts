/**
 * Local persistence (Architecture §14.2, NFR-REL). IndexedDB via Dexie.
 * Increment 1 uses a small key-value table (DEC-017); everything read back passes the zod gate.
 */
import Dexie, { type Table } from 'dexie';
import { parseDefinition, type ProcessDefinition } from '@bpmap/model';
import { untracked, useStore, type ImportReport } from '../store/store.ts';
import { isOverlay, type Overlay } from '../store/overlay.ts';
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
      if (r.ok) definitions.push(r.value); // invalid entries are dropped, never loaded unchecked
    }
    const overlays: Record<string, Overlay> = {};
    for (const [k, v] of Object.entries(saved?.overlays ?? {})) if (isOverlay(v)) overlays[k] = v;
    untracked(() => useStore.setState({
      definitions,
      overlays,
      reports: saved?.reports ?? {},
      activeId: definitions.some((d) => d.id === saved?.activeId) ? saved!.activeId : (definitions[0]?.id ?? null),
      mappingProfiles: (profiles?.value as Record<string, ColumnMap>) ?? {},
      saveState: definitions.length ? 'saved' : 'idle',
    }));
  } catch {
    useStore.setState({ saveState: 'unavailable' });
  }
}

/** Debounced autosave of the persisted slices (500 ms after the last change). */
export function startAutosave(): void {
  if (!db) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  useStore.subscribe((s, prev) => {
    if (s.definitions === prev.definitions && s.overlays === prev.overlays && s.activeId === prev.activeId && s.mappingProfiles === prev.mappingProfiles) return;
    clearTimeout(timer);
    if (s.saveState !== 'saving') useStore.setState({ saveState: 'saving' });
    timer = setTimeout(async () => {
      const st = useStore.getState();
      try {
        await db!.kv.bulkPut([
          { key: 'project', value: { definitions: st.definitions, overlays: st.overlays, reports: st.reports, activeId: st.activeId } satisfies SavedProject },
          { key: 'mappingProfiles', value: st.mappingProfiles },
        ]);
        useStore.setState({ saveState: 'saved' });
      } catch {
        useStore.setState({ saveState: 'unavailable' });
      }
    }, 500);
  });
  void navigator.storage?.persist?.().catch(() => undefined);
}

/** "Remove everything from this browser" */
export async function clearStorage(): Promise<void> {
  await db?.kv.clear();
}
