/**
 * Notifications sheet (MOD-09, DEC-029). Layout observed in a real export:
 *
 *   "System Notifications"
 *   Disabled | Manual Advance System Notification Disabled | Workflow Step | Order | Type | Specify | Group
 *   …rows…
 *   "Custom Notifications"
 *   Disabled | Notification | Business Process Condition | Recipients | … | Trigger on Status / On Entry / … | Subject | …
 *   …rows…
 *
 * Columns are located by header text, so column order changes don't matter.
 */
import type { Notification, Step } from '@bpmap/model';
import { normaliseHeader } from './mapping.ts';
import { cellLines, decodeCell } from './decode.ts';

const isYes = (v: string | undefined) => /^(yes|true|y|1)$/i.test((v ?? '').trim());

function findTable(rows: string[][], title: string): { headerIndex: number; col: (pred: (h: string) => boolean) => number } | null {
  const t = rows.findIndex((r) => r.filter((c) => c.trim()).length === 1 && normaliseHeader(r.find((c) => c.trim())!) === title);
  if (t < 0 || !rows[t + 1]) return null;
  const headers = rows[t + 1]!.map((h) => normaliseHeader(decodeCell(h)));
  return { headerIndex: t + 1, col: (pred) => headers.findIndex(pred) };
}

/** Rows of a table end at the next single-cell title row or a blank row. */
function tableRows(rows: string[][], headerIndex: number): string[][] {
  const out: string[][] = [];
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const filled = r.filter((c) => c.trim());
    if (filled.length === 0) break; // blank row
    if (filled.length === 1 && !/^(yes|no)$/i.test(filled[0]!.trim())) break; // next section title
    out.push(r);
  }
  return out;
}

/** "On Exit : o - Assign Pay Group" → "o" */
const triggerOrder = (trigger: string) => /\b(?:on\s+(?:entry|exit)|step)\s*:\s*([a-z]{1,3}\d{0,3})\s+-\s/i.exec(trigger)?.[1]?.toLowerCase();

export function parseNotifications(rows: string[][], steps: readonly Step[]): { notifications: Notification[]; unlinked: number } {
  const out: Notification[] = [];
  let unlinked = 0;
  const byOrder = (order: string | undefined, specify?: string) =>
    order ? (steps.find((s) => s.order.toLowerCase() === order && (!specify || s.task === specify)) ?? steps.find((s) => s.order.toLowerCase() === order)) : undefined;

  const sys = findTable(rows, 'system notifications');
  if (sys) {
    const c = {
      disabled: sys.col((h) => h === 'disabled'),
      order: sys.col((h) => h === 'order'),
      step: sys.col((h) => h === 'workflow step'),
      type: sys.col((h) => h === 'type'),
      specify: sys.col((h) => h === 'specify'),
      group: sys.col((h) => h === 'group'),
    };
    for (const r of tableRows(rows, sys.headerIndex)) {
      const cell = (i: number) => (i >= 0 ? decodeCell(r[i] ?? '') : '');
      const order = cell(c.order).trim().toLowerCase();
      if (!order) continue;
      const step = byOrder(order, cell(c.specify).trim() || undefined);
      if (!step) unlinked += 1;
      out.push({
        id: `N${out.length + 1}`,
        kind: 'system',
        name: `System notification: step ${order}${cell(c.type) ? ` (${cell(c.type).trim()})` : ''}`,
        trigger: 'When the step is assigned',
        recipients: cellLines(cell(c.group)),
        disabled: isYes(cell(c.disabled)),
        stepOrder: order,
        ...(step ? { stepId: step.id } : {}),
      });
    }
  }

  const custom = findTable(rows, 'custom notifications');
  if (custom) {
    const c = {
      disabled: custom.col((h) => h === 'disabled'),
      name: custom.col((h) => h === 'notification'),
      condition: custom.col((h) => h.includes('condition')),
      recipients: custom.col((h) => h === 'recipients'),
      trigger: custom.col((h) => h.startsWith('trigger')),
    };
    for (const r of tableRows(rows, custom.headerIndex)) {
      const cell = (i: number) => (i >= 0 ? decodeCell(r[i] ?? '') : '');
      const name = cell(c.name).trim();
      if (!name) continue;
      const trigger = cell(c.trigger).replace(/\s+/g, ' ').trim();
      const order = triggerOrder(trigger);
      const step = byOrder(order);
      if (order && !step) unlinked += 1;
      const condition = cell(c.condition).replace(/\s+/g, ' ').trim();
      out.push({
        id: `N${out.length + 1}`,
        kind: 'custom',
        name,
        trigger,
        ...(condition ? { condition } : {}),
        recipients: cellLines(cell(c.recipients)),
        disabled: isYes(cell(c.disabled)),
        ...(order ? { stepOrder: order } : {}),
        ...(step ? { stepId: step.id } : {}),
      });
    }
  }
  return { notifications: out, unlinked };
}
