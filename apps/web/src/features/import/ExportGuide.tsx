/** "How to get the export" (IMP-11). Plain steps; screenshots are added once we have approved ones. */
const STEPS = [
  ['Open the definition', 'In Workday, search for the business process type (for example Change Job), open the definition you want and choose View Definition.'],
  ['Export to Excel', 'Use the Excel export icon at the top of the page and save the .xlsx file.'],
  ['Drop the file here', 'Add more files for the same process, such as subprocess definitions. Each one becomes a tab.'],
] as const;

export function ExportGuide() {
  return (
    <section aria-labelledby="export-guide" className="rounded-[var(--radius-md)] border border-border bg-surface p-5">
      <h2 id="export-guide" className="text-base font-semibold">
        How to get the export
      </h2>
      <ol className="mt-3 grid gap-4 md:grid-cols-3">
        {STEPS.map(([title, body], i) => (
          <li key={title} className="flex gap-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-on-primary">{i + 1}</span>
            <div>
              <p className="text-sm font-semibold">{title}</p>
              <p className="mt-1 text-[13px] leading-[18px] text-text-secondary">{body}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-xs text-text-muted">
        What the export doesn’t show: who may cancel, rescind or correct (the business process security policy), the logic inside a condition, and steps inside subprocesses unless you add their export.
      </p>
    </section>
  );
}
