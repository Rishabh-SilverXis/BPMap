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

// 4. ANONYMISED mirror of a real "Edit Business Process Definition" export (DEC-030).
//    Same sheets, title rows, 17 step columns, preamble rows, and the literal "&#xa;" line-break
//    encoding Workday writes inside cells. Order values match the real file (a, ba…bd, d, e, …),
//    which is what proves alphabetical stage order. Condition, group and company wording is invented.
{
  const BR = '&#xa;'; // Workday writes line breaks as this literal text
  const LIST = BR + BR; // list items are separated by two of them
  const P2 = 'Change Job (Default Definition)';
  const preamble = (ws) => {
    ws.addRow([`Edit Business Process Definition: ${P2}`]);
    ws.addRow(['Effective Date', 46336]);
    ws.addRow(['Most Recent Used Date', 46315]);
    ws.addRow(['Due Date', '1 Week']);
    ws.addRow(['Enable Autocomplete', 'Yes']);
    ws.addRow(['Security Group Restrictions']);
    ws.addRow(['Initiating Security Groups', ['HR Partner', 'Manager', 'HR Administrator', 'Management Chain'].join(LIST)]);
  };
  const WD = ' (Workday Owned)';
  const R = (o, type, specify, groups, conds, info = [], routing = '', due = '', complete = '', validation = []) => ({ o, type, specify, groups, conds, info, routing, due, complete, validation });
  const NOT_APP = 'Not initiated from a job application?';
  const REASON = 'Job change reason needs approval?';
  const PAY10 = 'Proposed pay change above 10%?';
  const HQ = 'Worker outside head office cost centre?';
  const RESTRICT = 'Restriction: Initiator, Approvers, Subject';
  const ROWS = [
    R('a', 'Initiation', '', [], [], [], '', '', '', ['Job category must match the staffing model (Critical)', 'Work shift is required for hourly workers (Critical)', 'Location must allow the selected shift (Warning)']),
    R('ba', 'Action', 'Review: Current Manager', ['HR Partner'], ['Initiated from the transfer request task?' + WD], [RESTRICT], 'Current', '2 Days'),
    R('bb', 'Action', 'Review: Receiving Manager', ['HR Partner'], ['Initiator differs from the processing user?' + WD], [RESTRICT, 'Alternate: HR Business Partner (relative to excluded)'], 'Proposed', '2 Days'),
    R('bc', 'Action', 'Review Change Job', ['HR Business Partner'], [PAY10], [RESTRICT, 'Alternate: HR Administrator (relative to excluded)'], 'Proposed'),
    R('bd', 'Action', 'Review Change Job', ['Compensation Administrator'], ['Compensation step needs review?']),
    R('d', 'Approval', '', ['Manager'], [REASON, NOT_APP], [RESTRICT, 'Alternate: Manager (relative to excluded)']),
    R('e', 'Approval', '', ['General Manager'], [REASON, NOT_APP, 'Proposed pay above current pay?', HQ], ['Restriction: Initiator']),
    R('f', 'Approval', '', ['Regional Director'], [NOT_APP, PAY10, HQ], ['Restriction: Initiator']),
    R('i', 'Approval', '', ['Chief HR Officer'], [NOT_APP, 'Pay rate type is not hourly?', 'Proposed pay change above 20%?'], ['Restriction: Subject', 'Alternate: Manager (relative to excluded)']),
    R('k', 'Action', 'Manage Union Membership', ['HR Partner'], ['Union location and union job profile?']),
    R('k1', 'To Do', 'Update Union Additional Data', ['HR Partner'], ['Location group A?']),
    R('k2', 'To Do', 'Update Regional Additional Data', ['HR Partner'], ['Location group B?']),
    R('m', 'Action', 'Change Organization Assignments', ['HR Partner'], ['No later organization events pending?' + WD], ['Restriction: Subject'], '', '2 Days'),
    R('n', 'Action', 'Propose Compensation Change', ['HR Partner'], ['Worker is an employee?' + WD], ['Restriction: Subject'], '', '2 Days'),
    R('o', 'Action', 'Assign Pay Group', ['Payroll Partner'], ['Primary job with no pending pay group change?' + WD, 'Company unchanged?'], ['Restriction: Subject'], '', '2 Days', 'Yes'),
    R('p', 'Service', 'Automated Accrual Adjustment', [], []),
    R('q', 'Action', 'Manage Business Processes for Worker', ['HR Partner'], ['Worker has cancelable events or delegations?' + WD, 'Employee is a manager?'], [], '', '2 Days'),
    R('r', 'Action', 'Assign Roles - Change Assignments for Worker', ['HR Administrator', 'HR Partner'], ['Direct labour job category?', 'Worker has role-based security assignments?'], ['Restriction: Subject']),
    R('r1', 'Action', 'Maintain Time Off Plan Transfer Balance', ['HR Partner'], ['Time off eligibility changes?' + WD]),
    R('r2', 'Action', 'Update Time Off Requests', ['HR Partner'], ['Time off requests exist?' + WD], [], 'Proposed'),
    R('s', 'Action', 'Create Subordinate', ['HR Administrator'], ['1=0?', 'Initiator is HR Administrator or EIB load?', 'Make new manager?'], ['Restriction: Subject']),
    R('s1', 'Action', 'Change Superior Organization', ['HR Administrator'], ['1 = 0?', 'Move manager team selected?' + WD], ['Restriction: Subject']),
    R('t', 'Action', 'Complete State and Local Withholding Elections', ['Employee As Self'], ['Country is not country X?', 'Withholding elections apply?']),
    R('t1', 'Action', 'Complete Province Tax Elections', ['Employee As Self'], ['Country is country X?']),
    R('u', 'To Do', 'Confirm Benefits Eligibility', ['Benefits Partner'], ['Pay rate type is salary?', 'Worker in an eligible employee group?']),
    R('v', 'Action', 'Change Benefit Elections', ['Employee As Self'], ['Change affects benefits?' + WD]),
  ];
  await writeBook('change-job-workday-layout.xlsx', (wb) => {
    const ws = wb.addWorksheet('Business Process Steps');
    preamble(ws);
    ws.addRow(['Business Process Steps']);
    ws.addRow(['Step', 'Order', 'If', 'Type', 'Specify', 'Optional', 'Group', 'Additional Information', 'Routing Modifier', 'All', 'Run As User', 'Validation', 'Due Date', 'Due Date Is Based On Effective Date', 'Do Not Advance', 'Complete', 'Subprocess Definitions']);
    for (const r of ROWS) {
      const label = `${P2} step ${r.o} - ${r.type}${r.type === 'Service' ? ` [${r.specify}]` : ''}`;
      ws.addRow([label, r.o, r.conds.join(LIST), r.type, r.specify, 'No', r.groups.join(LIST), r.info.join(BR), r.routing, '', '', r.validation.join(LIST), r.due, '', 'No', r.complete, '']);
    }
    const n = wb.addWorksheet('Notifications');
    preamble(n);
    n.addRow(['Notifications']);
    n.addRow(['System Notifications']);
    n.addRow(['Disabled', 'Manual Advance System Notification Disabled', 'Workflow Step', 'Order', 'Type', 'Specify', 'Group']);
    for (const r of ROWS.filter((x) => ['a', 'ba', 'd', 'u'].includes(x.o))) n.addRow(['No', 'No', `${P2} step ${r.o} - ${r.type}`, r.o, r.type, r.specify, r.groups.join(LIST)]);
    n.addRow(['Custom Notifications']);
    n.addRow(['Disabled', 'Notification', 'Business Process Condition', 'Recipients', 'Exclude Delegates in Notifications', 'Email Configuration', 'Reply To Email Address', 'Email Option', 'Trigger on Status / On Entry / On Exit / On Disposition', 'Subject', 'Body', 'Preview']);
    n.addRow(['No', 'Completed notifies Manager', '', 'Manager', 'No', '', '', 'Default', 'Trigger on Status : Completed', 'Status', '', '']);
    n.addRow(['No', 'Exit of a - Change Job notifies Manager', 'Initiator is not the manager?', 'Manager', 'No', '', '', 'Default', 'On Exit : a - Change Job', 'Submitted', '', '']);
    n.addRow(['Yes', 'Exit of o - Assign Pay Group notifies Payroll', 'Pay group country changed?', ['Payroll Partner', 'Payroll Partner Region'].join(LIST), 'No', '', '', 'Default', 'On Exit : o - Assign Pay Group', 'Pay group changed', '', '']);
    const a = wb.addWorksheet('Allowed Actions by Role');
    preamble(a);
    a.addRow(['Allowed Actions by Role']);
    a.addRow(['Action', 'Mandatory Entry Condition', 'Can be performed by', 'Business Process']);
    a.addRow(['Assign Pay Group', 'Primary job with no pending pay group change?' + WD, ['HR Partner', 'Payroll Partner'].join(LIST), 'Assign Pay Group (Default Definition)']);
    const f = wb.addWorksheet('Available Rules & Fields');
    preamble(f);
    f.addRow(['Available Rules & Fields']);
    // Long data cell mentioning "notification" and "recipient": must NOT make this a notifications sheet.
    f.addRow(['Available Fields', ['Notification Recipient Count', 'Send Date', 'Trigger Status'].join(LIST)]);
  });
}

copyFileSync(join(out, 'change-job-synthetic.xlsx'), join(here, '..', '..', '..', 'apps', 'web', 'public', 'sample-change-job.xlsx'));
console.log('copied sample to apps/web/public/sample-change-job.xlsx');
