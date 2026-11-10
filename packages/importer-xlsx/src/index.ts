/**
 * Public entry point of the importer (IMP-01..03, IMP-05). Synchronous and pure so it can run in
 * the import Web Worker (Architecture §7.1) and in Node tests unchanged.
 *
 *   importWorkbook(bytes, opts)
 *     → readWorkbook (unzip with guards, XML → string grids)            xlsx.ts
 *     → per sheet: findStepsHeader / looksLikeNotifications            mapping.ts
 *     → mapping: saved profile ▸ auto-map ▸ needs-mapping outcome       mapping.ts
 *     → normaliseSteps (order, kinds, IDs, conditions, warnings)       normalise.ts
 *     → parseDefinition (zod gate)                                     @bpmap/model
 */
import { parseDefinition, type ProcessDefinition } from '@bpmap/model';
import { LIMITS, type Limits } from './limits.ts';
import { readWorkbook, XlsxError } from './xlsx.ts';
import { autoMap, bestGuessHeader, findStepsHeader, headerFingerprint, looksLikeNotifications, missingRequired, sectionTitle, type ColumnMap, type Field } from './mapping.ts';
import { normaliseSteps } from './normalise.ts';
import { parseNotifications } from './notifications.ts';

export { LIMITS } from './limits.ts';
export { FIELDS, REQUIRED_FIELDS, autoMap, headerFingerprint, normaliseHeader, type ColumnMap, type Field } from './mapping.ts';
export { decodeCell, excelDate } from './decode.ts';

export interface ImportOptions {
  fileName?: string;
  /** header fingerprint → column map chosen earlier by the user (IMP-03) */
  mappingProfiles?: Record<string, ColumnMap>;
  /** explicit mapping for this import (answer to a needs-mapping outcome) */
  mapping?: { fingerprint: string; map: ColumnMap };
  importedAt?: string;
  limits?: Limits;
}

export interface SheetReport {
  name: string;
  /** 'other' = a known Workday section we don't use yet (allowed actions, services, links, rules). */
  role: 'steps' | 'notifications' | 'other' | 'ignored';
  section?: string;
  rows: number;
}

export interface ImportStats {
  rowsRead: number;
  steps: number;
  stages: number;
  parallelStages: number;
  conditions: number;
  conditionalSteps: number;
  securityGroups: number;
  warnings: number;
}

export type ImportOutcome =
  | { status: 'ok'; definition: ProcessDefinition; stats: ImportStats; sheets: SheetReport[]; mappingUsed: { fingerprint: string; map: ColumnMap; source: 'auto' | 'profile' | 'explicit' } }
  | { status: 'needs-mapping'; sheet: string; fingerprint: string; headers: string[]; suggested: ColumnMap; missing: Field[] }
  | { status: 'error'; code: 'E-NOT-XLSX' | 'E-TOO-LARGE' | 'E-ZIP-LIMITS' | 'E-NO-STEPS-SHEET' | 'E-INVALID-MODEL'; message: string };

/** FNV-1a 32-bit over the bytes + length. Change detection only, not security (no WebCrypto in a sync path). */
export function contentHash(bytes: Uint8Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `fnv1a-${h.toString(16).padStart(8, '0')}-${bytes.length}`;
}

export function importWorkbook(bytes: Uint8Array, opts: ImportOptions = {}): ImportOutcome {
  const limits = opts.limits ?? LIMITS;
  let sheets;
  try {
    sheets = readWorkbook(bytes, limits);
  } catch (e) {
    if (e instanceof XlsxError) return { status: 'error', code: e.code, message: e.message };
    throw e;
  }

  // Sheet roles: the section-title row first ("Business Process Steps", "Notifications"…), then
  // header heuristics for files without titles (DEC-028).
  const reports: SheetReport[] = [];
  let stepsSheet: { idx: number; rowIndex: number; headers: string[]; map: ColumnMap } | null = null;
  let notificationsIdx = -1;
  sheets.forEach((s, idx) => {
    const title = sectionTitle(s.rows, limits.headerSearchRows);
    const hit = !title || title.kind === 'steps' ? findStepsHeader(s.rows, limits.headerSearchRows + (title?.rowIndex ?? 0)) : null;
    if (hit && !stepsSheet) {
      stepsSheet = { idx, rowIndex: hit.rowIndex, headers: hit.headers, map: hit.map };
      reports.push({ name: s.name, role: 'steps', rows: s.rows.length });
    } else if (title?.kind === 'notifications' || (!title && looksLikeNotifications(s.rows, limits.headerSearchRows))) {
      if (notificationsIdx < 0) notificationsIdx = idx;
      reports.push({ name: s.name, role: 'notifications', rows: s.rows.length });
    } else if (title) reports.push({ name: s.name, role: 'other', rows: s.rows.length, section: title.kind });
    else reports.push({ name: s.name, role: 'ignored', rows: s.rows.length });
  });

  // No sheet scored ≥ 4 fields: either a mapping answer was supplied, or ask for one.
  if (!stepsSheet) {
    const candidates = sheets.map((s, idx) => ({ idx, hit: bestGuessHeader(s.rows, limits.headerSearchRows) })).filter((c) => c.hit);
    const best = candidates.sort((a, b) => b.hit!.score - a.hit!.score)[0];
    if (!best) return { status: 'error', code: 'E-NO-STEPS-SHEET', message: 'No Steps sheet was found. Export the definition from View Definition → Excel.' };
    const fingerprint = headerFingerprint(best.hit!.headers);
    const chosen = opts.mapping?.fingerprint === fingerprint ? opts.mapping.map : opts.mappingProfiles?.[fingerprint];
    if (!chosen || missingRequired(chosen).length) {
      return { status: 'needs-mapping', sheet: sheets[best.idx]!.name, fingerprint, headers: best.hit!.headers, suggested: best.hit!.map, missing: missingRequired(chosen ?? best.hit!.map) };
    }
    stepsSheet = { idx: best.idx, rowIndex: best.hit!.rowIndex, headers: best.hit!.headers, map: chosen };
    reports[best.idx] = { name: sheets[best.idx]!.name, role: 'steps', rows: sheets[best.idx]!.rows.length };
  }

  const found = stepsSheet as { idx: number; rowIndex: number; headers: string[]; map: ColumnMap };
  const fingerprint = headerFingerprint(found.headers);
  let map = found.map;
  let source: 'auto' | 'profile' | 'explicit' = 'auto';
  if (opts.mapping?.fingerprint === fingerprint) [map, source] = [opts.mapping.map, 'explicit'];
  else if (opts.mappingProfiles?.[fingerprint]) [map, source] = [opts.mappingProfiles[fingerprint]!, 'profile'];
  const missing = missingRequired(map);
  if (missing.length) {
    return { status: 'needs-mapping', sheet: sheets[found.idx]!.name, fingerprint, headers: found.headers, suggested: autoMap(found.headers), missing };
  }

  const sheet = sheets[found.idx]!;
  const draft = normaliseSteps({
    rows: sheet.rows,
    headerRowIndex: found.rowIndex,
    map,
    preamble: sheet.rows.slice(0, found.rowIndex),
    ...(opts.fileName ? { fileName: opts.fileName } : {}),
    contentHash: contentHash(bytes),
    importedAt: opts.importedAt ?? new Date().toISOString(),
    limits,
    truncatedRows: sheet.truncatedRows,
  });

  if (notificationsIdx >= 0) {
    const { notifications, unlinked } = parseNotifications(sheets[notificationsIdx]!.rows, draft.steps);
    draft.notifications = notifications;
    if (unlinked) draft.warnings.push({ code: 'W-NOTIF-UNLINKED', message: `${unlinked} notification(s) refer to a step that isn't in the Steps sheet.` });
  }

  const parsed = parseDefinition(draft);
  if (!parsed.ok) return { status: 'error', code: 'E-INVALID-MODEL', message: `The export was read but produced an invalid model: ${parsed.error}` };
  const def = parsed.value;

  const stageCounts = new Map<string, number>();
  def.steps.forEach((s) => stageCounts.set(s.stageKey, (stageCounts.get(s.stageKey) ?? 0) + 1));
  return {
    status: 'ok',
    definition: def,
    sheets: reports,
    mappingUsed: { fingerprint, map, source },
    stats: {
      rowsRead: sheet.rows.length,
      steps: def.steps.length,
      stages: stageCounts.size,
      parallelStages: [...stageCounts.values()].filter((n) => n > 1).length,
      conditions: def.conditions.length,
      conditionalSteps: def.steps.filter((s) => s.conditionIds.length).length,
      securityGroups: new Set(def.steps.flatMap((s) => s.groups)).size,
      warnings: def.warnings.length,
    },
  };
}
