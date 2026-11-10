/**
 * Excel export (EXP-08): Steps, Conditions and Health sheets for one definition or a whole pack.
 * Always the FULL definition (no scenario, hidden steps flagged rather than dropped), because the
 * workbook is the reference copy people filter and annotate; the diagram is the scenario view.
 */
import type { SheetSpec } from '@bpmap/exporters';
import { buildGraph } from '@bpmap/engine-graph';
import { KIND_LABEL, type ProcessDefinition } from '@bpmap/model';
import { stepTitle } from '@bpmap/scene';
import type { Finding } from '@bpmap/engine-rules';
import { conditionKey, emptyOverlay, type Overlay } from '../../store/overlay.ts';

export interface WorkbookEntry {
  def: ProcessDefinition;
  overlay: Overlay | undefined;
  findings: Finding[];
}

const name = (d: ProcessDefinition) => (d.variant ? `${d.process} (${d.variant})` : d.process);
const SEVERITY_LABEL: Record<string, string> = { critical: 'Critical', warning: 'Warning', info: 'Info' };

export function workbookSheets(entries: WorkbookEntry[]): SheetSpec[] {
  const multi = entries.length > 1;
  const defCol = multi ? [{ header: 'Definition', width: 30 }] : [];
  const steps: SheetSpec = {
    name: 'Steps',
    columns: [
      ...defCol,
      { header: 'Stage', width: 7 },
      { header: 'Order', width: 7 },
      { header: 'Step', width: 36 },
      { header: 'Type', width: 16 },
      { header: 'Workday task', width: 30 },
      { header: 'Who', width: 26 },
      { header: 'Also', width: 26 },
      { header: 'Optional', width: 9 },
      { header: 'Runs only if', width: 14 },
      { header: 'Conditions', width: 50 },
      { header: 'Due', width: 12 },
      { header: 'Alternate', width: 22 },
      { header: 'Routing', width: 18 },
      { header: 'Restriction', width: 22 },
      { header: 'Run as', width: 18 },
      { header: 'Completes the process', width: 11 },
      { header: 'Hidden in the diagram', width: 11 },
      { header: 'Note', width: 36 },
    ],
    rows: [],
  };
  const conditions: SheetSpec = {
    name: 'Conditions',
    columns: [...defCol, { header: 'Id', width: 6 }, { header: 'Plain words', width: 40 }, { header: 'Workday condition', width: 60 }, { header: 'Owner', width: 14 }, { header: 'Steps', width: 16 }],
    rows: [],
  };
  const health: SheetSpec = {
    name: 'Health',
    columns: [...defCol, { header: 'Severity', width: 10 }, { header: 'Rule', width: 8 }, { header: 'Finding', width: 40 }, { header: 'Details', width: 60 }, { header: 'Steps', width: 14 }, { header: 'Suggested fix', width: 50 }, { header: 'Dismissed because', width: 30 }],
    rows: [],
  };

  for (const { def, overlay, findings } of entries) {
    const ov = overlay ?? emptyOverlay();
    const pre = multi ? [name(def)] : [];
    const graph = buildGraph(def); // full definition: no scenario, nothing hidden
    const plain = (text: string) => ov.conditionText[conditionKey(text)]?.trim();
    const condById = new Map(def.conditions.map((c) => [c.id, c]));
    const orderOf = new Map<string, string>(def.steps.map((s) => [s.id, s.order]));
    const hidden = new Set(ov.hidden);
    for (const stage of graph.stages) {
      for (const id of stage.stepIds) {
        const gs = graph.steps[id]!;
        const st = gs.step;
        const who = st.groups[0] ?? (st.kind === 'initiation' ? def.initiatingGroups.join(', ') : 'Workday (automatic)');
        steps.rows.push([
          ...pre,
          gs.stageIndex + 1,
          st.order,
          stepTitle(st, ov.labels[id]),
          st.rawType || KIND_LABEL[st.kind],
          st.task,
          who,
          st.groups.slice(1).join(', '),
          st.optional,
          st.conditionIds.join(', '),
          st.conditionIds.map((c) => condById.get(c)).filter(Boolean).map((c) => `${c!.id}: ${plain(c!.text) ?? c!.text}`).join('\n'),
          st.dueDate,
          st.alternate,
          st.routing,
          st.restriction,
          st.runAs,
          st.complete,
          hidden.has(id),
          ov.notes[id],
        ]);
      }
    }
    for (const c of def.conditions) {
      conditions.rows.push([...pre, c.id, plain(c.text), c.text, c.workdayOwned ? 'Workday owned' : 'Custom', [...new Set(c.stepIds.map((s) => orderOf.get(s)))].join(', ')]);
    }
    const rank = { critical: 0, warning: 1, info: 2 } as Record<string, number>;
    for (const f of [...findings].sort((a, b) => (rank[a.severity] ?? 3) - (rank[b.severity] ?? 3))) {
      health.rows.push([...pre, SEVERITY_LABEL[f.severity] ?? f.severity, f.ruleId, f.title, f.message, f.stepIds.map((s) => orderOf.get(s) ?? s).join(', '), f.suggestedFix, ov.dismissedFindings[f.fingerprint]?.reason]);
    }
  }
  return [steps, conditions, health];
}

export async function xlsxBlob(entries: WorkbookEntry[], title: string): Promise<Blob> {
  const { buildXlsx } = await import('@bpmap/exporters');
  return new Blob([buildXlsx(workbookSheets(entries), { title }) as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
