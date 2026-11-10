/**
 * Rules engine (Architecture §11). A registry of pure rules over a definition; each produces
 * findings with a stable fingerprint so dismissals can survive re-import.
 *
 * Increment 1.1 ships the first rule, HC-16 (always-false condition), found in a real export
 * where steps s and s1 carry "1=0?" and therefore can never run (DEC-031).
 */
import type { Condition, ProcessDefinition, Step } from '@bpmap/model';

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

export interface Rule {
  id: string;
  title: string;
  severity: Severity;
  evaluate(def: ProcessDefinition): Finding[];
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
  evaluate(def) {
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

export const RULES: readonly Rule[] = [HC16_ALWAYS_FALSE];

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };

export function runRules(def: ProcessDefinition, rules: readonly Rule[] = RULES): Finding[] {
  return rules.flatMap((r) => r.evaluate(def)).sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.ruleId.localeCompare(b.ruleId));
}
