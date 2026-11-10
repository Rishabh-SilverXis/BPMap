/**
 * Right panel (Design System §8.1, §9.3). Tabs: Step (details + overlay edits, CUS-01), Health
 * (rules engine findings, HLT-01/02), Scenario (SCN-01..03) and Import report (IMP-05). Customise
 * lane names etc. arrives in Increment 2.2.
 */
import { useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { Finding } from '@bpmap/engine-rules';
import { MousePointerClick, TriangleAlert, Info, OctagonAlert, CircleCheck, Bell } from 'lucide-react';
import clsx from 'clsx';
import { KIND_LABEL } from '@bpmap/model';
import { stepTitle } from '@bpmap/scene';
import type { Diagram } from '../../app/derive.ts';
import { useStore, type PanelTab } from '../../store/store.ts';
import { ScenarioPanel } from './ScenarioPanel.tsx';
import { buildGraph } from '@bpmap/engine-graph';
import { conditionKey, findOrphans, orphanCount } from '../../store/overlay.ts';

const TABS: { id: PanelTab; label: string }[] = [
  { id: 'step', label: 'Step' },
  { id: 'scenario', label: 'Scenario' },
  { id: 'health', label: 'Health' },
  { id: 'report', label: 'Import' },
];

export function RightPanel({ diagram }: { diagram: Diagram }) {
  const panel = useStore((s) => s.panel);
  const setPanel = useStore((s) => s.setPanel);
  const warnings = diagram.def.warnings.length;
  // Badge counts open Critical + Warning findings only; Info findings are listed but don't shout (DEC-037).
  const openFindings = diagram.findings.filter((f) => f.severity !== 'info' && !diagram.overlay.dismissedFindings[f.fingerprint]).length;
  const base = useId();

  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = TABS.findIndex((t) => t.id === panel);
    const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]!;
    setPanel(next.id);
    document.getElementById(`${base}-${next.id}`)?.focus();
  };

  return (
    <aside className="flex h-full w-[360px] shrink-0 flex-col border-l border-border bg-surface" aria-label="Details">
      <div role="tablist" aria-label="Panels" className="flex gap-1 border-b border-border px-3" onKeyDown={onKey}>
        {TABS.map((t) => (
          <button
            key={t.id}
            id={`${base}-${t.id}`}
            role="tab"
            aria-selected={panel === t.id}
            aria-controls={`${base}-${t.id}-panel`}
            tabIndex={panel === t.id ? 0 : -1}
            onClick={() => setPanel(t.id)}
            className={clsx('-mb-px border-b-2 px-2 py-2.5 text-sm font-medium', panel === t.id ? 'border-accent text-text' : 'border-transparent text-text-secondary hover:text-text')}
          >
            {t.label}
            {t.id === 'scenario' && diagram.outcome.answeredCount > 0 && <span className="ml-1.5 rounded-full bg-[#E9F7F4] px-1.5 text-[11px] font-bold text-[#0B6E63]">{diagram.outcome.answeredCount}</span>}
            {t.id === 'health' && openFindings > 0 && <span className="ml-1.5 rounded-full bg-[#FEF3C7] px-1.5 text-[11px] font-bold text-[#92400E]">{openFindings}</span>}
            {t.id === 'report' && warnings > 0 && <span className="ml-1.5 rounded-full bg-[#FEF3C7] px-1.5 text-[11px] font-bold text-[#92400E]">{warnings}</span>}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${base}-${panel}-panel`} aria-labelledby={`${base}-${panel}`} className="flex-1 overflow-auto p-4">
        {panel === 'step' ? <StepPanel diagram={diagram} /> : panel === 'scenario' ? <ScenarioPanel diagram={diagram} /> : panel === 'health' ? <HealthPanel diagram={diagram} /> : <ReportPanel diagram={diagram} />}
      </div>
    </aside>
  );
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2 py-1 text-[13px]">
      <dt className="text-text-muted">{k}</dt>
      <dd className="text-text">{children}</dd>
    </div>
  );
}

function StepPanel({ diagram }: { diagram: Diagram }) {
  const selectedId = useStore((s) => s.selectedStepId);
  const { setLabel, setNote, setHidden } = useStore.getState();
  const step = selectedId ? diagram.def.steps.find((s) => s.id === selectedId) : undefined;
  const hiddenSteps = diagram.def.steps.filter((s) => diagram.overlay.hidden.includes(s.id));

  if (!step) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-text-secondary">
          <MousePointerClick className="h-5 w-5 text-text-muted" aria-hidden />
          Select a step to see its details and customise it.
        </div>
        {hiddenSteps.length > 0 && <HiddenList ids={hiddenSteps.map((s) => s.id)} diagram={diagram} />}
      </div>
    );
  }
  const conds = step.conditionIds.map((id) => diagram.def.conditions.find((c) => c.id === id)!).filter(Boolean);
  const stepNotifications = diagram.def.notifications.filter((n) => n.stepId === step.id);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">
          {KIND_LABEL[step.kind]} · step {step.order}
        </p>
        <h2 className="mt-1 text-base font-semibold">{stepTitle(step, diagram.overlay.labels[step.id])}</h2>
      </div>
      <dl>
        <Row k="Order">{step.order}</Row>
        <Row k="Type">{step.rawType || KIND_LABEL[step.kind]}</Row>
        {step.task && <Row k="Workday task">{step.task}</Row>}
        {step.kind === 'initiation' && !step.groups.length ? (
          <Row k="Who can start">{diagram.def.initiatingGroups.length ? diagram.def.initiatingGroups.join(', ') : <span className="text-text-muted">Not in the export</span>}</Row>
        ) : (
          <Row k="Security group">{step.groups.length ? step.groups[0] : <span className="text-text-muted">Workday (automatic)</span>}</Row>
        )}
        <Row k="Optional">{step.optional ? 'Yes' : 'No'}</Row>
        {step.dueDate && <Row k="Due">{step.dueDate}</Row>}
        {step.alternate && <Row k="Alternate">{step.alternate}</Row>}
        {step.routing && <Row k="Routing">{step.routing}</Row>}
        {step.restriction && <Row k="Restriction">{step.restriction}</Row>}
        {step.dueOnEffectiveDate && <Row k="Due based on">Effective date</Row>}
        {step.runAs && <Row k="Run as">{step.runAs}</Row>}
        {step.doNotAdvance && <Row k="Advance">Does not advance automatically</Row>}
        {step.groups.length > 1 && <Row k="Also">{step.groups.slice(1).join(', ')}</Row>}
        {step.additionalInfo && <Row k="Other settings">{step.additionalInfo}</Row>}
        {step.complete && <Row k="Completion">Process is complete after this step</Row>}
      </dl>
      {step.validations.length > 0 && (
        <section>
          <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">Validations ({step.validations.length})</h3>
          <ul className="mt-2 flex flex-col gap-1.5 text-[13px]">
            {step.validations.map((v, i) => (
              <li key={i} className="flex gap-2">
                <span className={clsx('h-fit rounded-full px-1.5 text-[10px] font-bold uppercase', v.severity === 'critical' ? 'bg-[#FEE2E2] text-[#991B1B]' : 'bg-[#FEF3C7] text-[#92400E]')}>{v.severity}</span>
                <span>{v.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {stepNotifications.length > 0 && (
        <section>
          <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">Notifications ({stepNotifications.length})</h3>
          <ul className="mt-2 flex flex-col gap-1.5 text-[13px]">
            {stepNotifications.map((n) => (
              <li key={n.id} className="flex gap-2">
                <Bell className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden />
                <span>
                  {n.kind === 'custom' ? n.name : `Assignment notification to ${n.recipients.join(', ') || 'the assignee'}`}
                  {n.condition && <span className="block text-xs text-text-muted">only if {n.condition}</span>}
                  {n.disabled && <span className="block text-xs text-warning">Disabled</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {conds.length > 0 && (
        <section>
          <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">Runs only if</h3>
          <ul className="mt-2 flex flex-col gap-2">
            {conds.map((c) => (
              <li key={c.id} className="flex gap-2 text-[13px]">
                <span className="h-fit rounded-full border border-conditional bg-conditional-subtle px-1.5 font-mono text-[10px] font-bold text-on-conditional-subtle">{c.id}</span>
                <span>
                  {diagram.conditionText[c.id] ?? c.text}
                  {diagram.conditionText[c.id] && <span className="block text-xs text-text-secondary">Workday: {c.text}</span>}
                  <span className="block text-xs text-text-muted">{c.workdayOwned ? 'Workday owned' : 'Custom: re-check after each Workday release'}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="flex flex-col gap-3 border-t border-border pt-4">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">Customise (kept when you re-import)</h3>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Label in the flow</span>
          <input
            value={diagram.overlay.labels[step.id] ?? ''}
            placeholder={stepTitle(step)}
            onChange={(e) => setLabel(step.id, e.target.value)}
            className="h-8 rounded-[var(--radius-sm)] border border-border-strong bg-surface px-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Note (shows as N on the step)</span>
          <textarea
            rows={3}
            value={diagram.overlay.notes[step.id] ?? ''}
            onChange={(e) => setNote(step.id, e.target.value)}
            className="rounded-[var(--radius-sm)] border border-border-strong bg-surface px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={diagram.overlay.hidden.includes(step.id)} onChange={(e) => setHidden(step.id, e.target.checked)} />
          Hide this step from the flow
        </label>
      </section>
    </div>
  );
}

function HiddenList({ ids, diagram }: { ids: string[]; diagram: Diagram }) {
  const setHidden = useStore((s) => s.setHidden);
  return (
    <section className="rounded-[var(--radius-md)] border border-border p-3">
      <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">Hidden steps</h3>
      <ul className="mt-2 flex flex-col gap-1.5 text-[13px]">
        {ids.map((id) => {
          const s = diagram.def.steps.find((x) => x.id === id)!;
          return (
            <li key={id} className="flex items-center justify-between gap-2">
              <span>
                {s.order} · {stepTitle(s, diagram.overlay.labels[id])}
              </span>
              <button type="button" onClick={() => setHidden(id, false)} className="text-xs font-semibold text-action hover:underline">
                Show
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ReportPanel({ diagram }: { diagram: Diagram }) {
  const report = useStore((s) => s.reports[diagram.def.id]);
  const select = useStore((s) => s.select);
  const w = diagram.def.warnings;
  return (
    <div className="flex flex-col gap-4 text-[13px]">
      <OrphanNotice diagram={diagram} />
      {report ? (
        <dl>
          <Row k="File">{report.fileName}</Row>
          <Row k="Rows read">{report.stats.rowsRead}</Row>
          <Row k="Steps">
            {report.stats.steps} in {report.stats.stages} stages ({report.stats.parallelStages} parallel)
          </Row>
          <Row k="Conditions">
            {report.stats.conditions} on {report.stats.conditionalSteps} steps
          </Row>
          <Row k="Groups">{report.stats.securityGroups}</Row>
          <Row k="Notifications">{diagram.def.notifications.length}</Row>
          <Row k="Columns">{report.mappingSource === 'auto' ? 'Matched automatically' : report.mappingSource === 'profile' ? 'Saved mapping' : 'Mapped by you'}</Row>
          <Row k="Sheets">
            <ul>
              {report.sheets.map((s) => (
                <li key={s.name}>
                  {s.name}:{' '}
                  <span className="text-text-muted">
                    {s.role === 'steps' ? 'steps' : s.role === 'notifications' ? 'notifications' : s.role === 'other' ? 'recognised, used in a later phase' : 'not used'}
                  </span>
                </li>
              ))}
            </ul>
          </Row>
        </dl>
      ) : (
        <p className="text-text-secondary">Loaded from a project file. The original import report isn’t available.</p>
      )}
      <DefinitionSettings diagram={diagram} />
      <section>
        <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">Warnings</h3>
        {w.length === 0 ? (
          <p className="mt-2 flex items-center gap-2 text-text-secondary">
            <Info className="h-4 w-4" aria-hidden /> No warnings. Every row was understood.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {w.map((x, i) => (
              <li key={i} className="flex gap-2 rounded-[var(--radius-sm)] border-l-4 border-warning bg-surface-sunken p-2">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
                <div>
                  <p>{x.message}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-text-muted">
                    {x.code}
                    {x.row ? ` · row ${x.row}` : ''}
                  </p>
                  {x.stepId && (
                    <button type="button" onClick={() => select(x.stepId!)} className="mt-1 text-xs font-semibold text-action hover:underline">
                      Show step
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function DefinitionSettings({ diagram }: { diagram: Diagram }) {
  const { meta, initiatingGroups, notifications } = diagram.def;
  const custom = notifications.filter((n) => n.kind === 'custom');
  if (!meta.effectiveDate && !meta.dueDate && !initiatingGroups.length && !custom.length) return null;
  return (
    <section>
      <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">Definition settings</h3>
      <dl className="mt-1">
        {meta.effectiveDate && <Row k="Effective">{meta.effectiveDate}</Row>}
        {meta.dueDate && <Row k="Overall due">{meta.dueDate}</Row>}
        {meta.autocomplete !== undefined && <Row k="Autocomplete">{meta.autocomplete ? 'Enabled' : 'Off'}</Row>}
        {initiatingGroups.length > 0 && <Row k="Who can start">{initiatingGroups.join(', ')}</Row>}
      </dl>
      {custom.length > 0 && (
        <>
          <h3 className="mt-3 text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">Custom notifications ({custom.length})</h3>
          <ul className="mt-2 flex flex-col gap-2">
            {custom.map((n) => (
              <li key={n.id} className="rounded-[var(--radius-sm)] bg-surface-sunken p-2">
                <p className="font-medium">
                  {n.name}
                  {n.disabled && <span className="ml-1 text-xs font-normal text-warning">(disabled)</span>}
                </p>
                <p className="text-xs text-text-muted">
                  {n.trigger}
                  {n.condition ? ` · only if ${n.condition}` : ''} · to {n.recipients.join(', ') || '—'}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** Health findings (Design System §9.7, HLT-01/02). Severity = coloured rule + icon + label, never colour alone. */
function HealthPanel({ diagram }: { diagram: Diagram }) {
  const dismissed = diagram.overlay.dismissedFindings;
  const active = diagram.findings.filter((f) => !dismissed[f.fingerprint]);
  const gone = diagram.findings.filter((f) => dismissed[f.fingerprint]);
  const restore = useStore((s) => s.restoreFinding);
  const groups = new Map<string, Finding[]>();
  for (const f of active) groups.set(f.ruleId, [...(groups.get(f.ruleId) ?? []), f]);

  return (
    <div className="flex flex-col gap-3 text-[13px]">
      {active.length === 0 && (
        <p className="flex items-center gap-2 py-4 text-text-secondary">
          <CircleCheck className="h-4 w-4 text-success" aria-hidden /> No open issues from the current checks.
        </p>
      )}
      {[...groups.entries()].map(([ruleId, fs]) => (
        <details key={ruleId} open={fs.length <= 3} className="rounded-[var(--radius-md)] border border-border">
          <summary className="flex cursor-pointer items-center gap-2 px-3 py-2">
            <SeverityIcon severity={fs[0]!.severity} />
            <span className="font-semibold">{fs[0]!.title}</span>
            <span className="ml-auto rounded-full bg-surface-sunken px-1.5 text-xs font-bold">{fs.length}</span>
          </summary>
          <ul className="flex flex-col gap-2 px-3 pb-3">
            {fs.map((f) => (
              <FindingCard key={f.fingerprint} f={f} />
            ))}
          </ul>
        </details>
      ))}
      {gone.length > 0 && (
        <details className="rounded-[var(--radius-md)] border border-dashed border-border">
          <summary className="cursor-pointer px-3 py-2 text-text-secondary">Dismissed ({gone.length})</summary>
          <ul className="flex flex-col gap-2 px-3 pb-3">
            {gone.map((f) => (
              <li key={f.fingerprint} className="text-xs text-text-secondary">
                <span className="font-semibold">{f.ruleId}</span> · {f.message}
                <span className="mt-0.5 block italic">Reason: {dismissed[f.fingerprint]!.reason}</span>
                <button type="button" onClick={() => restore(f.fingerprint)} className="mt-1 font-semibold text-action hover:underline">
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="text-xs text-text-muted">Checks run on the whole definition, not the current scenario. Dismissals are kept when you re-import.</p>
    </div>
  );
}

function SeverityIcon({ severity }: { severity: Finding['severity'] }) {
  if (severity === 'critical') return <OctagonAlert className="h-4 w-4 shrink-0 text-danger" aria-label="Critical" />;
  if (severity === 'warning') return <TriangleAlert className="h-4 w-4 shrink-0 text-warning" aria-label="Warning" />;
  return <Info className="h-4 w-4 shrink-0 text-info" aria-label="Info" />;
}

function FindingCard({ f }: { f: Finding }) {
  const select = useStore((s) => s.select);
  const dismiss = useStore((s) => s.dismissFinding);
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');
  return (
    <li className={clsx('rounded-[var(--radius-sm)] border-l-4 bg-surface-sunken p-2.5', f.severity === 'critical' ? 'border-l-danger' : f.severity === 'warning' ? 'border-l-warning' : 'border-l-info')}>
      <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-text-muted">
        {f.severity} · {f.ruleId}
      </p>
      <p className="mt-1">{f.message}</p>
      {f.suggestedFix && <p className="mt-1 text-text-secondary">Suggested fix: {f.suggestedFix}</p>}
      {asking ? (
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            dismiss(f.fingerprint, reason);
          }}
        >
          <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this OK?" aria-label="Reason for dismissing" className="h-7 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-border-strong bg-surface px-2 text-xs" />
          <button type="submit" className="rounded-[var(--radius-sm)] bg-action px-2 text-xs font-semibold text-on-action">
            Dismiss
          </button>
          <button type="button" onClick={() => setAsking(false)} className="text-xs text-text-muted">
            Cancel
          </button>
        </form>
      ) : (
        <div className="mt-2 flex gap-3">
          <button type="button" onClick={() => select(f.stepIds[0]!)} className="text-xs font-semibold text-action hover:underline">
            Show step
          </button>
          <button type="button" onClick={() => setAsking(true)} className="text-xs font-semibold text-text-secondary hover:underline">
            Dismiss…
          </button>
        </div>
      )}
    </li>
  );
}

/** IMP-06: customisations whose step or lane is no longer in the export (after a re-import). */
function OrphanNotice({ diagram }: { diagram: Diagram }) {
  const removeOrphans = useStore((s) => s.removeOrphans);
  const { def, overlay } = diagram;
  const orphans = findOrphans(overlay, new Set(def.steps.map((s) => s.id)), new Set(buildGraph(def).lanes.map((l) => l.id)), new Set(def.conditions.map((c) => conditionKey(c.text))));
  const n = orphanCount(orphans);
  if (!n) return null;
  const items = [
    ...orphans.labels.map((k) => `Label "${overlay.labels[k]}" on ${k}`),
    ...orphans.notes.map((k) => `Note "${overlay.notes[k]}" on ${k}`),
    ...orphans.hidden.map((k) => `Hidden step ${k}`),
    ...orphans.laneNames.map((k) => `Lane name "${overlay.laneNames[k]}" for ${k}`),
    ...orphans.conditionText.map((k) => `Plain words "${overlay.conditionText[k]}" for the condition "${k}"`),
  ];
  return (
    <section role="status" className="rounded-[var(--radius-md)] border border-warning/50 bg-surface-sunken p-3" data-testid="orphans">
      <h3 className="flex items-center gap-1.5 font-semibold">
        <TriangleAlert className="h-4 w-4 text-warning" aria-hidden /> {n} customisation{n === 1 ? '' : 's'} no longer match a step
      </h3>
      <p className="mt-1 text-text-secondary">The latest export doesn’t contain these steps, lanes or conditions any more (they were renamed, moved to another order letter or removed). They are kept until you decide.</p>
      <ul className="mt-2 list-disc pl-5 text-xs text-text-secondary">
        {items.map((t) => (
          <li key={t} className="break-all">
            {t}
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => removeOrphans(orphans)} className="mt-2 text-xs font-semibold text-action hover:underline">
        Remove {n === 1 ? 'it' : `all ${n}`} (undo is available)
      </button>
    </section>
  );
}
