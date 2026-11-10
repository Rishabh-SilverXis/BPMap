/**
 * Header-signature sheet detection and column mapping (Architecture §7.3, IMP-02, IMP-03).
 *
 * The synonym lists are our initial understanding of the Workday export and MUST be validated
 * against real exports (open question T1). Matching is case-, whitespace- and diacritic-insensitive.
 */
export const FIELDS = [
  'step',
  'order',
  'condition',
  'rawType',
  'task',
  'optional',
  'groups',
  'dueDate',
  'alternate',
  'routing',
  'restriction',
  'runAs',
  'allMustAct',
  'complete',
] as const;
export type Field = (typeof FIELDS)[number];
export type ColumnMap = Partial<Record<Field, number>>;

export const REQUIRED_FIELDS: readonly Field[] = ['order', 'rawType', 'task', 'groups'];

const SYNONYMS: Record<Field, string[]> = {
  step: ['step', 'step name', 'business process step'],
  order: ['order', 'step order'],
  condition: ['if', 'condition', 'conditions', 'entry condition'],
  rawType: ['type', 'step type'],
  task: ['specify', 'task', 'business process'],
  optional: ['optional'],
  groups: ['group', 'groups', 'security group', 'security groups', 'security group(s)'],
  dueDate: ['due date', 'due'],
  alternate: ['alternate', 'alternate group', 'alternates'],
  routing: ['routing', 'routing restriction', 'routing restrictions'],
  restriction: ['restriction', 'restrictions'],
  runAs: ['run as named user', 'run as'],
  allMustAct: ['all must act', 'all assignees'],
  complete: ['complete', 'process complete'],
};

export function normaliseHeader(h: string): string {
  return h
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[:*]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const LOOKUP = new Map<string, Field>();
for (const f of FIELDS) for (const s of SYNONYMS[f]) LOOKUP.set(s, f);

/** Auto-map a header row. First matching column wins for each field. */
export function autoMap(headers: readonly string[]): ColumnMap {
  const map: ColumnMap = {};
  headers.forEach((h, i) => {
    const f = LOOKUP.get(normaliseHeader(h));
    if (f && map[f] === undefined) map[f] = i;
  });
  return map;
}

export const missingRequired = (map: ColumnMap): Field[] => REQUIRED_FIELDS.filter((f) => map[f] === undefined);

/** Stable fingerprint of a header layout, used to remember user-chosen mappings (IMP-03). */
export const headerFingerprint = (headers: readonly string[]): string =>
  headers.map(normaliseHeader).filter(Boolean).join('|');

export interface HeaderHit {
  rowIndex: number;
  headers: string[];
  map: ColumnMap;
  score: number;
}

/**
 * Find the header row of a Steps sheet in the first `searchRows` rows. A row qualifies when it
 * maps at least 4 fields (Architecture §7.3).
 */
export function findStepsHeader(rows: readonly string[][], searchRows: number): HeaderHit | null {
  let best: HeaderHit | null = null;
  for (let i = 0; i < Math.min(rows.length, searchRows); i++) {
    const headers = rows[i] ?? [];
    const map = autoMap(headers);
    const score = Object.keys(map).length;
    if (score >= 4 && (!best || score > best.score)) best = { rowIndex: i, headers: [...headers], map, score };
  }
  return best;
}

/** Notifications sheet heuristic: a header row mentioning notifications and recipients/triggers. */
export function looksLikeNotifications(rows: readonly string[][], searchRows: number): boolean {
  for (let i = 0; i < Math.min(rows.length, searchRows); i++) {
    const hs = (rows[i] ?? []).map(normaliseHeader);
    if (hs.some((h) => h.includes('notification')) && hs.some((h) => /recipient|trigger|send/.test(h))) return true;
  }
  return false;
}

/** For a needs-mapping prompt: the best header row in the workbook even if it scores < 4. */
export function bestGuessHeader(rows: readonly string[][], searchRows: number): HeaderHit | null {
  let best: HeaderHit | null = null;
  for (let i = 0; i < Math.min(rows.length, searchRows); i++) {
    const headers = rows[i] ?? [];
    const nonEmpty = headers.filter((h) => h.trim()).length;
    if (nonEmpty < 3) continue;
    const map = autoMap(headers);
    const score = Object.keys(map).length;
    if (!best || score > best.score || (score === best.score && nonEmpty > best.headers.filter(Boolean).length))
      best = { rowIndex: i, headers: [...headers], map, score };
  }
  return best;
}
