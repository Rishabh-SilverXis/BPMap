/**
 * Workday step "Type" values → canonical StepKind (MOD-05).
 * Unknown values map to 'unknown' and are reported as W-KIND-UNKNOWN by the importer; the raw
 * value is always preserved on the step (`rawType`).
 */
import type { StepKind } from './schema.ts';

const TYPE_TO_KIND: Record<string, StepKind> = {
  initiation: 'initiation',
  approval: 'approval',
  'approval chain': 'approval-chain',
  'consolidated approval chain': 'consolidated-approval-chain',
  'consolidated approval': 'approval', // one approver sees a consolidated view: an approval (TEST-2026-11-11 D1)
  action: 'action',
  'to do': 'todo',
  todo: 'todo',
  'to-do': 'todo',
  review: 'review',
  'review documents': 'review',
  checklist: 'checklist',
  questionnaire: 'questionnaire',
  integration: 'integration',
  service: 'service',
  'workday service': 'service',
  'batch/job': 'service', // system-run kinds: no security group, system lane
  'batch job': 'service',
  batch: 'service',
  report: 'service',
  'run report': 'service',
  document: 'review',
  documents: 'review',
  'sub-process': 'subprocess',
  'sub process': 'subprocess',
  subprocess: 'subprocess',
};

export function kindOf(rawType: string): StepKind {
  const key = rawType.trim().toLowerCase().replace(/\s+/g, ' ');
  return TYPE_TO_KIND[key] ?? 'unknown';
}

/** Approval-type kinds: drawn navy, and get a decision diamond when conditional (DS §9). */
export const APPROVAL_KINDS: ReadonlySet<StepKind> = new Set(['approval', 'approval-chain', 'consolidated-approval-chain']);

/** Kinds that are executed by the system and live in system lanes at the bottom (VIS-01). */
export const SYSTEM_KINDS: ReadonlySet<StepKind> = new Set(['service', 'integration']);

/** Human label for the kind tag on a step (Design System §10.2). */
export const KIND_LABEL: Record<StepKind, string> = {
  initiation: 'Start',
  approval: 'Approval',
  'approval-chain': 'Approval chain',
  'consolidated-approval-chain': 'Consolidated approval chain',
  action: 'Action',
  todo: 'To do',
  review: 'Review',
  checklist: 'Checklist',
  questionnaire: 'Questionnaire',
  integration: 'Integration',
  service: 'Workday service',
  subprocess: 'Sub-process',
  unknown: 'Unknown type',
};
