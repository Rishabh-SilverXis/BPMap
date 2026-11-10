/**
 * Empty state + drop zone (Design System §8.2, §9.8; IMP-01, IMP-11).
 * Files are read with File.arrayBuffer() and parsed in the import worker. Nothing is uploaded.
 */
import { useRef, useState, type DragEvent } from 'react';
import { FileUp, ShieldCheck, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { useStore } from '../../store/store.ts';
import { ExportGuide } from './ExportGuide.tsx';

export function DropZone({ compact = false }: { compact?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const importFiles = useStore((s) => s.importFiles);
  const importState = useStore((s) => s.importState);
  const busy = importState.status === 'reading';

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    void importFiles([...e.dataTransfer.files]);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={clsx(
        'flex flex-col items-center justify-center rounded-[var(--radius-lg)] border-[1.5px] border-dashed text-center transition-colors',
        compact ? 'gap-2 p-6' : 'gap-3 p-10',
        over ? 'border-accent bg-[#E9F7F4] dark:bg-surface-sunken' : 'border-border-strong bg-surface-sunken',
      )}
    >
      {busy ? <Loader2 className="h-8 w-8 animate-spin text-accent" aria-hidden /> : <FileUp className="h-8 w-8 text-text-muted" aria-hidden />}
      <p className="text-[15px] font-semibold">
        {busy ? `Reading ${importState.fileName}…` : over ? 'Drop to read locally' : 'Drop your Workday export here, or'}
      </p>
      {!busy && (
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="rounded-[var(--radius-sm)] bg-action px-4 py-2 text-sm font-semibold text-on-action hover:opacity-90"
        >
          Choose files
        </button>
      )}
      <p className="text-xs text-text-muted">.xlsx from View Definition · several files allowed (a definition and its subprocesses)</p>
      <input
        ref={input}
        type="file"
        multiple
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          void importFiles([...(e.target.files ?? [])]);
          e.target.value = '';
        }}
      />
    </div>
  );
}

export function ImportScreen() {
  const importFiles = useStore((s) => s.importFiles);
  const loadSample = async () => {
    const res = await fetch('./sample-change-job.xlsx');
    const blob = await res.blob();
    await importFiles([new File([blob], 'sample-change-job.xlsx')]);
  };

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-12 md:py-16">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-accent">For Workday business process definitions</p>
        <h1 className="mt-2 text-[32px] font-bold leading-10 tracking-[-0.02em] text-primary dark:text-text">See your business process as a flow.</h1>
        <p className="mt-2 max-w-xl text-[15px] text-text-secondary">
          Drop a Workday “View Definition” Excel export. You get a swimlane diagram with every stage, parallel step and condition, ready to export.
        </p>
      </div>
      <DropZone />
      <p className="flex items-center gap-2 text-sm text-text-secondary">
        <ShieldCheck className="h-4 w-4 text-accent" aria-hidden />
        Read in this browser. Nothing is uploaded.
      </p>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <button type="button" onClick={() => void loadSample()} className="font-semibold text-action underline-offset-2 hover:underline">
          Try the synthetic Change Job sample
        </button>
      </div>
      <ExportGuide />
    </main>
  );
}
