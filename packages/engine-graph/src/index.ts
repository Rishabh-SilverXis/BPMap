/**
 * Semantic graph (Architecture §8, §9.2): the Workday meaning of a definition, independent of
 * geometry. Columns = stages (order letters), rows = lanes (security groups), plus the transitions
 * between consecutive stages. Pure and deterministic.
 */
import { APPROVAL_KINDS, SYSTEM_KINDS, compareStageKeys, slug, type ProcessDefinition, type StageKey, type Step, type StepId } from '@bpmap/model';

export interface GraphLane {
  id: string;
  label: string;
  system: boolean;
}

export interface GraphStage {
  key: StageKey;
  order: string; // raw order value, e.g. "f1"
  label: string; // "Step f1" or "Step k · 6 in parallel"
  stepIds: StepId[]; // in source-row order
  parallel: boolean;
}

export interface GraphStep {
  step: Step;
  laneId: string;
  stageIndex: number;
  /** Has at least one condition that is not resolved ("yes") in the current scenario. */
  conditional: boolean;
  /** Conditions still open for this case (badges, diamond label). */
  openConditionIds: string[];
  /** Draw a yes/no decision diamond: conditional approvals by default, or any step with a toggled condition (SCN-02). */
  decision: boolean;
}

export interface SemanticGraph {
  definitionId: string;
  lanes: GraphLane[];
  stages: GraphStage[];
  steps: Record<string, GraphStep>;
  /** consecutive stage pairs: Workday advances stage i → i+1 once all running steps of i finish */
  transitions: { from: number; to: number }[];
}

export interface GraphOptions {
  hiddenStepIds?: ReadonlySet<string>;
  laneNames?: Readonly<Record<string, string>>;
  /** Conditions answered "yes" in the scenario (DEC-034). */
  resolvedConditionIds?: ReadonlySet<string>;
  /** Conditions the user wants drawn as decisions on any step kind (SCN-02). */
  decisionConditionIds?: ReadonlySet<string>;
}

export const SYSTEM_LANE = { service: 'Workday (automatic)', integration: 'Integrations' } as const;
const INITIATOR = 'Initiator';
const UNASSIGNED = 'Unassigned';

function laneLabelOf(step: Step): { label: string; system: boolean } {
  if (SYSTEM_KINDS.has(step.kind)) return { label: step.kind === 'integration' ? SYSTEM_LANE.integration : SYSTEM_LANE.service, system: true };
  const primary = step.groups[0];
  if (primary) return { label: primary, system: false };
  return { label: step.kind === 'initiation' ? INITIATOR : UNASSIGNED, system: false };
}

export function buildGraph(def: ProcessDefinition, opts: GraphOptions = {}): SemanticGraph {
  const hidden = opts.hiddenStepIds ?? new Set<string>();
  const resolved = opts.resolvedConditionIds ?? new Set<string>();
  const decisions = opts.decisionConditionIds ?? new Set<string>();
  const visible = def.steps.filter((s) => !hidden.has(s.id));
  const ordered = [...visible].sort((a, b) => compareStageKeys(a.stageKey, b.stageKey) || a.sourceRow - b.sourceRow);

  // Lanes in order of first appearance (stage order); system lanes last (VIS-01).
  const people: GraphLane[] = [];
  const system: GraphLane[] = [];
  const laneByLabel = new Map<string, GraphLane>();
  for (const s of ordered) {
    const { label, system: isSys } = laneLabelOf(s);
    if (laneByLabel.has(label)) continue;
    const lane: GraphLane = { id: `lane-${slug(label) || 'x'}`, label, system: isSys };
    laneByLabel.set(label, lane);
    (isSys ? system : people).push(lane);
  }
  for (const lane of [...people, ...system]) {
    const renamed = opts.laneNames?.[lane.id];
    if (renamed) lane.label = renamed;
  }

  // Stages: one per distinct stage key (MOD-03).
  const stages: GraphStage[] = [];
  for (const s of ordered) {
    let stage = stages[stages.length - 1];
    if (!stage || stage.key !== s.stageKey) {
      stage = { key: s.stageKey, order: s.order || '?', label: '', stepIds: [], parallel: false };
      stages.push(stage);
    }
    stage.stepIds.push(s.id);
  }
  for (const st of stages) {
    st.parallel = st.stepIds.length > 1;
    st.label = `Step ${st.order}${st.parallel ? ` · ${st.stepIds.length} in parallel` : ''}`;
  }

  const steps: Record<string, GraphStep> = {};
  stages.forEach((st, stageIndex) => {
    for (const id of st.stepIds) {
      const step = visible.find((s) => s.id === id)!;
      const open = step.conditionIds.filter((c) => !resolved.has(c));
      const decision = open.length > 0 && (APPROVAL_KINDS.has(step.kind) || open.some((c) => decisions.has(c)));
      steps[id] = { step, laneId: laneByLabel.get(laneLabelOf(step).label)!.id, stageIndex, conditional: open.length > 0, openConditionIds: open, decision };
    }
  });

  return {
    definitionId: def.id,
    lanes: [...people, ...system],
    stages,
    steps,
    transitions: stages.slice(1).map((_, i) => ({ from: i, to: i + 1 })),
  };
}
