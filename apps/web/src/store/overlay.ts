/**
 * Overlay: user customisations kept apart from the imported model (Architecture §13, CUS-01).
 * Increment 1 subset: step labels, notes, hidden steps, lane names. Keys are stable StepIds and
 * lane IDs, so customisations survive a re-import of the same definition (DEC-018).
 */
export interface Overlay {
  labels: Record<string, string>;
  notes: Record<string, string>;
  hidden: string[];
  laneNames: Record<string, string>;
}

export const emptyOverlay = (): Overlay => ({ labels: {}, notes: {}, hidden: [], laneNames: {} });

export function isOverlay(v: unknown): v is Overlay {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  const isStrMap = (m: unknown) => !!m && typeof m === 'object' && Object.values(m as object).every((x) => typeof x === 'string');
  return isStrMap(o.labels) && isStrMap(o.notes) && isStrMap(o.laneNames) && Array.isArray(o.hidden) && o.hidden.every((x) => typeof x === 'string');
}
