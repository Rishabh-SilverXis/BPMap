/**
 * Regressions from the 2026-11-11 robustness campaign (docs/testing/TEST_REPORT_2026-11-11-phase2.md).
 * Workbooks are built in-test with our own XLSX writer, so each case is readable here.
 */
import { describe, expect, it } from 'vitest';
import { buildXlsx, type Cell } from '../../exporters/src/xlsx.ts';
import { importWorkbook } from './index.ts';

const HEADER = ['Step', 'Order', 'If', 'Type', 'Specify', 'Optional', 'Group', 'Additional Information', 'Routing Modifier', 'All', 'Run As User', 'Validation', 'Due Date', 'Due Date Is Based On Effective Date', 'Do Not Advance', 'Complete', 'Subprocess Definitions'];
const sheet = (name: string, header: string[], rows: Cell[][]) => ({ name, columns: header.map((h) => ({ header: h })), rows });
const steps = (rows: Cell[][]) => sheet('Business Process Steps', HEADER, rows);
const row = (order: string, type: string, specify = '', group = '', more: Partial<Record<'if' | 'complete', string>> = {}): Cell[] => [`x step ${order}`, order, more.if ?? '', type, specify, 'No', group, '', '', '', '', '', '', '', 'No', more.complete ?? '', ''];
const run = (...sheets: ReturnType<typeof sheet>[]) => importWorkbook(buildXlsx(sheets), { importedAt: 'x' });

describe('importer robustness regressions (TEST-2026-11-11)', () => {
  it('D1: Consolidated Approval, Batch/Job and Report are real step types, not "unknown"', () => {
    const r = run(steps([row('a', 'Initiation'), row('b', 'Consolidated Approval', '', 'Manager'), row('c', 'Batch/Job'), row('d', 'Report')]));
    if (r.status !== 'ok') throw new Error(r.status);
    expect(r.definition.steps.map((s) => s.kind)).toEqual(['initiation', 'approval', 'service', 'service']);
    expect(r.definition.warnings.filter((w) => w.code === 'W-KIND-UNKNOWN' || w.code === 'W-GROUP-EMPTY')).toEqual([]);
  });

  it('D2: a workbook with only a Notifications sheet is "no Steps sheet", not a mapping dialog on the wrong sheet', () => {
    const notif = sheet('Notifications', ['System Notifications', '', '', '', '', '', ''], [
      ['Disabled', 'Manual Advance System Notification Disabled', 'Workflow Step', 'Order', 'Type', 'Specify', 'Group'],
      ['No', 'No', 'x step a - Initiation', 'a', 'Initiation', '', 'HR Partner'],
    ]);
    const r = run(notif);
    expect(r.status).toBe('error');
    if (r.status === 'error') expect(r.code).toBe('E-NO-STEPS-SHEET');
  });

  it('D3: a Steps header with no rows is an error with a clear message, not an empty diagram', () => {
    const r = run(steps([]));
    expect(r.status).toBe('error');
    if (r.status === 'error') expect(r.message).toMatch(/has a header but no step rows/);
  });

  it('D7: two Initiation steps raise a warning', () => {
    const r = run(steps([row('a', 'Initiation'), row('b', 'Initiation'), row('c', 'Action', 'Do it', 'HR Partner')]));
    if (r.status !== 'ok') throw new Error(r.status);
    expect(r.definition.warnings.some((w) => /2 Initiation steps/.test(w.message))).toBe(true);
  });

  it('D8: a custom notification without a name is kept, named after its trigger', () => {
    const notif = sheet('Notifications', ['Custom Notifications', '', '', '', ''], [
      ['Disabled', 'Notification', 'Business Process Condition', 'Recipients', 'Trigger on Status / On Entry / On Exit / On Disposition'],
      ['No', '', '', 'Manager', 'On Exit : b - Do it'],
    ]);
    const r = run(steps([row('a', 'Initiation'), row('b', 'Action', 'Do it', 'HR Partner')]), notif);
    if (r.status !== 'ok') throw new Error(r.status);
    expect(r.definition.notifications.map((n) => n.name)).toEqual(['Custom notification (On Exit : b - Do it)']);
    expect(r.definition.notifications[0]!.stepOrder).toBe('b');
  });
});
