/**
 * Overlay: user customisations kept apart from the imported model (Architecture §13, CUS-01).
 * Keys are stable StepIds, lane IDs and finding fingerprints, so customisations survive a
 * re-import of the same definition (DEC-018).
 */
export interface Dismissal {
  reason: string;
  at: string;
}

export interface Overlay {
  labels: Record<string, string>;
  notes: Record<string, string>;
  hidden: string[];
  laneNames: Record<string, string>;
  /** Health findings the user dismissed, keyed by fingerprint (HLT-02). */
  dismissedFindings: Record<string, Dismissal>;
}

export type View = 'executive' | 'owner' | 'configurator';
export const isView = (v: unknown): v is View => v === 'executive' || v === 'owner' || v === 'configurator';

export const emptyOverlay = (): Overlay => ({ labels: {}, notes: {}, hidden: [], laneNames: {}, dismissedFindings: {} });

const isStrMap = (m: unknown) => !!m && typeof m === 'object' && Object.values(m as object).every((x) => typeof x === 'string');

/** Validate + upgrade stored overlays (older ones have no `dismissedFindings`). Returns null if invalid. */
export function normaliseOverlay(v: unknown): Overlay | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (!isStrMap(o.labels) || !isStrMap(o.notes) || !isStrMap(o.laneNames) || !Array.isArray(o.hidden) || !o.hidden.every((x) => typeof x === 'string')) return null;
  const dismissed: Record<string, Dismissal> = {};
  if (o.dismissedFindings && typeof o.dismissedFindings === 'object') {
    for (const [k, d] of Object.entries(o.dismissedFindings as Record<string, unknown>)) {
      if (d && typeof d === 'object' && typeof (d as Dismissal).reason === 'string') dismissed[k] = { reason: (d as Dismissal).reason, at: String((d as Dismissal).at ?? '') };
    }
  }
  return { labels: o.labels as Record<string, string>, notes: o.notes as Record<string, string>, hidden: o.hidden as string[], laneNames: o.laneNames as Record<string, string>, dismissedFindings: dismissed };
}
