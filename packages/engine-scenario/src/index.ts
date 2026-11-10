/**
 * Scenario engine (Architecture §10.1, SCN-01..03). Pure functions.
 *
 *   A step runs unless one of its conditions is answered "no".  (unset = may run → still drawn dashed)
 *   Conditions answered "yes" are RESOLVED for this case: they no longer make a step conditional,
 *   so its dashed outline and decision diamond disappear (DEC-034).
 */
import type { ProcessDefinition } from '@bpmap/model';

export type Answer = 'yes' | 'no' | 'unset';
export type Answers = Readonly<Record<string, Answer>>;

export interface ScenarioPreset {
  id: string;
  name: string;
  answers: Record<string, Answer>;
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

export function isScenarioState(v: unknown): v is ScenarioState {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  const okAnswers = (a: unknown) => !!a && typeof a === 'object' && Object.values(a as object).every((x) => x === 'yes' || x === 'no' || x === 'unset');
  return okAnswers(o.answers) && Array.isArray(o.decisions) && Array.isArray(o.presets) && (o.presets as unknown[]).every((p) => !!p && typeof p === 'object' && typeof (p as ScenarioPreset).name === 'string' && okAnswers((p as ScenarioPreset).answers));
}
