/**
 * Right panel (Design System §8.1, §9.3). Increment 1 tabs: Step (details + overlay edits,
 * CUS-01) and Import report (IMP-05). Health, Scenario and Customise arrive in Phase 2 (DEC-021).
 */
import { useId, type KeyboardEvent, type ReactNode } from 'react';
import { MousePointerClick, TriangleAlert, Info } from 'lucide-react';
import clsx from 'clsx';
import { KIND_LABEL } from '@bpmap/model';
import { stepTitle } from '@bpmap/scene';
import type { Diagram } from '../../app/derive.ts';
import { useStore, type PanelTab } from '../../store/store.ts';

const TABS: { id: PanelTab; label: string }[] = [
  { id: 'step', label: 'Step' },
  { id: 'report', label: 'Import report' },
];

export function RightPanel({ diagram }: { diagram: Diagram }) {
  const panel = useStore((s) => s.panel);
  const setPanel = useStore((s) => s.setPanel);
  const warnings = diagram.def.warnings.length;
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
            {t.id === 'report' && warnings > 0 && <span className="ml-1.5 rounded-full bg-[#FEF3C7] px-1.5 text-[11px] font-bold text-[#92400E]">{warnings}</span>}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${base}-${panel}-panel`} aria-labelledby={`${base}-${panel}`} className="flex-1 overflow-auto p-4">
        {panel === 'step' ? <StepPanel diagram={diagram} /> : <ReportPanel diagram={diagram} />}
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
        <Row k="Security group">{step.groups.length ? step.groups.join(', ') : <span className="text-text-muted">System</span>}</Row>
        <Row k="Optional">{step.optional ? 'Yes' : 'No'}</Row>
        {step.dueDate && <Row k="Due">{step.dueDate}</Row>}
        {step.alternate && <Row k="Alternate">{step.alternate}</Row>}
        {step.routing && <Row k="Routing">{step.routing}</Row>}
        {step.restriction && <Row k="Restriction">{step.restriction}</Row>}
        {step.complete && <Row k="Completion">Process is complete after this step</Row>}
      </dl>
      {conds.length > 0 && (
        <section>
          <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">Runs only if</h3>
          <ul className="mt-2 flex flex-col gap-2">
            {conds.map((c) => (
              <li key={c.id} className="flex gap-2 text-[13px]">
                <span className="h-fit rounded-full border border-conditional bg-conditional-subtle px-1.5 font-mono text-[10px] font-bold text-on-conditional-subtle">{c.id}</span>
                <span>
                  {c.text}
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
          <Row k="Columns">{report.mappingSource === 'auto' ? 'Matched automatically' : report.mappingSource === 'profile' ? 'Saved mapping' : 'Mapped by you'}</Row>
          <Row k="Sheets">
            <ul>
              {report.sheets.map((s) => (
                <li key={s.name}>
                  {s.name}:{' '}
                  <span className="text-text-muted">
                    {s.role === 'steps' ? 'steps' : s.role === 'notifications' ? 'notifications (shown from Phase 2)' : 'not used'}
                  </span>
                </li>
              ))}
            </ul>
          </Row>
        </dl>
      ) : (
        <p className="text-text-secondary">Loaded from a project file. The original import report isn’t available.</p>
      )}
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
