/**
 * Scenario engine (Architecture §10.1, SCN-01..03). Pure functions.
 *
 *   A step runs unless one of its conditions is answered "no".  (unset = may run → still drawn dashed)
 *   Conditions answered "yes" are RESOLVED for this case: they no longer make a step conditional,
 *   so its dashed outline and decision diamond disappear (DEC-034).
 */
import { conditionKey, type ProcessDefinition } from '@bpmap/model';

export type Answer = 'yes' | 'no' | 'unset';
export type Answers = Readonly<Record<string, Answer>>;

export interface ScenarioPreset {
  id: string;
  name: string;
  /** Answers by condition id for the definition as currently imported. */
  answers: Record<string, Answer>;
  /** The same answers keyed by conditionKey(Workday text), so a preset survives renumbering (DEC-052). */
  byText?: Record<string, Answer>;
}

/** Per-definition scenario state kept in the store and persisted (SCN-01..03). */
export interface ScenarioState {
  answers: Record<string, Answer>;
  /** Conditions the user chose to draw as yes/no decisions on any step kind (SCN-02). */
  decisions: string[];
  presets: ScenarioPreset[];
}

export const emptyScenario = (): ScenarioState => ({ answers: {}, decisions: [], presets: [] });

export interface ScenarioResult {
  skipped: Set<string>; // step IDs that will not run
  resolved: Set<string>; // condition IDs answered "yes"
  answeredCount: number;
  summary: string; // "Scenario: C3 no · C5 yes" or ""
}

const byNumber = (a: string, b: string) => Number(a.slice(1)) - Number(b.slice(1));

export function evaluateScenario(def: ProcessDefinition, answers: Answers): ScenarioResult {
  const known = new Set(def.conditions.map((c) => c.id));
  const set = Object.entries(answers).filter(([id, a]) => known.has(id) && a !== 'unset');
  const no = new Set(set.filter(([, a]) => a === 'no').map(([id]) => id));
  const resolved = new Set(set.filter(([, a]) => a === 'yes').map(([id]) => id));
  const skipped = new Set(def.steps.filter((s) => s.conditionIds.some((c) => no.has(c))).map((s) => s.id));
  const parts = set.map(([id]) => id).sort(byNumber).map((id) => `${id} ${answers[id]}`);
  return { skipped, resolved, answeredCount: set.length, summary: parts.length ? `Scenario: ${parts.join(' · ')}` : '' };
}

/** Keep only answers/decisions that still refer to existing conditions (after a re-import). */
export function pruneScenario(def: ProcessDefinition, s: ScenarioState): ScenarioState {
  const known = new Set(def.conditions.map((c) => c.id));
  const keep = (a: Record<string, Answer>) => Object.fromEntries(Object.entries(a).filter(([id]) => known.has(id)));
  return { answers: keep(s.answers), decisions: s.decisions.filter((d) => known.has(d)), presets: s.presets.map((p) => ({ ...p, answers: keep(p.answers) })) };
}

/** Add text-keyed answers to a preset (on save and before sharing). */
export function withTextKeys(def: ProcessDefinition, p: ScenarioPreset): ScenarioPreset {
  const textOf = new Map(def.conditions.map((c) => [c.id as string, conditionKey(c.text)]));
  const byText: Record<string, Answer> = { ...(p.byText ?? {}) };
  for (const [id, a] of Object.entries(p.answers)) {
    const k = textOf.get(id);
    if (k) byText[k] = a;
  }
  return { ...p, byText };
}

/** A preset's answers for THIS definition: by condition text when known, else by id (older presets). */
export function presetAnswersFor(def: ProcessDefinition, p: ScenarioPreset): Record<string, Answer> {
  if (!p.byText || !Object.keys(p.byText).length) return pruneScenario(def, { answers: p.answers, decisions: [], presets: [] }).answers;
  const out: Record<string, Answer> = {};
  for (const c of def.conditions) {
    const a = p.byText[conditionKey(c.text)];
    if (a) out[c.id] = a;
  }
  return out;
}

/**
 * Re-import (IMP-06): translate answers, decision toggles and presets from the old definition's
 * condition ids to the new one's via the condition text, then drop what no longer exists.
 * Without the old definition (first import) this is pruneScenario.
 */
export function rekeyScenario(oldDef: ProcessDefinition | undefined, newDef: ProcessDefinition, s: ScenarioState): ScenarioState {
  if (!oldDef) return pruneScenario(newDef, s);
  const keyOfOld = new Map(oldDef.conditions.map((c) => [c.id as string, conditionKey(c.text)]));
  const idOfNew = new Map(newDef.conditions.map((c) => [conditionKey(c.text), c.id as string]));
  const map = (id: string) => {
    const k = keyOfOld.get(id);
    return k ? idOfNew.get(k) : undefined;
  };
  const rekey = (a: Record<string, Answer>) => {
    const out: Record<string, Answer> = {};
    for (const [id, v] of Object.entries(a)) {
      const n = map(id);
      if (n) out[n] = v;
    }
    return out;
  };
  return {
    answers: rekey(s.answers),
    decisions: [...new Set(s.decisions.map(map).filter((x): x is string => !!x))],
    presets: s.presets.map((p) => withTextKeys(newDef, { ...withTextKeys(oldDef, p), answers: rekey(p.answers) })),
  };
}

export function isScenarioState(v: unknown): v is ScenarioState {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  const okAnswers = (a: unknown) => !!a && typeof a === 'object' && Object.values(a as object).every((x) => x === 'yes' || x === 'no' || x === 'unset');
  return okAnswers(o.answers) && Array.isArray(o.decisions) && Array.isArray(o.presets) && (o.presets as unknown[]).every((p) => !!p && typeof p === 'object' && typeof (p as ScenarioPreset).name === 'string' && okAnswers((p as ScenarioPreset).answers) && ((p as ScenarioPreset).byText === undefined || okAnswers((p as ScenarioPreset).byText)));
}
