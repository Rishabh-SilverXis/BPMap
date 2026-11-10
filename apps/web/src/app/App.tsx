/**
 * App shell (Design System §8.1). TopBar + either the ImportScreen (no definitions) or the
 * lazy-loaded Workspace. Import dialogs and toasts live here so they work in both states.
 */
import { lazy, Suspense, useEffect, useState } from 'react';
import { ShieldCheck, Sun, Moon, Monitor, X, Check, Loader2, Undo2 } from 'lucide-react';
import clsx from 'clsx';
import { useStore, type ThemePref } from '../store/store.ts';
import { useResolvedTheme } from './derive.ts';
import { ImportScreen } from '../features/import/ImportScreen.tsx';
import { ImportError, MappingDialog } from '../features/import/ImportDialogs.tsx';
import type { Toast } from './Workspace.tsx';

const Workspace = lazy(() => import('./Workspace.tsx'));

export function App() {
  const theme = useResolvedTheme();
  const hasDefinitions = useStore((s) => s.definitions.length > 0);
  const lastRemoved = useStore((s) => s.lastRemoved);
  const restoreRemoved = useStore((s) => s.restoreRemoved);
  const forgetRemoved = useStore((s) => s.forgetRemoved);
  useEffect(() => {
    if (!lastRemoved) return;
    const t = setTimeout(forgetRemoved, 10_000);
    return () => clearTimeout(t);
  }, [lastRemoved, forgetRemoved]);
  const [toast, setToast] = useState<Toast>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.kind === 'error' ? 8000 : 4000);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <ImportError />
      {!hasDefinitions ? (
        <div className="flex-1 overflow-auto">
          <ImportScreen />
        </div>
      ) : (
        <Suspense
          fallback={
            <div className="grid flex-1 place-items-center text-sm text-text-secondary">
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Preparing the diagram…
              </span>
            </div>
          }
        >
          <Workspace theme={theme} onToast={setToast} />
        </Suspense>
      )}
      <MappingDialog />
      {lastRemoved && (
        <div role="status" data-testid="removed-toast" className="fixed bottom-10 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-3 rounded-[var(--radius-md)] bg-primary px-4 py-2 text-sm text-on-primary shadow-[var(--shadow-e3)]">
          Closed “{lastRemoved.definition.process}{lastRemoved.definition.variant ? ` (${lastRemoved.definition.variant})` : ''}”
          <button type="button" onClick={restoreRemoved} className="flex items-center gap-1 rounded px-2 py-1 font-semibold underline-offset-2 hover:underline">
            <Undo2 className="h-3.5 w-3.5" aria-hidden /> Undo
          </button>
          <button type="button" aria-label="Dismiss" onClick={forgetRemoved} className="rounded p-1 opacity-80 hover:opacity-100">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {toast && (
        <div role="status" className={clsx('fixed bottom-10 right-4 z-[70] flex items-center gap-2 rounded-[var(--radius-md)] px-4 py-2.5 text-sm shadow-[var(--shadow-e3)]', toast.kind === 'ok' ? 'bg-primary text-on-primary' : 'bg-danger text-white')}>
          {toast.kind === 'ok' ? <Check className="h-4 w-4" aria-hidden /> : <X className="h-4 w-4" aria-hidden />}
          {toast.text}
        </div>
      )}
    </div>
  );
}

function TopBar() {
  const themePref = useStore((s) => s.themePref);
  const setThemePref = useStore((s) => s.setThemePref);
  const next: Record<ThemePref, ThemePref> = { system: 'light', light: 'dark', dark: 'system' };
  const ThemeIcon = themePref === 'light' ? Sun : themePref === 'dark' ? Moon : Monitor;
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
      <img src="./favicon.svg" alt="" className="h-7 w-7" />
      <span className="text-[15px] font-bold tracking-[-0.01em] text-primary dark:text-text">BPMap</span>
      <span className="text-xs text-text-muted">for Workday</span>
      <span
        className="ml-auto flex items-center gap-1.5 rounded-full bg-[#E9F7F4] px-2.5 py-1 text-xs font-semibold text-primary dark:bg-surface-sunken dark:text-text"
        title="Local only: your files and edits stay in this browser. Nothing is uploaded and AI Assist is off."
      >
        <ShieldCheck className="h-3.5 w-3.5 text-accent" aria-hidden />
        Local only
      </span>
      <button
        type="button"
        onClick={() => setThemePref(next[themePref])}
        className="rounded-[var(--radius-sm)] p-2 text-text-secondary hover:bg-surface-sunken"
        aria-label={`Theme: ${themePref}. Switch to ${next[themePref]}`}
        title={`Theme: ${themePref}`}
      >
        <ThemeIcon className="h-4 w-4" />
      </button>
    </header>
  );
}
