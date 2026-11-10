/**
 * Canonical process model (Architecture §6.1). The zod schemas are the single source of truth;
 * the TypeScript types are inferred from them so runtime validation and static types cannot drift.
 *
 * Every importer (XLSX, project file, future AI vision) must pass its output through
 * `parseDefinition` / `parseProject` before it reaches the store (MOD-01).
 */
import { z } from 'zod';

export const SCHEMA_VERSION = 1;

export const STEP_KINDS = [
  'initiation',
  'approval',
  'approval-chain',
  'consolidated-approval-chain',
  'action',
  'todo',
  'review',
  'checklist',
  'questionnaire',
  'integration',
  'service',
  'subprocess',
  'unknown',
] as const;
export const StepKindSchema = z.enum(STEP_KINDS);
export type StepKind = z.infer<typeof StepKindSchema>;

export const WARNING_CODES = [
  'W-ORDER-UNPARSEABLE',
  'W-KIND-UNKNOWN',
  'W-NO-INITIATION',
  'W-GROUP-EMPTY',
  'W-DUP-STEP',
  'W-ROWS-TRUNCATED',
  'W-CELL-TRUNCATED',
  'W-SUBPROCESS-UNRESOLVED',
  'W-NOTIF-UNLINKED',
  'W-PROCESS-NAME-GUESSED',
] as const;
export const WarningCodeSchema = z.enum(WARNING_CODES);
export type WarningCode = z.infer<typeof WarningCodeSchema>;

export const StepIdSchema = z.string().min(1).brand<'StepId'>();
export type StepId = z.infer<typeof StepIdSchema>;
export const StageKeySchema = z.string().regex(/^[_a-z]{3}\d{3}$/).brand<'StageKey'>();
export type StageKey = z.infer<typeof StageKeySchema>;
export const ConditionIdSchema = z.string().regex(/^C\d+$/);
export type ConditionId = z.infer<typeof ConditionIdSchema>;

export const StepSchema = z.object({
  id: StepIdSchema,
  order: z.string(),
  stageKey: StageKeySchema,
  kind: StepKindSchema,
  rawType: z.string(),
  task: z.string(),
  groups: z.array(z.string()),
  allMustAct: z.boolean(),
  optional: z.boolean(),
  conditionIds: z.array(ConditionIdSchema),
  dueDate: z.string().optional(),
  dueOnEffectiveDate: z.boolean(),
  alternate: z.string().optional(),
  routing: z.string().optional(),
  restriction: z.string().optional(),
  runsAsNamedUser: z.boolean(),
  doNotAdvance: z.boolean(),
  complete: z.boolean(),
  subProcessRef: z.object({ process: z.string(), definitionId: z.string().optional() }).optional(),
  sourceRow: z.number().int().nonnegative(),
});
export type Step = z.infer<typeof StepSchema>;

export const ConditionSchema = z.object({
  id: ConditionIdSchema,
  text: z.string().min(1),
  workdayOwned: z.boolean(),
  stepIds: z.array(StepIdSchema),
  ruleLogic: z.string().optional(),
});
export type Condition = z.infer<typeof ConditionSchema>;

export const NotificationSchema = z.object({
  id: z.string(),
  trigger: z.string(),
  recipients: z.array(z.string()),
  isCustom: z.boolean(),
  stepId: StepIdSchema.optional(),
});
export type Notification = z.infer<typeof NotificationSchema>;

export const ParseWarningSchema = z.object({
  code: WarningCodeSchema,
  row: z.number().int().optional(),
  message: z.string(),
  stepId: StepIdSchema.optional(),
});
export type ParseWarning = z.infer<typeof ParseWarningSchema>;

export const DefinitionSourceSchema = z.object({
  kind: z.enum(['xlsx', 'ai-vision', 'bpmap']),
  fileName: z.string().optional(),
  contentHash: z.string(),
  importedAt: z.string(),
});

export const ProcessDefinitionSchema = z.object({
  id: z.string().min(1),
  process: z.string().min(1),
  variant: z.string(),
  source: DefinitionSourceSchema,
  initiatingGroups: z.array(z.string()),
  steps: z.array(StepSchema),
  conditions: z.array(ConditionSchema),
  notifications: z.array(NotificationSchema),
  warnings: z.array(ParseWarningSchema),
});
export type ProcessDefinition = z.infer<typeof ProcessDefinitionSchema>;

export const ProcessProjectSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: z.string(),
  name: z.string(),
  definitions: z.array(ProcessDefinitionSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ProcessProject = z.infer<typeof ProcessProjectSchema>;

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function toResult<T>(r: { success: true; data: T } | { success: false; error: z.ZodError }): Result<T> {
  if (r.success) return { ok: true, value: r.data };
  const issues = r.error.issues.slice(0, 5).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
  return { ok: false, error: issues.join('; ') };
}

/** The only gate into the store for a single definition. */
export const parseDefinition = (input: unknown): Result<ProcessDefinition> =>
  toResult(ProcessDefinitionSchema.safeParse(input));

/** The only gate into the store for a whole project (after migrations). */
export const parseProject = (input: unknown): Result<ProcessProject> => toResult(ProcessProjectSchema.safeParse(input));
