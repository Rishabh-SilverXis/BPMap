/**
 * Workspace (Design System §8.1): DefinitionTabs · Toolbar · [ DiagramCanvas | RightPanel ] · StatusBar.
 * Lazy-loaded by App so the import screen ships without React Flow and the engines (Architecture §23, DEC-022).
 */
import { useEffect, useRef, useState, type ReactNode, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Undo2, Redo2, Download, Copy, FolderOpen, X, Check, Loader2, Plus, ChevronDown, ScanSearch, List, ChevronLeft, ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import { useStore as useZustand } from 'zustand';
import { buildConditionsScene, buildCoverScene, summaryLine } from '@bpmap/scene';
import type { Theme } from '@bpmap/design-tokens';
import { useActiveDefinition, useActiveOverlay, useActiveScenario, useActiveView, useStore } from '../store/store.ts';
import type { View } from '../store/overlay.ts';
import { deriveDiagram, useDiagram, type Diagram } from './derive.ts';
import { DropZone } from '../features/import/ImportScreen.tsx';
import { DiagramViewer } from '../features/canvas/DiagramViewer.tsx';
import { StepList } from '../features/canvas/StepList.tsx';
import { RightPanel } from '../features/panels/RightPanel.tsx';
import { copyPng, customisationsBlob, download, drawioBlob, fileBase, pdfBlob, pngBlob, pptxBlob, projectBlob, readBpmapFile, sameDefinition, svgBlob, type ExportPage } from '../features/export/exporters.ts';
import type { ProcessDefinition } from '@bpmap/model';
import { runRules } from '@bpmap/engine-rules';
import { xlsxBlob } from '../features/export/workbook.ts';

export type Toast = { kind: 'ok' | 'error'; text: string } | null;

export default function Workspace({ theme, onToast }: { theme: Theme; onToast: (t: Toast) => void }) {
  const listMode = useStore((s) => s.listMode);
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
          {listMode ? <StepList diagram={diagram} /> : <DiagramViewer diagram={diagram} theme={theme} />}
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
              aria-label={`Close ${d.variant ? `${d.process} (${d.variant})` : d.process}`}
              title="Close (you can undo)"
              onClick={() => remove(d.id)}
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
  const applyCustomisations = useStore((s) => s.applyCustomisations);
  const openFile = async (f: File) => {
    const opened = await readBpmapFile(f);
    if (opened.kind === 'project') return replaceProject(opened.contents);
    const c = opened.file;
    const target = sameDefinition(diagram.def, c.definition) ? diagram.def : definitions.find((d) => sameDefinition(d, c.definition));
    const name = c.definition.variant ? `${c.definition.process} (${c.definition.variant})` : c.definition.process;
    if (!target) throw new Error(`These customisations are for “${name}”. Import that definition first, then open the file again.`);
    applyCustomisations(target.id, c.overlay, c.presets, c.view);
  };
  const openInput = useRef<HTMLInputElement>(null);
  const menu = useRef<HTMLDetailsElement>(null);
  const base = fileBase(diagram.def);
  const focusLaneId = useStore((s) => s.focusLaneId);
  const setFocusLane = useStore((s) => s.setFocusLane);
  const listMode = useStore((s) => s.listMode);
  const setListMode = useStore((s) => s.setListMode);
  const selectedStepId = useStore((s) => s.selectedStepId);
  const select = useStore((s) => s.select);
  // The focused role's steps in reading order (left → right, then top → bottom) for the ‹ › stepper.
  const roleSteps = focusLaneId ? diagram.layout.nodes.filter((n) => n.laneId === focusLaneId).sort((a, b) => a.x - b.x || a.y - b.y).map((n) => n.id) : [];
  const roleIndex = selectedStepId ? roleSteps.indexOf(selectedStepId) : -1;
  const goRoleStep = (delta: number) => {
    if (!roleSteps.length) return;
    const next = roleIndex < 0 ? (delta > 0 ? 0 : roleSteps.length - 1) : (roleIndex + delta + roleSteps.length) % roleSteps.length;
    select(roleSteps[next]!);
  };
  // Exports are always rendered light (DS §12), whatever the screen theme (DEC-046). Multi-page
  // formats add a readable conditions page after each diagram; packs open with a cover (DEC-051).
  const pagesFor = (d: ProcessDefinition, withConditions: boolean): ExportPage[] => {
    const v = views[d.id] ?? 'owner';
    const dg = deriveDiagram(d, overlays[d.id], scenarios[d.id], v, 'light');
    const conds = withConditions ? buildConditionsScene(d, 'light', dg.conditionText) : null;
    return [{ title: `${titleOf(d)} · ${VIEW_LABEL[v]}`, scene: dg.scene }, ...(conds ? [{ title: `${titleOf(d)} · Conditions`, scene: conds }] : [])];
  };
  const page = (): ExportPage => pagesFor(diagram.def, false)[0]!;
  const pages = (): ExportPage[] => pagesFor(diagram.def, true);
  const pack = (withConditions = true): ExportPage[] => {
    const entries = definitions.map((d) => {
      const dg = deriveDiagram(d, overlays[d.id], scenarios[d.id], views[d.id] ?? 'owner', 'light');
      const open = dg.findings.filter((f) => !dg.overlay.dismissedFindings[f.fingerprint]);
      const count = (sev: string) => open.filter((f) => f.severity === sev).length;
      return { name: titleOf(d), view: VIEW_LABEL[dg.view], summary: summaryLine(d, dg.graph), health: { critical: count('critical'), warning: count('warning'), info: count('info') } };
    });
    const cover = buildCoverScene({ title: 'Business process pack', date: new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }), entries }, 'light');
    return [{ title: 'Contents', scene: cover }, ...definitions.flatMap((d) => pagesFor(d, withConditions))];
  };

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
      <div className="mx-1 h-5 w-px bg-border" />
      {diagram.view !== 'executive' && !listMode && (
        <label className="flex items-center gap-1.5 text-[13px] text-text-secondary">
          <ScanSearch className="h-4 w-4" aria-hidden />
          <span className="sr-only xl:not-sr-only">Focus</span>
          <select
            aria-label="Focus on a role"
            value={focusLaneId ?? ''}
            onChange={(e) => setFocusLane(e.target.value || null)}
            className="h-8 max-w-48 rounded-[var(--radius-sm)] border border-border-strong bg-surface px-2 text-[13px] text-text"
          >
            <option value="">All roles</option>
            {diagram.layout.lanes.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {diagram.view !== 'executive' && !listMode && focusLaneId && (
        <div className="flex items-center rounded-[var(--radius-sm)] border border-border-strong" role="group" aria-label="Steps for this role">
          <button type="button" aria-label="Previous step for this role" onClick={() => goRoleStep(-1)} disabled={!roleSteps.length} className="grid h-8 w-7 place-items-center text-text-secondary hover:bg-surface-sunken disabled:opacity-40">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[3.5rem] text-center text-xs tabular-nums text-text-secondary" data-testid="role-step-count" aria-live="polite">
            {roleSteps.length === 0 ? 'no steps' : roleIndex < 0 ? `${roleSteps.length} step${roleSteps.length === 1 ? '' : 's'}` : `${roleIndex + 1} / ${roleSteps.length}`}
          </span>
          <button type="button" aria-label="Next step for this role" onClick={() => goRoleStep(1)} disabled={!roleSteps.length} className="grid h-8 w-7 place-items-center text-text-secondary hover:bg-surface-sunken disabled:opacity-40">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
      <button
        type="button"
        aria-pressed={listMode}
        onClick={() => setListMode(!listMode)}
        title="Accessible step list: the same process as a table"
        className={clsx('flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] border px-2 text-[13px] font-medium', listMode ? 'border-primary bg-primary text-on-primary' : 'border-border-strong text-text-secondary hover:bg-surface-sunken')}
      >
        <List className="h-4 w-4" aria-hidden /> Step list
      </button>
      <div className="ml-auto flex items-center gap-1">
        <ToolButton onClick={() => void run(() => copyPng(diagram.def, page().scene), 'Image copied to the clipboard')} label="Copy image">
          <Copy className="h-4 w-4" /> <span className="hidden xl:inline">Copy image</span>
        </ToolButton>
        <ToolButton onClick={() => openInput.current?.click()} label="Open a project or customisations file (.json)">
          <FolderOpen className="h-4 w-4" /> <span className="hidden xl:inline">Open</span>
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
            if (f) void run(() => openFile(f), `Opened ${f.name}`);
          }}
        />
        <details ref={menu} className="relative">
          <summary className="flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-[var(--radius-sm)] bg-action px-3 text-[13px] font-semibold text-on-action">
            <Download className="h-4 w-4" aria-hidden /> Export <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          </summary>
          <div role="menu" className="absolute right-0 z-40 mt-1 max-h-[70vh] w-72 overflow-auto rounded-[var(--radius-md)] border border-border bg-surface p-1 shadow-[var(--shadow-e3)]">
            <MenuHeading>This view · {VIEW_LABEL[diagram.view]}</MenuHeading>
            {[
              { label: 'PDF', hint: 'Vector, sharp at any size; diagram + conditions page', fn: async () => download(await pdfBlob(pages()), `${base}.pdf`), ok: 'PDF downloaded' },
              { label: 'PowerPoint', hint: 'Editable shapes; diagram + conditions slide', fn: async () => download(await pptxBlob(pages(), titleOf(diagram.def)), `${base}.pptx`), ok: 'PowerPoint downloaded' },
              { label: 'draw.io (for Visio)', hint: 'Edit in diagrams.net, save as Visio or open in Lucidchart', fn: async () => download(await drawioBlob(pages()), `${base}.drawio`), ok: 'draw.io file downloaded' },
              { label: 'Excel', hint: 'Steps, conditions and health findings as sheets (full definition)', fn: async () => download(await xlsxBlob([{ def: diagram.def, overlay: diagram.overlay, findings: diagram.findings }], titleOf(diagram.def)), `${base}.xlsx`), ok: 'Excel workbook downloaded' },
              { label: 'SVG', hint: 'Vector image for web pages and wikis', fn: () => download(svgBlob(diagram.def, page().scene), `${base}.svg`), ok: 'SVG downloaded' },
              { label: 'PNG (2×)', hint: 'For chat, email and slides', fn: async () => download(await pngBlob(diagram.def, page().scene), `${base}.png`), ok: 'PNG downloaded' },
            ].map((m) => (
              <MenuItem key={m.label} {...m} onRun={run} />
            ))}
            {definitions.length > 1 && (
              <>
                <MenuHeading>All {definitions.length} definitions · with a cover</MenuHeading>
                {[
                  { label: 'PDF pack', hint: 'Cover with contents and health, then each definition in its saved view', fn: async () => download(await pdfBlob(pack()), 'bpmap-pack.pdf'), ok: 'PDF pack downloaded' },
                  { label: 'PowerPoint pack', hint: 'Cover slide, then diagram + conditions per definition', fn: async () => download(await pptxBlob(pack(), 'BPMap pack'), 'bpmap-pack.pptx'), ok: 'PowerPoint pack downloaded' },
                  { label: 'Excel pack', hint: 'All definitions in one workbook, with a Definition column', fn: async () => download(await xlsxBlob(definitions.map((d) => ({ def: d, overlay: overlays[d.id], findings: runRules(d) })), 'BPMap pack'), 'bpmap-pack.xlsx'), ok: 'Excel pack downloaded' },
                  { label: 'draw.io pack', hint: 'Cover page, then diagram + conditions per definition', fn: async () => download(await drawioBlob(pack()), 'bpmap-pack.drawio'), ok: 'draw.io pack downloaded' },
                ].map((m) => (
                  <MenuItem key={m.label} {...m} onRun={run} />
                ))}
              </>
            )}
            <MenuHeading>Project</MenuHeading>
            <MenuItem label="Project file" hint="All definitions + customisations + scenarios (.bpmap.json)" fn={() => download(projectBlob({ definitions, overlays, scenarios, views }), `${base}.bpmap.json`)} ok="Project file downloaded" onRun={run} />
            <MenuItem label="Customisations only" hint="Labels, notes, plain-word conditions and presets for this definition; no Workday data" fn={() => download(customisationsBlob(diagram.def, diagram.overlay, scenarios[diagram.def.id], views[diagram.def.id]), `${base}.customisations.json`)} ok="Customisations downloaded" onRun={run} />
          </div>
        </details>
      </div>
    </div>
  );
}

const VIEW_LABEL: Record<View, string> = { executive: 'Executive', owner: 'Process owner', configurator: 'Configurator' };
const titleOf = (d: ProcessDefinition) => (d.variant ? `${d.process} (${d.variant})` : d.process);

function MenuHeading({ children }: { children: ReactNode }) {
  return <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted">{children}</p>;
}

function MenuItem({ label, hint, fn, ok, onRun }: { label: string; hint: string; fn: () => Promise<void> | void; ok: string; onRun: (fn: () => Promise<void> | void, ok: string) => Promise<void> }) {
  return (
    <button role="menuitem" type="button" onClick={() => void onRun(fn, ok)} className="flex w-full flex-col items-start rounded-[var(--radius-sm)] px-3 py-2 text-left hover:bg-surface-sunken">
      <span className="text-sm font-medium">{label}</span>
      <span className="text-xs text-text-muted">{hint}</span>
    </button>
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
