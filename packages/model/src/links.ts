/**
 * Subprocess linking across a project (IMP-04, DEC-053). Pure: no store, no UI.
 *
 * A Workday step of type Sub-Process names the definition it runs in "Subprocess Definitions",
 * e.g. "Propose Compensation Hire (Default Definition)". We match it to a loaded definition by, in
 * order: exact "Process (Variant)", then process name alone when exactly one definition has it,
 * then the step's task name (the PRD's "linked by task name"). Never to the calling definition.
 */
import type { ProcessDefinition, Step } from './schema.ts';

export interface SubprocessLink {
  /** Calling definition and step. */
  fromId: string;
  stepId: string;
  stepOrder: string;
  /** What the export says the step runs. */
  name: string;
  /** Linked definition, when it is loaded. */
  toId?: string;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const fullName = (d: { process: string; variant: string }) => norm(d.variant ? `${d.process} (${d.variant})` : d.process);

export function subprocessName(step: Step): string | undefined {
  return step.subProcessRef?.process ?? (step.kind === 'subprocess' && step.task ? step.task : undefined);
}

export function resolveSubprocess(name: string, task: string, defs: readonly ProcessDefinition[], selfId: string): string | undefined {
  const others = defs.filter((d) => d.id !== selfId);
  const n = norm(name);
  const exact = others.find((d) => fullName(d) === n);
  if (exact) return exact.id;
  const bare = n.replace(/\s*\([^)]*\)\s*$/, ''); // "x (default definition)" → "x"
  const byProcess = others.filter((d) => norm(d.process) === bare || norm(d.process) === n);
  if (byProcess.length === 1) return byProcess[0]!.id;
  const t = norm(task);
  const byTask = t ? others.filter((d) => norm(d.process) === t) : [];
  return byTask.length === 1 ? byTask[0]!.id : undefined;
}

/** Every subprocess step in every definition, with its link (if the subprocess is loaded). */
export function linkSubprocesses(defs: readonly ProcessDefinition[]): SubprocessLink[] {
  const out: SubprocessLink[] = [];
  for (const d of defs) {
    for (const s of d.steps) {
      const name = subprocessName(s);
      if (!name) continue;
      const toId = resolveSubprocess(name, s.task, defs, d.id);
      out.push({ fromId: d.id, stepId: s.id, stepOrder: s.order, name, ...(toId ? { toId } : {}) });
    }
  }
  return out;
}
