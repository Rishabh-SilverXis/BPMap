// Generates synthetic Workday "View Definition" style exports for golden tests and the in-app sample.
// Run: npm run fixtures   (writes packages/fixtures/data/*.xlsx and copies the sample into apps/web/public)
//
// IMPORTANT: these are SYNTHETIC. Column headers and the "Step" label pattern are our best current
// understanding of the export (Architecture §7.3, open question T1) and must be checked against real,
// anonymised exports from design partners. Step and condition wording is invented for this repo.
import ExcelJS from 'exceljs';
import { mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'data');
mkdirSync(out, { recursive: true });

const P = 'Change Job (Synthetic Sample)';
// order, type, specify, groups, condition(s), optional, due, alternate, routing, complete
const STEPS = [
  ['a', 'Initiation', '', 'Initiator', '', '', '', '', '', ''],
  ['b', 'Action', 'Review: Current Manager', 'Manager', 'Initiated from the transfer request task? (Workday Owned)', 'Yes', '2 Days', 'Alternate Approver', 'Current manager', ''],
  ['c', 'Action', 'Review: Receiving Manager', 'Manager', 'Receiving manager differs from current manager? (Workday Owned)', '', '2 Days', 'Alternate Approver', 'Proposed manager', ''],
  ['d', 'Approval', 'Approve', "Manager's Manager", 'Change is a promotion?', '', '2 Days', 'Manager (relative to excluded)', '', ''],
  ['e', 'Action', 'Review Change Job', 'HR Partner', 'Approver was not the initiator?', 'Yes', '2 Days', '', 'Proposed manager', ''],
  ['f', 'Action', 'Change Organization Assignments', 'HR Partner', 'No later organization changes pending? (Workday Owned)', 'Yes', '2 Days', '', '', ''],
  ['f1', 'Action', 'Assign Collective Agreement', 'HR Partner', 'Country uses collective agreements?', '', '2 Days', '', '', ''],
  ['g', 'Action', 'Propose Compensation Change', 'Compensation Partner', 'Worker is an employee? (Workday Owned)', 'Yes', '2 Days', 'Alternate Approver', 'Proposed manager', ''],
  ['h', 'Approval', 'Approve', 'Works Council', 'Country requires works council approval?\nChange is a demotion?', '', '2 Days', '', '', ''],
  ['i', 'To Do', 'Complete Offboarding Checklist', 'HR Partner', 'Location changed?', '', 'Today (from effective date)', '', 'Current manager', 'Yes'],
  ['j', 'To Do', 'Review Security Group Assignments', 'Security Administrator', 'Worker has user-based security groups?', '', 'Today (from effective date)', '', '', ''],
  ['j', 'Action', 'Update Role Assignments', 'HR Partner', 'Worker has role-based assignments?', 'Yes', 'Today (from effective date)', 'Alternate Owner', '', ''],
  ['k', 'Action', 'Maintain Employee Contract', 'HR Partner', 'Country uses employee contracts?\nContract ended before effective date? (Workday Owned)', 'Yes', '2 Days', '', '', ''],
  ['k', 'Action', 'Assign Pay Group', 'Payroll Interface Partner\nPayroll Partner', 'Primary job and no pending pay group change? (Workday Owned)\nPosition changed?', 'Yes', '2 Days', 'Alternate Approver', '', ''],
  ['k', 'To Do', 'Other Onboarding Procedures', 'HR Partner', 'Location changed?', 'Yes', '1 Day', '', '', ''],
  ['k', 'Action', 'Manage Business Processes for Worker', 'HR Partner', 'Worker has delegations or awaiting tasks? (Workday Owned)', 'Yes', '2 Days', '', '', ''],
  ['k', 'Action', 'Change Superior Organization', 'Organization Owner', 'Move manager team selected? (Workday Owned)', 'Yes', '2 Days', '', '', ''],
  ['k', 'Service', 'Remove Invalid Time Off After Job Change', '', '', '', '', '', '', ''],
];

const HEADERS = ['Step', 'Order', 'If', 'Type', 'Specify', 'Optional', 'Group', 'Due Date', 'Alternate', 'Routing Restriction', 'Complete'];

function stepRow(s) {
  const [order, type, specify, groups, cond, optional, due, alt, routing, complete] = s;
  return [`${P} step ${order} - ${type}`, order, cond, type, specify, optional, groups, due, alt, routing, complete];
}

async function writeBook(file, build) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'BPMap fixture generator';
  build(wb);
  await wb.xlsx.writeFile(join(out, file));
  console.log('wrote', file);
}

// 1. Canonical layout: preamble rows, header row, a Notifications sheet and an unrelated sheet.
await writeBook('change-job-synthetic.xlsx', (wb) => {
  const ws = wb.addWorksheet('Business Process Definition');
  ws.addRow([`Business Process Definition: ${P}`]);
  ws.addRow(['Effective Date', '01/01/2026']);
  ws.addRow([]);
  ws.addRow(HEADERS);
  STEPS.forEach((s) => ws.addRow(stepRow(s)));
  const n = wb.addWorksheet('Notifications');
  n.addRow(['Notification', 'Trigger', 'Recipients']);
  n.addRow(['Job change completed', 'Completion', 'Initiator\nManager']);
  wb.addWorksheet('Other').addRow(['Unrelated', 'Content']);
});

// 2. Same data, different header wording and column order, sheet named "Sheet1", rows shuffled.
await writeBook('change-job-renamed-headers.xlsx', (wb) => {
  const ws = wb.addWorksheet('Sheet1');
  const order = [3, 1, 6, 4, 2, 0, 5, 7, 8, 9, 10];
  const renamed = { If: 'Condition', Group: 'Security Groups', Type: 'Step Type', Specify: 'Task', 'Routing Restriction': 'Routing' };
  ws.addRow(order.map((i) => renamed[HEADERS[i]] ?? HEADERS[i]));
  const rows = STEPS.map(stepRow);
  const shuffled = [...rows.slice(9), ...rows.slice(0, 9)].reverse();
  shuffled.forEach((r) => ws.addRow(order.map((i) => r[i])));
});

// 3. Unknown layout: headers we cannot map automatically.
await writeBook('unknown-layout.xlsx', (wb) => {
  const ws = wb.addWorksheet('Export');
  ws.addRow(['Seq', 'Kind', 'What', 'Who', 'Optional']);
  ws.addRow(['a', 'Initiation', '', 'Initiator', '']);
  ws.addRow(['b', 'Approval', 'Approve', 'Manager', '']);
});

copyFileSync(join(out, 'change-job-synthetic.xlsx'), join(here, '..', '..', '..', 'apps', 'web', 'public', 'sample-change-job.xlsx'));
console.log('copied sample to apps/web/public/sample-change-job.xlsx');
