/**
 * Accessible step list (NFR-A11Y, DS §14.1): the same process as a real <table>, grouped by stage,
 * in Workday order, honouring the current scenario and customisations. Works with screen readers,
 * keyboard, zoom and copy-paste; also handy for checking a definition line by line.
 */
import { KIND_LABEL } from '@bpmap/model';
import { stepTitle } from '@bpmap/scene';
import type { Diagram } from '../../app/derive.ts';
import { useStore } from '../../store/store.ts';

export function StepList({ diagram }: { diagram: Diagram }) {
  const select = useStore((s) => s.select);
  const selected = useStore((s) => s.selectedStepId);
  const { graph, def, overlay, outcome } = diagram;
  const laneLabel = new Map(graph.lanes.map((l) => [l.id, l.label]));
  const condText = new Map(def.conditions.map((c) => [c.id, c.text]));
  const total = Object.keys(graph.steps).length;

  return (
    <div className="h-full overflow-auto bg-surface p-4" role="region" aria-label="Step list">
      <table className="w-full border-collapse text-[13px]">
        <caption className="mb-3 text-left">
          <span className="text-base font-semibold">{def.variant ? `${def.process} (${def.variant})` : def.process}</span>
          <span className="ml-2 text-text-secondary">
            {total} steps in {graph.stages.length} stages{outcome.summary ? ` · ${outcome.summary} (${outcome.skipped.size} skipped)` : ''}
          </span>
        </caption>
        <thead className="sticky top-0 bg-surface text-left text-[11px] uppercase tracking-[0.06em] text-text-muted">
          <tr>
            <th scope="col" className="border-b border-border px-2 py-2">Stage</th>
            <th scope="col" className="border-b border-border px-2 py-2">Step</th>
            <th scope="col" className="border-b border-border px-2 py-2">Type</th>
            <th scope="col" className="border-b border-border px-2 py-2">Who</th>
            <th scope="col" className="border-b border-border px-2 py-2">Runs only if</th>
            <th scope="col" className="border-b border-border px-2 py-2">Due</th>
          </tr>
        </thead>
        {graph.stages.map((st, si) => (
          <tbody key={st.key} className="border-b-2 border-border">
            {st.stepIds.map((id, i) => {
              const gs = graph.steps[id]!;
              const s = gs.step;
              return (
                <tr key={id} className={selected === id ? 'bg-[#EEF2FA] dark:bg-surface-sunken' : 'hover:bg-surface-sunken'}>
                  {i === 0 && (
                    <th scope="rowgroup" rowSpan={st.stepIds.length} className="border-b border-border px-2 py-2 text-left align-top font-semibold">
                      {si + 1} · {st.order}
                      {st.parallel && <span className="block text-xs font-normal text-text-muted">{st.stepIds.length} in parallel</span>}
                    </th>
                  )}
                  <td className="border-b border-border px-2 py-2">
                    <button type="button" onClick={() => select(id)} className="text-left font-medium text-action hover:underline" aria-pressed={selected === id}>
                      {stepTitle(s, overlay.labels[id])}
                    </button>
                    {s.complete && <span className="ml-2 text-xs font-semibold text-success">Process complete after this step</span>}
                    {overlay.notes[id] && <span className="block text-xs text-text-muted">Note: {overlay.notes[id]}</span>}
                  </td>
                  <td className="border-b border-border px-2 py-2">{KIND_LABEL[s.kind]}{s.optional ? ' (optional)' : ''}</td>
                  <td className="border-b border-border px-2 py-2">{laneLabel.get(gs.laneId)}{s.groups.length > 1 ? `, also ${s.groups.slice(1).join(', ')}` : ''}</td>
                  <td className="border-b border-border px-2 py-2">
                    {gs.openConditionIds.length ? (
                      <ul className="flex flex-col gap-0.5">
                        {gs.openConditionIds.map((c) => (
                          <li key={c}>
                            <span className="font-mono text-[11px] font-bold text-on-conditional-subtle">{c}</span> {condText.get(c)}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-text-muted">Always</span>
                    )}
                  </td>
                  <td className="border-b border-border px-2 py-2">{s.dueDate ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
    </div>
  );
}
