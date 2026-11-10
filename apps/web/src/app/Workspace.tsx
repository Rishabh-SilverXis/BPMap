/**
 * Workspace (Design System §8.1): DefinitionTabs · Toolbar · [ DiagramCanvas | RightPanel ] · StatusBar.
 * Lazy-loaded by App so the import screen ships without React Flow and the engines (Architecture §23, DEC-022).
 */
import { useEffect, useRef, useState, type ReactNode, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { Undo2, Redo2, Download, Copy, FolderOpen, X, Check, Loader2, Plus, ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import { useStore as useZustand } from 'zustand';
import { summaryLine } from '@bpmap/scene';
import type { Theme } from '@bpmap/design-tokens';
import { useActiveDefinition, useActiveOverlay, useActiveScenario, useActiveView, useStore } from '../store/store.ts';
import type { View } from '../store/overlay.ts';
import { useDiagram, type Diagram } from './derive.ts';
import { DropZone } from '../features/import/ImportScreen.tsx';
import { DiagramCanvas } from '../features/canvas/DiagramCanvas.tsx';
import { RightPanel } from '../features/panels/RightPanel.tsx';
import { copyPng, download, fileBase, pngBlob, projectBlob, readProjectFile, svgBlob } from '../features/export/exporters.ts';

export type Toast = { kind: 'ok' | 'error'; text: string } | null;

export default function Workspace({ theme, onToast }: { theme: Theme; onToast: (t: Toast) => void }) {
  const def = useActiveDefinition();
  const overlay = useActiveOverlay();
  const scenario = useActiveScenario();
  const view = useActiveView();
  const diagram = useDiagram(def, overlay, scenario, view, theme);
  if (!diagram) return null;
  return (
    <>
      <DefinitionTabs />
      <Toolbar diagram={diagram} onToast={onToast} />
      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1 bg-bg">
          <ReactFlowProvider>
            <DiagramCanvas diagram={diagram} theme={theme} />
          </ReactFlowProvider>
        </div>
        <div className="hidden lg:block">
          <RightPanel diagram={diagram} />
        </div>
      </div>
      <StatusBar diagram={diagram} />
    </>
  );
}

function DefinitionTabs() {
  const defs = useStore((s) => s.definitions);
  const activeId = useStore((s) => s.activeId);
  const setActive = useStore((s) => s.setActive);
  const remove = useStore((s) => s.removeDefinition);
  const [adding, setAdding] = useState(false);
  useEffect(() => setAdding(false), [defs.length]);
  return (
    <div className="shrink-0 border-b border-border bg-surface">
      <div className="flex h-10 items-center gap-2 overflow-x-auto px-4">
        {defs.map((d) => (
          <span key={d.id} className={clsx('flex h-7 items-center gap-1 rounded-full border pl-3 pr-1 text-[13px]', d.id === activeId ? 'border-accent bg-[#E9F7F4] font-semibold text-primary dark:bg-surface-sunken dark:text-text' : 'border-border text-text-secondary')}>
            <button type="button" onClick={() => setActive(d.id)} aria-current={d.id === activeId ? 'page' : undefined}>
              {d.variant ? `${d.process} (${d.variant})` : d.process}
            </button>
            <button
              type="button"
              aria-label={`Remove ${d.process} from this browser`}
              onClick={() => {
                if (confirm(`Remove “${d.process}” and its customisations from this browser? This can’t be undone.`)) remove(d.id);
              }}
              className="rounded-full p-1 hover:bg-surface-sunken"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <button type="button" onClick={() => setAdding((a) => !a)} className="flex h-7 items-center gap-1 rounded-full border border-dashed border-border-strong px-3 text-[13px] font-medium text-action" aria-expanded={adding}>
          <Plus className="h-3.5 w-3.5" aria-hidden /> Add file
        </button>
      </div>
      {adding && (
        <div className="px-4 pb-3">
          <DropZone compact />
        </div>
      )}
    </div>
  );
}

function Segmented() {
  const view = useActiveView();
  const setView = useStore((s) => s.setView);
  const items: { id: View; label: string }[] = [
    { id: 'executive', label: 'Executive' },
    { id: 'owner', label: 'Process owner' },
    { id: 'configurator', label: 'Configurator' },
  ];
  const onKey = (e: ReactKeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = items.findIndex((x) => x.id === view);
    const next = items[(i + (e.key === 'ArrowRight' ? 1 : items.length - 1)) % items.length]!;
    setView(next.id);
    (e.currentTarget.querySelector(`[data-view="${next.id}"]`) as HTMLElement | null)?.focus();
  };
  return (
    <div role="radiogroup" aria-label="View" className="flex rounded-[var(--radius-sm)] border border-border-strong p-0.5" onKeyDown={onKey}>
      {items.map((it) => (
        <button
          key={it.id}
          data-view={it.id}
          role="radio"
          aria-checked={it.id === view}
          tabIndex={it.id === view ? 0 : -1}
          onClick={() => setView(it.id)}
          className={clsx('rounded-[4px] px-2.5 py-1 text-[13px] font-medium', it.id === view ? 'bg-primary text-on-primary' : 'text-text-secondary hover:bg-surface-sunken')}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

function ToolButton({ onClick, disabled, label, children }: { onClick: () => void; disabled?: boolean; label: string; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label} className="flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] px-2 text-[13px] font-medium text-text-secondary hover:bg-surface-sunken disabled:opacity-35">
      {children}
    </button>
  );
}

function Toolbar({ diagram, onToast }: { diagram: Diagram; onToast: (t: Toast) => void }) {
  const { undo, redo } = useStore.temporal.getState();
  const canUndo = useZustand(useStore.temporal, (s) => s.pastStates.length > 0);
  const canRedo = useZustand(useStore.temporal, (s) => s.futureStates.length > 0);
  const definitions = useStore((s) => s.definitions);
  const overlays = useStore((s) => s.overlays);
  const scenarios = useStore((s) => s.scenarios);
  const views = useStore((s) => s.views);
  const replaceProject = useStore((s) => s.replaceProject);
  const openInput = useRef<HTMLInputElement>(null);
  const menu = useRef<HTMLDetailsElement>(null);
  const base = fileBase(diagram.def);

  const run = async (fn: () => Promise<void> | void, ok: string) => {
    menu.current?.removeAttribute('open');
    try {
      await fn();
      onToast({ kind: 'ok', text: ok });
    } catch (e) {
      onToast({ kind: 'error', text: (e as Error).message });
    }
  };

  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-surface px-4">
      <Segmented />
      <div className="mx-1 h-5 w-px bg-border" />
      <ToolButton onClick={() => undo()} disabled={!canUndo} label="Undo (customisations)">
        <Undo2 className="h-4 w-4" />
      </ToolButton>
      <ToolButton onClick={() => redo()} disabled={!canRedo} label="Redo">
        <Redo2 className="h-4 w-4" />
      </ToolButton>
      <div className="ml-auto flex items-center gap-1">
        <ToolButton onClick={() => void run(() => copyPng(diagram.def, diagram.scene), 'Image copied to the clipboard')} label="Copy image">
          <Copy className="h-4 w-4" /> <span className="hidden xl:inline">Copy image</span>
        </ToolButton>
        <ToolButton onClick={() => openInput.current?.click()} label="Open a .bpmap.json project file">
          <FolderOpen className="h-4 w-4" /> <span className="hidden xl:inline">Open project</span>
        </ToolButton>
        <input
          ref={openInput}
          type="file"
          accept=".json,.bpmap.json,application/json"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void run(async () => replaceProject(await readProjectFile(f)), `Opened ${f.name}`);
          }}
        />
        <details ref={menu} className="relative">
          <summary className="flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-[var(--radius-sm)] bg-action px-3 text-[13px] font-semibold text-on-action">
            <Download className="h-4 w-4" aria-hidden /> Export <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          </summary>
          <div role="menu" className="absolute right-0 z-40 mt-1 w-64 rounded-[var(--radius-md)] border border-border bg-surface p-1 shadow-[var(--shadow-e3)]">
            {[
              { label: 'SVG', hint: 'Vector image for documents and wikis', fn: () => download(svgBlob(diagram.def, diagram.scene), `${base}.svg`), ok: 'SVG downloaded' },
              { label: 'PNG (2×)', hint: 'For chat, email and slides', fn: async () => download(await pngBlob(diagram.def, diagram.scene), `${base}.png`), ok: 'PNG downloaded' },
              { label: 'Project file', hint: 'All definitions + customisations (.bpmap.json)', fn: () => download(projectBlob({ definitions, overlays, scenarios, views }), `${base}.bpmap.json`), ok: 'Project file downloaded' },
            ].map((m) => (
              <button key={m.label} role="menuitem" type="button" onClick={() => void run(m.fn, m.ok)} className="flex w-full flex-col items-start rounded-[var(--radius-sm)] px-3 py-2 text-left hover:bg-surface-sunken">
                <span className="text-sm font-medium">{m.label}</span>
                <span className="text-xs text-text-muted">{m.hint}</span>
              </button>
            ))}
            <p className="px-3 pb-1 pt-2 text-[11px] text-text-muted">PDF, PowerPoint and draw.io arrive in Phase 2.</p>
          </div>
        </details>
      </div>
    </div>
  );
}

function StatusBar({ diagram }: { diagram: Diagram }) {
  const saveState = useStore((s) => s.saveState);
  const setPanel = useStore((s) => s.setPanel);
  const warnings = diagram.def.warnings.length;
  return (
    <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-border bg-surface px-4 text-xs text-text-secondary">
      <span>{summaryLine(diagram.def, diagram.graph)}</span>
      {warnings > 0 && (
        <button type="button" onClick={() => setPanel('report')} className="font-semibold text-warning hover:underline" title="Open the Import tab">
          ⚠ {warnings} import warning{warnings === 1 ? '' : 's'}
        </button>
      )}
      {diagram.overlay.hidden.length > 0 && <span>{diagram.overlay.hidden.length} hidden</span>}
      {diagram.outcome.summary && (
        <span className="font-semibold text-on-conditional-subtle">
          {diagram.outcome.summary} · {diagram.outcome.skipped.size} step{diagram.outcome.skipped.size === 1 ? '' : 's'} skipped
        </span>
      )}
      <span className="ml-auto flex items-center gap-1">
        {saveState === 'saving' && (
          <>
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Saving…
          </>
        )}
        {saveState === 'saved' && (
          <>
            <Check className="h-3 w-3 text-success" aria-hidden /> Saved in this browser
          </>
        )}
        {saveState === 'unavailable' && <span className="text-warning">Browser storage unavailable: export a project file to keep your work</span>}
      </span>
      <span className="text-text-muted">Independent · not affiliated with Workday, Inc.</span>
    </footer>
  );
}
