/**
 * Steps-sheet rows → ProcessDefinition (Architecture §7.4).
 * Pure function: no I/O, no clock (the caller passes `importedAt`), deterministic for the same input.
 *
 * Every cell is decoded first (decodeCell: Workday's literal "&#xa;" line breaks), then split on
 * line breaks only (DEC-027).
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
  type Validation,
} from '@bpmap/model';
import { normaliseHeader, type ColumnMap } from './mapping.ts';
import type { Limits } from './limits.ts';
import { cellLines, decodeCell, excelDate, hasEncodingResidue } from './decode.ts';

export interface NormaliseInput {
  rows: string[][];
  headerRowIndex: number;
  map: ColumnMap;
  preamble: string[][]; // rows above the header (title, effective date, initiating groups…)
  fileName?: string;
  contentHash: string;
  importedAt: string;
  limits: Limits;
  truncatedRows: boolean;
}

const TRUE_VALUES = new Set(['yes', 'y', 'true', 'x', '✓', '✔', '1']);
const WORKDAY_OWNED = /\s*\(\s*workday\s+owned\s*\)\s*$/i;
const STEP_LABEL = /^(.*?)\s*\(([^()]*)\)\s+step\s+[a-z0-9]+/i; // "Change Job (Default Definition) step a - …"
const TITLE_LABEL = /^(?:(?:edit\s+|view\s+)?business process definition\s*[:\-]\s*)?(.*?)\s*\(([^()]*)\)\s*$/i;
const SEVERITY = /\s*\((critical|warning|info)\)\s*$/i;

const bool = (v: string | undefined) => TRUE_VALUES.has((v ?? '').trim().toLowerCase());
const opt = (v: string | undefined) => {
  const t = (v ?? '').replace(/\s+/g, ' ').trim();
  return t ? t : undefined;
};
const condKey = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim();

/** "Restriction: …" / "Alternate: …" lines of the Additional Information column; the rest is kept. */
function splitAdditionalInfo(lines: string[]) {
  let restriction: string | undefined;
  let alternate: string | undefined;
  const rest: string[] = [];
  for (const l of lines) {
    const m = /^(restriction|restrictions|alternate)\s*:\s*(.*)$/i.exec(l);
    if (m && m[1]!.toLowerCase().startsWith('restriction')) restriction = m[2]!.trim() || undefined;
    else if (m) alternate = m[2]!.trim() || undefined;
    else rest.push(l);
  }
  return { restriction, alternate, additionalInfo: rest.length ? rest.join('\n') : undefined };
}

function parseValidations(lines: string[]): Validation[] {
  return lines.map((l) => {
    const m = SEVERITY.exec(l);
    return { text: l.replace(SEVERITY, '').trim() || l, severity: (m ? m[1]!.toLowerCase() : 'critical') as Validation['severity'] };
  });
}

/** Key/value rows above the steps table: Effective Date, Due Date, Enable Autocomplete, Initiating Security Groups. */
function parsePreamble(preamble: string[][]) {
  const meta: ProcessDefinition['meta'] = {};
  let initiatingGroups: string[] | undefined;
  for (const row of preamble) {
    const cells = row.map(decodeCell);
    const key = normaliseHeader(cells[0] ?? '');
    const value = cells[1] ?? '';
    if (!key || !value.trim()) continue;
    if (key === 'effective date') meta.effectiveDate = excelDate(value);
    else if (key === 'most recent used date') meta.mostRecentUsedDate = excelDate(value);
    else if (key === 'due date') meta.dueDate = value.trim();
    else if (key === 'enable autocomplete') meta.autocomplete = bool(value);
    else if (key === 'initiating security groups') initiatingGroups = cellLines(value);
  }
  return { meta, initiatingGroups };
}

function processName(preamble: string[][], stepLabels: string[], fileName: string | undefined, warnings: ParseWarning[]) {
  for (const label of stepLabels) {
    const m = STEP_LABEL.exec(label);
    if (m) return { process: m[1]!.trim(), variant: m[2]!.trim() };
  }
  for (const r of preamble) {
    for (const raw of r) {
      const cell = decodeCell(raw).trim();
      const m = TITLE_LABEL.exec(cell);
      if (cell && m && m[1]) return { process: m[1].trim(), variant: m[2]!.trim() };
    }
  }
  const fromFile = (fileName ?? 'Business process').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  warnings.push({ code: 'W-PROCESS-NAME-GUESSED', message: `Process name not found in the file; using "${fromFile}". Rename it in Customise.` });
  return { process: fromFile || 'Business process', variant: '' };
}

export function normaliseSteps(input: NormaliseInput): ProcessDefinition {
  const { map, limits } = input;
  const warnings: ParseWarning[] = [];
  let truncatedCells = 0;
  let residue = 0;
  const get = (row: string[], f: keyof ColumnMap): string => {
    const i = map[f];
    if (i === undefined) return '';
    let v = decodeCell(row[i] ?? '');
    if (v.length > limits.maxCellChars) {
      truncatedCells += 1;
      v = v.slice(0, limits.maxCellChars);
    }
    if (hasEncodingResidue(v)) residue += 1;
    return v;
  };

  // 1. Data rows: everything below the header that has an order or a type.
  const dataRows: { row: string[]; sourceRow: number }[] = [];
  for (let i = input.headerRowIndex + 1; i < input.rows.length; i++) {
    const row = input.rows[i] ?? [];
    if (get(row, 'order').trim() || get(row, 'rawType').trim()) dataRows.push({ row, sourceRow: i + 1 });
  }

  const { meta, initiatingGroups } = parsePreamble(input.preamble);
  const { process, variant } = processName(input.preamble, dataRows.map((d) => get(d.row, 'step')), input.fileName, warnings);

  // 2. Draft steps (without IDs/conditions yet).
  const drafts = dataRows.map(({ row, sourceRow }) => {
    const order = get(row, 'order').trim();
    const rawType = get(row, 'rawType').trim();
    const kind = kindOf(rawType);
    if (!parseOrder(order)) warnings.push({ code: 'W-ORDER-UNPARSEABLE', row: sourceRow, message: `Order "${order}" is not a letter sequence; placed at the end.` });
    if (kind === 'unknown') warnings.push({ code: 'W-KIND-UNKNOWN', row: sourceRow, message: `Step type "${rawType}" is not recognised; shown as a generic step.` });
    const groups = cellLines(get(row, 'groups'));
    if (!groups.length && !SYSTEM_KINDS.has(kind) && kind !== 'initiation')
      warnings.push({ code: 'W-GROUP-EMPTY', row: sourceRow, message: `${KIND_LABEL[kind]} step ${order} has no security group.` });
    const conditionTexts = cellLines(get(row, 'condition')).map((t) => ({ text: t.replace(WORKDAY_OWNED, '').trim(), workdayOwned: WORKDAY_OWNED.test(t) }));
    const info = splitAdditionalInfo(cellLines(get(row, 'additionalInfo')));
    const dueDate = opt(get(row, 'dueDate'));
    const runAs = opt(get(row, 'runAs'));
    const subprocess = cellLines(get(row, 'subprocess'))[0];
    return {
      order,
      stageKey: stageKeyOf(order),
      kind,
      rawType,
      task: opt(get(row, 'task')) ?? '',
      groups,
      allMustAct: bool(get(row, 'allMustAct')),
      optional: bool(get(row, 'optional')),
      conditionTexts,
      dueDate,
      dueOnEffectiveDate: bool(get(row, 'dueOnEffectiveDate')) || /effective date/i.test(dueDate ?? ''),
      alternate: opt(get(row, 'alternate')) ?? info.alternate,
      routing: opt(get(row, 'routing')),
      restriction: opt(get(row, 'restriction')) ?? info.restriction,
      additionalInfo: info.additionalInfo,
      runsAsNamedUser: !!runAs && !/^(no|false)$/i.test(runAs),
      runAs: runAs && !/^(no|false|yes|true)$/i.test(runAs) ? runAs : undefined,
      validations: parseValidations(cellLines(get(row, 'validation'))),
      doNotAdvance: bool(get(row, 'doNotAdvance')),
      complete: bool(get(row, 'complete')),
      subprocess,
      sourceRow,
    };
  });

  // 3. Stable IDs (row order) → duplicates warning.
  const ids = makeStepIds(drafts);
  ids.forEach((id, i) => {
    if (id.includes('~')) warnings.push({ code: 'W-DUP-STEP', row: drafts[i]!.sourceRow, stepId: id, message: `Step ${drafts[i]!.order} "${drafts[i]!.task || drafts[i]!.rawType}" appears more than once in the same stage.` });
  });

  // 4. Workday lists rows in execution order. If our stage sort disagrees, say so (DEC-026).
  for (let i = 1; i < drafts.length; i++) {
    if (compareStageKeys(drafts[i]!.stageKey, drafts[i - 1]!.stageKey) < 0) {
      warnings.push({ code: 'W-ORDER-MISMATCH', row: drafts[i]!.sourceRow, message: `Rows are not in order-letter sequence (step ${drafts[i]!.order} comes after ${drafts[i - 1]!.order}). The diagram follows the order letters.` });
      break;
    }
  }

  // 5. Conditions numbered C1…Cn by first appearance in stage order, deduplicated by text.
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
    const { conditionTexts: _drop, subprocess, ...rest } = d;
    const step: Step = { ...rest, id, conditionIds: stepConds.get(id) ?? [] };
    if (subprocess) step.subProcessRef = { process: subprocess };
    else if (d.kind === 'subprocess' && d.task) step.subProcessRef = { process: d.task };
    for (const k of ['dueDate', 'alternate', 'routing', 'restriction', 'additionalInfo', 'runAs'] as const) if (step[k] === undefined) delete step[k];
    return step;
  });

  const initiation = steps.find((s) => s.kind === 'initiation');
  if (!initiation) warnings.push({ code: 'W-NO-INITIATION', message: 'No Initiation step was found. The diagram starts at the first stage.' });
  if (input.truncatedRows) warnings.push({ code: 'W-ROWS-TRUNCATED', message: `Only the first ${limits.maxRowsPerSheet} rows were read.` });
  if (truncatedCells) warnings.push({ code: 'W-CELL-TRUNCATED', message: `${truncatedCells} cell(s) longer than ${limits.maxCellChars} characters were shortened.` });
  if (residue) warnings.push({ code: 'W-ENCODING', message: `${residue} cell(s) still contain encoded characters (such as "&#…;") after decoding. Check the text of conditions and groups.` });

  return {
    id: definitionIdOf(process, variant),
    process,
    variant,
    source: { kind: 'xlsx', ...(input.fileName ? { fileName: input.fileName } : {}), contentHash: input.contentHash, importedAt: input.importedAt },
    initiatingGroups: initiatingGroups ?? initiation?.groups ?? [],
    meta,
    steps,
    conditions: [...conds.values()],
    notifications: [],
    warnings,
  };
}
