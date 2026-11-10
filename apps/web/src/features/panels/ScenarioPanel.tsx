/**
 * Scenario panel (SCN-01..03, Design System §9.5). Answer conditions for one case; skipped steps
 * disappear and empty lanes/stages collapse. "No" is a valid answer, so it is never styled red (D-08).
 */
import { useState } from 'react';
import clsx from 'clsx';
import { RotateCcw, Save, Trash2 } from 'lucide-react';
import type { Answer } from '@bpmap/engine-scenario';
import type { Diagram } from '../../app/derive.ts';
import { useStore } from '../../store/store.ts';
import { conditionKey } from '../../store/overlay.ts';

const ANSWERS: { id: Answer; label: string }[] = [
  { id: 'unset', label: 'Not set' },
  { id: 'yes', label: 'Yes' },
  { id: 'no', label: 'No' },
];

export function ScenarioPanel({ diagram }: { diagram: Diagram }) {
  const { setAnswer, toggleDecision, resetScenario, savePreset, applyPreset, deletePreset, setConditionText } = useStore.getState();
  const [presetName, setPresetName] = useState('');
  const { def, scenario, outcome } = diagram;
  const orderOf = new Map(def.steps.map((s) => [s.id, s.order]));

  return (
    <div className="flex flex-col gap-4 text-[13px]">
      <p className="text-text-secondary">
        Answer the conditions for one case, for example a promotion in a works-council country. Steps that won’t run disappear, so you see the real path.
      </p>

      <div className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] bg-surface-sunken p-3">
        <span aria-live="polite">
          {outcome.answeredCount ? (
            <>
              <strong>{outcome.answeredCount}</strong> answered · <strong>{outcome.skipped.size}</strong> step{outcome.skipped.size === 1 ? '' : 's'} won’t run
            </>
          ) : (
            'No answers yet: every step is shown.'
          )}
        </span>
        <button type="button" onClick={resetScenario} disabled={!outcome.answeredCount} className="flex items-center gap-1 text-xs font-semibold text-action disabled:opacity-40">
          <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Reset
        </button>
      </div>

      <section aria-labelledby="presets-h">
        <h3 id="presets-h" className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">
          Saved scenarios
        </h3>
        {scenario.presets.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1">
            {scenario.presets.map((p) => (
              <li key={p.id} className="flex items-center gap-2">
                <button type="button" onClick={() => applyPreset(p.id)} className="flex-1 truncate rounded-[var(--radius-sm)] px-2 py-1 text-left hover:bg-surface-sunken" title={`Apply “${p.name}”`}>
                  {p.name} <span className="text-xs text-text-muted">· {Object.keys(p.answers).length} answers</span>
                </button>
                <button type="button" onClick={() => deletePreset(p.id)} aria-label={`Delete scenario ${p.name}`} className="rounded p-1 text-text-muted hover:bg-surface-sunken">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            savePreset(presetName);
            setPresetName('');
          }}
        >
          <input
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder="e.g. Promotion · Netherlands"
            aria-label="Scenario name"
            className="h-8 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-border-strong bg-surface px-2 text-sm"
          />
          <button type="submit" disabled={!outcome.answeredCount} className="flex h-8 items-center gap-1 rounded-[var(--radius-sm)] border border-border-strong px-2 text-xs font-semibold disabled:opacity-40">
            <Save className="h-3.5 w-3.5" aria-hidden /> Save
          </button>
        </form>
      </section>

      <section aria-labelledby="conds-h" className="flex flex-col gap-3">
        <h3 id="conds-h" className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">
          Conditions ({def.conditions.length})
        </h3>
        {def.conditions.map((c) => {
          const value = scenario.answers[c.id] ?? 'unset';
          const steps = [...new Set(c.stepIds.map((id) => orderOf.get(id)))].join(', ');
          return (
            <div key={c.id} className="rounded-[var(--radius-md)] border border-border p-3">
              <p className="flex items-center gap-2 text-xs text-text-muted">
                <span className="rounded-full border border-conditional bg-conditional-subtle px-1.5 font-mono text-[10px] font-bold text-on-conditional-subtle">{c.id}</span>
                {c.workdayOwned ? 'Workday owned' : 'Custom'} · step {steps}
              </p>
              {diagram.conditionText[c.id] ? (
                <>
                  <p className="mt-1.5 font-medium">{diagram.conditionText[c.id]}</p>
                  <p className="mt-0.5 text-xs text-text-secondary">Workday: {c.text}</p>
                </>
              ) : (
                <p className="mt-1.5">{c.text}</p>
              )}
              <label className="mt-2 flex flex-col gap-1 text-xs text-text-secondary">
                In plain words (kept when you re-import)
                <input
                  type="text"
                  value={diagram.overlay.conditionText[conditionKey(c.text)] ?? ''}
                  onChange={(e) => setConditionText(conditionKey(c.text), e.target.value)}
                  placeholder="e.g. Transfer was requested"
                  maxLength={160}
                  aria-label={`Plain words for ${c.id}`}
                  className="h-8 rounded-[var(--radius-sm)] border border-border-strong bg-surface px-2 text-[13px] text-text"
                />
              </label>
              <div role="radiogroup" aria-label={`Answer for ${c.id}`} className="mt-2 inline-flex rounded-[var(--radius-sm)] border border-border-strong p-0.5">
                {ANSWERS.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    role="radio"
                    aria-checked={value === a.id}
                    onClick={() => setAnswer(c.id, a.id)}
                    className={clsx(
                      'rounded-[4px] px-2.5 py-0.5 text-xs font-medium',
                      value === a.id ? (a.id === 'yes' ? 'bg-success text-white' : a.id === 'no' ? 'bg-primary text-on-primary' : 'bg-surface-sunken text-text') : 'text-text-secondary hover:bg-surface-sunken',
                    )}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
              <label className="mt-2 flex items-center gap-2 text-xs text-text-secondary">
                <input type="checkbox" checked={scenario.decisions.includes(c.id)} onChange={() => toggleDecision(c.id)} />
                Show as a yes/no decision on every step it guards
              </label>
            </div>
          );
        })}
      </section>
    </div>
  );
}
