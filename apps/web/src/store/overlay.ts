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
  /**
   * Plain-word rewrites of conditions (CUS-01, US-07), keyed by conditionKey(Workday text), NOT by
   * "C3": condition numbers follow stage order and shift when steps change (DEC-010, DEC-049).
   */
  conditionText: Record<string, string>;
  /** Manual layout nudges per step (VIS-11, DEC-054), in layout units; kept across re-imports. */
  nudges: Record<string, { dx: number; dy: number }>;
}

import { conditionKey } from '@bpmap/model';
export { conditionKey };

/** Condition id → plain words, for the conditions that have one. */
export function plainConditions(conditions: readonly { id: string; text: string }[], o: Overlay): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of conditions) {
    const t = o.conditionText[conditionKey(c.text)]?.trim();
    if (t) out[c.id] = t;
  }
  return out;
}

export type View = 'executive' | 'owner' | 'configurator';
export const isView = (v: unknown): v is View => v === 'executive' || v === 'owner' || v === 'configurator';

export const emptyOverlay = (): Overlay => ({ labels: {}, notes: {}, hidden: [], laneNames: {}, dismissedFindings: {}, conditionText: {}, nudges: {} });

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
  const conditionText = isStrMap(o.conditionText) ? { ...(o.conditionText as Record<string, string>) } : {}; // added in 2.3
  const nudges: Overlay['nudges'] = {}; // added in 2.4
  if (o.nudges && typeof o.nudges === 'object') {
    for (const [k, v] of Object.entries(o.nudges as Record<string, unknown>)) {
      const n = v as { dx?: unknown; dy?: unknown };
      if (n && Number.isFinite(n.dx) && Number.isFinite(n.dy)) nudges[k] = { dx: Number(n.dx), dy: Number(n.dy) };
    }
  }
  return { labels: o.labels as Record<string, string>, notes: o.notes as Record<string, string>, hidden: o.hidden as string[], laneNames: o.laneNames as Record<string, string>, dismissedFindings: dismissed, conditionText, nudges };
}

/**
 * Re-import reconciliation (IMP-06, DEC-047): overlay entries whose step or lane no longer exists in
 * the current export. They are kept (not silently dropped) until the user removes them.
 */
export interface Orphans {
  labels: string[];
  notes: string[];
  hidden: string[];
  laneNames: string[];
  conditionText: string[];
  nudges: string[];
}
export function findOrphans(o: Overlay, stepIds: ReadonlySet<string>, laneIds: ReadonlySet<string>, conditionKeys: ReadonlySet<string> = new Set()): Orphans {
  return {
    labels: Object.keys(o.labels).filter((k) => !stepIds.has(k)),
    notes: Object.keys(o.notes).filter((k) => !stepIds.has(k)),
    hidden: o.hidden.filter((k) => !stepIds.has(k)),
    laneNames: Object.keys(o.laneNames).filter((k) => !laneIds.has(k)),
    conditionText: Object.keys(o.conditionText ?? {}).filter((k) => !conditionKeys.has(k)),
    nudges: Object.keys(o.nudges ?? {}).filter((k) => !stepIds.has(k)),
  };
}
export const orphanCount = (x: Orphans) => x.labels.length + x.notes.length + x.hidden.length + x.laneNames.length + x.conditionText.length + x.nudges.length;
export function withoutOrphans(o: Overlay, x: Orphans): Overlay {
  const drop = <T,>(m: Record<string, T>, keys: string[]) => Object.fromEntries(Object.entries(m).filter(([k]) => !keys.includes(k)));
  return { ...o, labels: drop(o.labels, x.labels), notes: drop(o.notes, x.notes), hidden: o.hidden.filter((h) => !x.hidden.includes(h)), laneNames: drop(o.laneNames, x.laneNames), conditionText: drop(o.conditionText, x.conditionText), nudges: drop(o.nudges, x.nudges) };
}
