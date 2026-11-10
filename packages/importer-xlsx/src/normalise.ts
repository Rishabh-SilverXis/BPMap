/**
 * Steps-sheet rows → ProcessDefinition (Architecture §7.4).
 * Pure function: no I/O, no clock (the caller passes `importedAt`), deterministic for the same input.
 */
import {
  KIND_LABEL,
  SYSTEM_KINDS,
  compareStageKeys,
  definitionIdOf,
  kindOf,
  makeStepIds,
  parseOrder,
  stageKeyOf,
  type Condition,
  type ParseWarning,
  type ProcessDefinition,
  type Step,
  type StepId,
} from '@bpmap/model';
import type { ColumnMap } from './mapping.ts';
import type { Limits } from './limits.ts';

export interface NormaliseInput {
  rows: string[][];
  headerRowIndex: number;
  map: ColumnMap;
  preamble: string[][]; // rows above the header (title, effective date…)
  fileName?: string;
  contentHash: string;
  importedAt: string;
  limits: Limits;
  truncatedRows: boolean;
}

const TRUE_VALUES = new Set(['yes', 'y', 'true', 'x', '✓', '✔', '1']);
const WORKDAY_OWNED = /\s*\(\s*workday\s+owned\s*\)\s*$/i;
const STEP_LABEL = /^(.*?)\s*\(([^()]*)\)\s+step\s+[a-z0-9]+/i; // "Change Job (Default Definition) step a - …"
const TITLE_LABEL = /^(?:business process definition\s*[:\-]\s*)?(.*?)\s*\(([^()]*)\)\s*$/i;

const bool = (v: string | undefined) => TRUE_VALUES.has((v ?? '').trim().toLowerCase());
const opt = (v: string | undefined) => {
  const t = (v ?? '').trim();
  return t ? t : undefined;
};
const lines = (v: string | undefined) =>
  (v ?? '')
    .split(/\r?\n|;/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
const condKey = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim();

function processName(input: NormaliseInput, get: (row: string[], f: keyof ColumnMap) => string, dataRows: string[][], warnings: ParseWarning[]) {
  for (const r of dataRows) {
    const m = STEP_LABEL.exec(get(r, 'step'));
    if (m) return { process: m[1]!.trim(), variant: m[2]!.trim() };
  }
  for (const r of input.preamble) {
    for (const cell of r) {
      const m = TITLE_LABEL.exec(cell.trim());
      if (cell.trim() && m && m[1]) return { process: m[1].trim(), variant: m[2]!.trim() };
    }
  }
  const fromFile = (input.fileName ?? 'Business process').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  warnings.push({ code: 'W-PROCESS-NAME-GUESSED', message: `Process name not found in the file; using "${fromFile}". Rename it in Customise.` });
  return { process: fromFile || 'Business process', variant: '' };
}

export function normaliseSteps(input: NormaliseInput): ProcessDefinition {
  const { map, limits } = input;
  const warnings: ParseWarning[] = [];
  let truncatedCells = 0;
  const get = (row: string[], f: keyof ColumnMap): string => {
    const i = map[f];
    if (i === undefined) return '';
    const v = row[i] ?? '';
    if (v.length > limits.maxCellChars) {
      truncatedCells += 1;
      return v.slice(0, limits.maxCellChars);
    }
    return v;
  };

  // 1. Data rows: everything below the header that has an order or a type.
  const dataRows: { row: string[]; sourceRow: number }[] = [];
  for (let i = input.headerRowIndex + 1; i < input.rows.length; i++) {
    const row = input.rows[i] ?? [];
    if (get(row, 'order').trim() || get(row, 'rawType').trim()) dataRows.push({ row, sourceRow: i + 1 });
  }

  const { process, variant } = processName(input, get, dataRows.map((d) => d.row), warnings);

  // 2. Draft steps (without IDs/conditions yet).
  const drafts = dataRows.map(({ row, sourceRow }) => {
    const order = get(row, 'order').trim();
    const rawType = get(row, 'rawType').trim();
    const kind = kindOf(rawType);
    if (!parseOrder(order)) warnings.push({ code: 'W-ORDER-UNPARSEABLE', row: sourceRow, message: `Order "${order}" is not a letter sequence; placed at the end.` });
    if (kind === 'unknown') warnings.push({ code: 'W-KIND-UNKNOWN', row: sourceRow, message: `Step type "${rawType}" is not recognised; shown as a generic step.` });
    const groups = lines(get(row, 'groups'));
    if (!groups.length && !SYSTEM_KINDS.has(kind) && kind !== 'initiation')
      warnings.push({ code: 'W-GROUP-EMPTY', row: sourceRow, message: `${KIND_LABEL[kind]} step ${order} has no security group.` });
    const conditionTexts = lines(get(row, 'condition')).map((t) => ({ text: t.replace(WORKDAY_OWNED, '').trim(), workdayOwned: WORKDAY_OWNED.test(t) }));
    const dueDate = opt(get(row, 'dueDate'));
    return {
      order,
      stageKey: stageKeyOf(order),
      kind,
      rawType,
      task: get(row, 'task').replace(/\s+/g, ' ').trim(),
      groups,
      allMustAct: bool(get(row, 'allMustAct')),
      optional: bool(get(row, 'optional')),
      conditionTexts,
      dueDate,
      dueOnEffectiveDate: /effective date/i.test(dueDate ?? ''),
      alternate: opt(get(row, 'alternate')),
      routing: opt(get(row, 'routing')),
      restriction: opt(get(row, 'restriction')),
      runsAsNamedUser: bool(get(row, 'runAs')),
      complete: bool(get(row, 'complete')),
      sourceRow,
    };
  });

  // 3. Stable IDs (row order) → duplicates warning.
  const ids = makeStepIds(drafts);
  ids.forEach((id, i) => {
    if (id.includes('~')) warnings.push({ code: 'W-DUP-STEP', row: drafts[i]!.sourceRow, stepId: id, message: `Step ${drafts[i]!.order} "${drafts[i]!.task || drafts[i]!.rawType}" appears more than once in the same stage.` });
  });

  // 4. Conditions numbered C1…Cn by first appearance in stage order, deduplicated by text.
  const byStage = drafts.map((d, i) => ({ d, id: ids[i]! })).sort((a, b) => compareStageKeys(a.d.stageKey, b.d.stageKey) || a.d.sourceRow - b.d.sourceRow);
  const conds = new Map<string, Condition>();
  const stepConds = new Map<StepId, string[]>();
  for (const { d, id } of byStage) {
    const cids: string[] = [];
    for (const c of d.conditionTexts) {
      const key = condKey(c.text);
      let cond = conds.get(key);
      if (!cond) {
        cond = { id: `C${conds.size + 1}`, text: c.text, workdayOwned: c.workdayOwned, stepIds: [] };
        conds.set(key, cond);
      }
      cond.workdayOwned ||= c.workdayOwned;
      if (!cond.stepIds.includes(id)) cond.stepIds.push(id);
      if (!cids.includes(cond.id)) cids.push(cond.id);
    }
    stepConds.set(id, cids);
  }

  const steps: Step[] = drafts.map((d, i) => {
    const id = ids[i]!;
    const { conditionTexts: _drop, ...rest } = d;
    const step: Step = { ...rest, id, conditionIds: stepConds.get(id) ?? [], doNotAdvance: false };
    if (d.kind === 'subprocess' && d.task) step.subProcessRef = { process: d.task };
    for (const k of ['dueDate', 'alternate', 'routing', 'restriction'] as const) if (step[k] === undefined) delete step[k];
    return step;
  });

  const initiation = steps.find((s) => s.kind === 'initiation');
  if (!initiation) warnings.push({ code: 'W-NO-INITIATION', message: 'No Initiation step was found. The diagram starts at the first stage.' });
  if (input.truncatedRows) warnings.push({ code: 'W-ROWS-TRUNCATED', message: `Only the first ${limits.maxRowsPerSheet} rows were read.` });
  if (truncatedCells) warnings.push({ code: 'W-CELL-TRUNCATED', message: `${truncatedCells} cell(s) longer than ${limits.maxCellChars} characters were shortened.` });

  return {
    id: definitionIdOf(process, variant),
    process,
    variant,
    source: { kind: 'xlsx', ...(input.fileName ? { fileName: input.fileName } : {}), contentHash: input.contentHash, importedAt: input.importedAt },
    initiatingGroups: initiation?.groups ?? [],
    steps,
    conditions: [...conds.values()],
    notifications: [],
    warnings,
  };
}
