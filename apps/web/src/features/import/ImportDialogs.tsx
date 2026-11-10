/**
 * Import feedback: the column-mapping dialog (IMP-03) and the import error alert.
 * Native <dialog> gives focus trapping and Esc handling (Design System §9.10).
 */
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { FIELDS, REQUIRED_FIELDS, type ColumnMap, type Field } from '@bpmap/importer-xlsx';
import { useStore } from '../../store/store.ts';

const FIELD_LABEL: Record<Field, string> = {
  step: 'Step label',
  order: 'Order (a, b, c…)',
  condition: 'Condition (If)',
  rawType: 'Step type',
  task: 'Task (Specify)',
  optional: 'Optional',
  groups: 'Security group',
  dueDate: 'Due date',
  alternate: 'Alternate',
  routing: 'Routing',
  restriction: 'Restriction',
  runAs: 'Run as named user',
  allMustAct: 'All must act',
  complete: 'Process complete',
};

export function MappingDialog() {
  const st = useStore((s) => s.importState);
  const applyMapping = useStore((s) => s.applyMapping);
  const dismiss = useStore((s) => s.dismissImportError);
  const ref = useRef<HTMLDialogElement>(null);
  const open = st.status === 'needs-mapping';
  const [map, setMap] = useState<ColumnMap>({});

  useEffect(() => {
    if (open) {
      setMap(st.outcome.suggested);
      if (!ref.current?.open) ref.current?.showModal();
    } else if (ref.current?.open) ref.current.close();
  }, [open, st]);

  if (!open) return <dialog ref={ref} />;
  const missing = REQUIRED_FIELDS.filter((f) => map[f] === undefined);

  return (
    <dialog ref={ref} onCancel={dismiss} aria-labelledby="map-title" className="m-auto w-[min(640px,92vw)] rounded-[var(--radius-lg)] bg-surface p-0 text-text shadow-[var(--shadow-e4)] backdrop:bg-black/40">
      <div className="flex items-start justify-between border-b border-border p-5">
        <div>
          <h2 id="map-title" className="text-lg font-semibold">
            Match the columns once
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            We couldn’t match {st.outcome.missing.length} required column{st.outcome.missing.length === 1 ? '' : 's'} in “{st.fileName}” (sheet {st.outcome.sheet}). Pick them below and we’ll remember this layout.
          </p>
        </div>
        <button type="button" onClick={dismiss} aria-label="Cancel import" className="rounded p-1 text-text-muted hover:bg-surface-sunken">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="grid max-h-[55vh] grid-cols-1 gap-3 overflow-auto p-5 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <label key={f} className="flex flex-col gap-1 text-sm">
            <span className="font-medium">
              {FIELD_LABEL[f]}
              {REQUIRED_FIELDS.includes(f) && <span className="text-danger"> *</span>}
            </span>
            <select
              value={map[f] ?? ''}
              onChange={(e) => setMap((m) => ({ ...m, [f]: e.target.value === '' ? undefined : Number(e.target.value) }))}
              className="h-8 rounded-[var(--radius-sm)] border border-border-strong bg-surface px-2 text-sm"
            >
              <option value="">— not in this file —</option>
              {st.outcome.headers.map((h, i) =>
                h.trim() ? (
                  <option key={i} value={i}>
                    {h}
                  </option>
                ) : null,
              )}
            </select>
          </label>
        ))}
      </div>
      <div className="flex items-center justify-end gap-3 border-t border-border bg-surface-sunken p-4">
        {missing.length > 0 && <span className="mr-auto text-xs text-text-muted">Still needed: {missing.map((f) => FIELD_LABEL[f]).join(', ')}</span>}
        <button type="button" onClick={dismiss} className="rounded-[var(--radius-sm)] border border-border-strong px-3 py-1.5 text-sm font-medium hover:bg-surface">
          Cancel
        </button>
        <button
          type="button"
          disabled={missing.length > 0}
          onClick={() => void applyMapping(map)}
          className="rounded-[var(--radius-sm)] bg-action px-3 py-1.5 text-sm font-semibold text-on-action disabled:opacity-40"
        >
          Import with this mapping
        </button>
      </div>
    </dialog>
  );
}

export function ImportError() {
  const st = useStore((s) => s.importState);
  const dismiss = useStore((s) => s.dismissImportError);
  if (st.status !== 'error') return null;
  return (
    <div role="alert" className="mx-auto mt-4 flex w-[min(720px,92vw)] items-start gap-3 rounded-[var(--radius-md)] border border-danger/40 bg-surface p-4 shadow-[var(--shadow-e2)]">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden />
      <div className="text-sm">
        <p className="font-semibold">{st.fileName ? `We couldn’t open “${st.fileName}”.` : 'Import failed.'}</p>
        <p className="mt-1 text-text-secondary">{st.message}</p>
      </div>
      <button type="button" onClick={dismiss} aria-label="Dismiss" className="ml-auto rounded p-1 text-text-muted hover:bg-surface-sunken">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
