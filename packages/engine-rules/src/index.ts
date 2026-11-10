/**
 * Rules engine (Architecture §11). A registry of pure rules over a definition; each produces
 * findings with a stable fingerprint so dismissals can survive re-import.
 *
 * Rules: HC-01..HC-07 (PRD §13, Increment 2.1, DEC-036) and HC-16 (always-false condition,
 * DEC-031). Rules that need an export column skip themselves when the column is empty.
 */
import { APPROVAL_KINDS, SYSTEM_KINDS, type Condition, type ProcessDefinition, type Step } from '@bpmap/model';
import { buildGraph, type SemanticGraph } from '@bpmap/engine-graph';

export type Severity = 'critical' | 'warning' | 'info';

export interface Finding {
  ruleId: string;
  severity: Severity;
  title: string;
  stepIds: string[];
  message: string;
  suggestedFix?: string;
  fingerprint: string;
}

export interface RuleContext {
  def: ProcessDefinition;
  graph: SemanticGraph; // full definition (no scenario, no hidden steps)
  settings: { maxSerialApprovals: number; maxTasksPerStage: number };
}

export interface Rule {
  id: string;
  title: string;
  severity: Severity;
  evaluate(ctx: RuleContext): Finding[];
}

const fp = (...parts: string[]) => parts.join('|');

/** True for condition names that can only evaluate to false: "1=0?", "1 = 0?", "False?", "Never?". */
export function isAlwaysFalse(text: string): boolean {
  const t = text.trim().replace(/\?+$/, '').trim();
  const eq = /^(-?\d+(?:\.\d+)?)\s*={1,2}\s*(-?\d+(?:\.\d+)?)$/.exec(t);
  if (eq) return Number(eq[1]) !== Number(eq[2]);
  return /^(false|never|do not run|disabled)$/i.test(t);
}

const label = (s: Step) => s.task || s.rawType;

export const HC16_ALWAYS_FALSE: Rule = {
  id: 'HC-16',
  title: 'Step can never run',
  severity: 'warning',
  evaluate({ def }) {
    const falseConds = new Map<string, Condition>(def.conditions.filter((c) => isAlwaysFalse(c.text)).map((c) => [c.id, c]));
    if (!falseConds.size) return [];
    return def.steps.flatMap((s) => {
      const hit = s.conditionIds.map((id) => falseConds.get(id)).filter((c): c is Condition => !!c);
      if (!hit.length) return [];
      const c = hit[0]!;
      return [
        {
          ruleId: 'HC-16',
          severity: 'warning' as const,
          title: 'Step can never run',
          stepIds: [s.id],
          message: `Step ${s.order} "${label(s)}" can never run: its condition ${c.id} "${c.text}" is always false.`,
          suggestedFix: 'If the step was switched off on purpose, remove it from the definition (or note why it is kept), so readers and testers are not misled.',
          fingerprint: fp('HC-16', s.id, c.id),
        },
      ];
    });
  },
};

/* -------------------------------------------------------------- HC-01..HC-07 (PRD §13, DEC-036) */

const isPersonStep = (s: Step) => !SYSTEM_KINDS.has(s.kind) && s.kind !== 'initiation';

/** Steps guarded by a constant-false condition never run, so flow rules must ignore them (F-04, DEC-041). */
function neverRuns(def: ProcessDefinition): Set<string> {
  const dead = new Set(def.conditions.filter((c) => isAlwaysFalse(c.text)).map((c) => c.id));
  return new Set(def.steps.filter((s) => s.conditionIds.some((c) => dead.has(c))).map((s) => s.id));
}

const norm = (t: string) => ` ${t.toLowerCase().replace(/[?.!]+$/g, '').replace(/[^a-z0-9= ]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
/**
 * Two condition names are mutually exclusive when one is the other with a single "not" / "is not" /
 * "isn't" negation (e.g. "Country is NOT Canada?" vs "Country is Canada?"). Name-based only: the
 * export has no rule logic, so anything subtler is not inferred.
 */
export function areExclusive(a: string, b: string): boolean {
  const [x, y] = [norm(a).replace(/ isn t /g, ' is not '), norm(b).replace(/ isn t /g, ' is not ')];
  const strip = (t: string) => t.replace(/ not /g, ' ');
  const negations = (t: string) => (t.match(/ not /g) ?? []).length;
  return x !== y && strip(x) === strip(y) && Math.abs(negations(x) - negations(y)) === 1;
}

function exclusiveSteps(def: ProcessDefinition, a: Step, b: Step): boolean {
  const text = (id: string) => def.conditions.find((c) => c.id === id)?.text ?? '';
  return a.conditionIds.some((ca) => b.conditionIds.some((cb) => areExclusive(text(ca), text(cb))));
}
const isApproval = (s: Step) => APPROVAL_KINDS.has(s.kind);
const where = (s: Step) => `step ${s.order} (${s.groups[0] ?? 'no group'})`;
/** A rule that needs a column skips itself when the export has no value for it anywhere. */
const hasData = (def: ProcessDefinition, f: (s: Step) => unknown) => def.steps.some((s) => !!f(s));

export const HC01_SELF_APPROVAL: Rule = {
  id: 'HC-01',
  title: 'Approval not restricted from the initiator',
  severity: 'critical',
  evaluate({ def }) {
    if (!hasData(def, (s) => s.restriction)) return [];
    return def.steps
      .filter((s) => isApproval(s) && !/\binitiator\b/i.test(s.restriction ?? ''))
      .map((s) => ({
        ruleId: 'HC-01', severity: 'critical' as const, title: this.title, stepIds: [s.id], fingerprint: fp('HC-01', s.id),
        message: `The approval at ${where(s)} is not restricted from the initiator${s.restriction ? ` (restricted: ${s.restriction})` : ''}, so the person who started the process could approve it.`,
        suggestedFix: 'Add "Initiator" to the step\'s restrictions so nobody approves their own request.',
      }));
  },
};

export const HC02_NO_ALTERNATE: Rule = {
  id: 'HC-02',
  title: 'Required step has no alternate',
  severity: 'warning',
  evaluate({ def }) {
    if (!hasData(def, (s) => s.alternate)) return [];
    return def.steps
      .filter((s) => isPersonStep(s) && !s.optional && !s.alternate && !/employee as self|initiator/i.test(s.groups[0] ?? ''))
      .map((s) => ({
        ruleId: 'HC-02', severity: 'warning' as const, title: this.title, stepIds: [s.id], fingerprint: fp('HC-02', s.id),
        message: `${where(s)} must be done, but no alternate group is set. If nobody in ${s.groups[0] ?? 'the group'} is available, the process waits.`,
        suggestedFix: 'Set an alternate group (for example the manager relative to the excluded person).',
      }));
  },
};

export const HC03_NO_DUE_DATE: Rule = {
  id: 'HC-03',
  title: 'Approval or action without a due date',
  severity: 'info',
  evaluate({ def }) {
    if (!hasData(def, (s) => s.dueDate)) return [];
    return def.steps
      .filter((s) => (isApproval(s) || s.kind === 'action') && !s.dueDate)
      .map((s) => ({
        ruleId: 'HC-03', severity: 'info' as const, title: this.title, stepIds: [s.id], fingerprint: fp('HC-03', s.id),
        message: `${where(s)} has no due date, so it never shows as overdue.`,
        suggestedFix: 'Add a due date if the step has a service level.',
      }));
  },
};

export const HC04_SERIAL_SAME_GROUP: Rule = {
  id: 'HC-04',
  title: 'Same group acts in consecutive stages',
  severity: 'info',
  evaluate({ def, graph }) {
    const out: Finding[] = [];
    const dead = neverRuns(def);
    graph.stages.forEach((st, i) => {
      const next = graph.stages[i + 1];
      if (!next || st.stepIds.length !== 1 || next.stepIds.length !== 1) return;
      const a = graph.steps[st.stepIds[0]!]!.step;
      const b = graph.steps[next.stepIds[0]!]!.step;
      if (!isPersonStep(a) || !isPersonStep(b) || !a.groups[0] || a.groups[0] !== b.groups[0]) return;
      if (dead.has(a.id) || dead.has(b.id) || exclusiveSteps(def, a, b)) return; // never both run (F-04)
      out.push({
        ruleId: 'HC-04', severity: 'info', title: this.title, stepIds: [a.id, b.id], fingerprint: fp('HC-04', a.id, b.id),
        message: `${a.groups[0]} acts at step ${a.order} and again at step ${b.order}, one after the other.`,
        suggestedFix: 'If the steps don\'t depend on each other, give them the same order letter so they run in parallel.',
      });
    });
    return out;
  },
};

export const HC05_TASK_PILEUP: Rule = {
  id: 'HC-05',
  title: 'One group gets several tasks at once',
  severity: 'info',
  evaluate({ def, graph, settings }) {
    const out: Finding[] = [];
    const dead = neverRuns(def);
    for (const st of graph.stages) {
      const byGroup = new Map<string, Step[]>();
      for (const id of st.stepIds) {
        const s = graph.steps[id]!.step;
        if (!isPersonStep(s) || !s.groups[0] || dead.has(s.id)) continue;
        byGroup.set(s.groups[0], [...(byGroup.get(s.groups[0]) ?? []), s]);
      }
      for (const [group, steps] of byGroup) {
        if (steps.length < settings.maxTasksPerStage) continue;
        out.push({
          ruleId: 'HC-05', severity: 'info', title: this.title, stepIds: steps.map((s) => s.id), fingerprint: fp('HC-05', ...steps.map((s) => s.id)),
          message: `At step ${st.order}, ${group} receives ${steps.length} tasks at the same moment.`,
          suggestedFix: 'Consider a checklist or one consolidated step so the person sees a single task.',
        });
      }
    }
    return out;
  },
};

export const HC06_LONG_APPROVAL_CHAIN: Rule = {
  id: 'HC-06',
  title: 'Long serial approval chain',
  severity: 'warning',
  evaluate({ def, graph, settings }) {
    const out: Finding[] = [];
    const dead = neverRuns(def);
    let run: Step[] = [];
    const flush = () => {
      if (run.length > settings.maxSerialApprovals)
        out.push({
          ruleId: 'HC-06', severity: 'warning', title: this.title, stepIds: run.map((s) => s.id), fingerprint: fp('HC-06', ...run.map((s) => s.id)),
          message: `${run.length} approvals run one after another (steps ${run.map((s) => s.order).join(', ')}). Each adds waiting time.`,
          suggestedFix: 'Run independent approvals in parallel, or raise the thresholds that trigger them.',
        });
      run = [];
    };
    for (const st of graph.stages) {
      const steps = st.stepIds.map((id) => graph.steps[id]!.step);
      if (steps.every((x) => dead.has(x.id))) continue; // a stage that never runs doesn't break or extend a chain
      if (steps.length === 1 && isApproval(steps[0]!)) run.push(steps[0]!);
      else flush();
    }
    flush();
    return out;
  },
};

export const HC07_CUSTOM_CONDITIONS: Rule = {
  id: 'HC-07',
  title: 'Custom conditions to re-check after each Workday release',
  severity: 'info',
  evaluate({ def }) {
    const custom = def.conditions.filter((c) => !c.workdayOwned);
    if (!custom.length) return [];
    return [{
      ruleId: 'HC-07', severity: 'info', title: this.title, stepIds: [...new Set(custom.flatMap((c) => c.stepIds))], fingerprint: fp('HC-07', ...custom.map((c) => c.text)),
      message: `${custom.length} of ${def.conditions.length} conditions are maintained by your team (${custom.map((c) => c.id).join(', ')}).`,
      suggestedFix: 'Add them to your release regression checklist: check they still match policy after each Workday release.',
    }];
  },
};

export const RULES: readonly Rule[] = [HC01_SELF_APPROVAL, HC02_NO_ALTERNATE, HC03_NO_DUE_DATE, HC04_SERIAL_SAME_GROUP, HC05_TASK_PILEUP, HC06_LONG_APPROVAL_CHAIN, HC07_CUSTOM_CONDITIONS, HC16_ALWAYS_FALSE];

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };

export function runRules(def: ProcessDefinition, rules: readonly Rule[] = RULES, settings: Partial<RuleContext['settings']> = {}): Finding[] {
  const ctx: RuleContext = { def, graph: buildGraph(def), settings: { maxSerialApprovals: 4, maxTasksPerStage: 3, ...settings } };
  return rules.flatMap((r) => r.evaluate(ctx)).sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.ruleId.localeCompare(b.ruleId));
}
