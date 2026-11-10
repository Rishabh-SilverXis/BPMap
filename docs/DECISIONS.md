# Decisions Log

Every meaningful decision made while changing the code, with the reasoning behind it. Newest at the bottom.

**Format:** each entry has an ID, date, the phase/requirement it serves, **Decision**, **Why**, **Alternatives considered**, and **Consequences / follow-ups**.

Related: [PRD](PRD_BPMap_for_Workday.md) · [Design System](DESIGN_SYSTEM.md) · [Architecture](ARCHITECTURE.md) · [Flow](FLOW.md)

---

## DEC-001 · Archive the prototype instead of patching it in place
- **Date:** 2026-11-10 · **Serves:** Phase 0, Architecture §24
- **Decision:** Copy the original prototype (`src/`, `index.html`, configs, `package.json`) to `archive/prototype-v0/` and rebuild in the new workspace layout. The prototype is excluded from builds and type-checks.
- **Why:** The folder was not a git repository, so there was no history to fall back on. Architecture §24 planned to hot-fix D1/E1/E3/E4/E10 in place first, but almost every hot-fixed file (`FlowchartEditor.tsx`, `gemini.ts`, `DataVerification.tsx`) is replaced in Phase 1 anyway. Patching code we're about to delete is wasted effort, but deleting it without a copy loses the user's work.
- **Alternatives:** (a) Baseline git commit, then delete. Committing needs the user's go-ahead, so it's offered instead. (b) Hot-fix in place, as Architecture §24 suggested. Rejected as throwaway work.
- **Consequences:** The archive can be deleted once the user makes a baseline commit. Note: the prototype's `package-lock.json` was removed **without** being archived, so the archived `package.json` installs with caret ranges, which may resolve newer versions than the originals.

## DEC-002 · npm workspaces instead of pnpm
- **Date:** 2026-11-10 · **Serves:** Architecture §5, ADR-003 (amended)
- **Decision:** Use **npm workspaces** (`apps/*`, `packages/*`) with the npm 11 that ships with Node 26.
- **Why:** pnpm isn't installed, and corepack is no longer bundled with Node ≥ 25, so pnpm would need a separate global install on the user's machine. npm workspaces give the same package boundaries ADR-003 cares about (engine packages reusable by the future AI gateway) with zero extra tooling.
- **Alternatives:** Install pnpm globally (another system change); a single app with folder boundaries only (loses reuse by `apps/gateway`).
- **Consequences:** ADR-003's intent (framework-free packages, boundary rules) is unchanged; only the package manager differs. Commands in docs use `npm run … -w <workspace>`.

## DEC-003 · Workspace packages ship TypeScript source (no build step)
- **Date:** 2026-11-10 · **Serves:** Architecture §5
- **Decision:** Each package's `exports` points at `src/index.ts`. Vite, Vitest and `tsc --noEmit` all consume the source directly.
- **Why:** There's one consumer today (the web app), and the tools resolve symlinked workspace TS natively. A per-package build adds watch processes and stale-output bugs for no benefit yet.
- **Alternatives:** `tsup` per package; TypeScript project references with `tsc -b`.
- **Consequences:** When `apps/gateway` (Phase 3) runs on a server runtime, add a build (or run it with a TS-aware runtime). Revisit then.

## DEC-004 · Respect our own 14-day dependency delay at install time
- **Date:** 2026-11-10 · **Serves:** Architecture §18.1 ("Renovate with a 14-day delay")
- **Decision:** Install dependencies with `npm install --before=<today − 14 days>` and pin major versions explicitly in `package.json`.
- **Why:** The architecture asks for delayed adoption of new releases as a supply-chain control. Applying it from the very first install keeps us honest.
- **Alternatives:** Install whatever is latest today.
- **Consequences:** The lockfile reflects versions at least 14 days old. A future Renovate config will enforce the same rule.

## DEC-005 · Start on current major versions (TypeScript 7, Vite 8, Vitest 5)
- **Date:** 2026-11-10 · **Serves:** Architecture §4 (tech stack)
- **Decision:** Ranges are pinned to the major only (`^7.0.0`, `^8.0.0`…), and the install applies the 14-day cutoff (DEC-004). Resolved: TypeScript 7.0.2 (native compiler), Vite 8.3, Vitest 5.0, React 19.3, @xyflow/react 12.12, zod 4.6, Tailwind 4.3.
- **Why:** A greenfield codebase should begin on the supported majors rather than inherit a migration on day one. The architecture names libraries, not versions.
- **Alternatives:** Pin the older majors the prototype used (TS 5.8, Vite 6). Rejected: they would need migrating within months.
- **Consequences:** `npm view --before` turned out to ignore the cutoff and reported versions newer than it, so exact-version pins failed (`ETARGET`). Major-only ranges let the cutoff choose. If a TS 7 or Vite 8 incompatibility appears, it is logged here with the workaround.

## DEC-006 · Read XLSX with fflate + fast-xml-parser; exceljs only for generating fixtures
- **Date:** 2026-11-10 · **Serves:** IMP-01, NFR-SEC-02, Architecture §7.2 (supersedes the reader half of ADR-009)
- **Decision:** The importer unzips with **fflate** and parses the sheet XML with **fast-xml-parser**. **exceljs** is a root dev-dependency used only by the fixture generator script (and later, possibly, the XLSX *export* worker).
- **Why:**
  1. **Zip-bomb guard.** fflate exposes each entry's declared uncompressed size *before* inflating, so the §7.2 limits (≤ 2,000 entries, ≤ 150 MB uncompressed) are enforced up front. exceljs inflates first.
  2. **Worker-safe.** Both libraries are pure ESM with no Node polyfills. exceljs's browser build is a ~1 MB UMD bundle that assumes `global`/polyfills.
  3. **Smaller attack surface.** The install showed exceljs pulls deprecated transitive dependencies (`rimraf@2`, `fstream`, `glob@7`, `uuid@8`). These now stay out of the shipped bundle.
  4. **We only need cell text.** Formulas are ignored by design (§7.2), so a full spreadsheet engine isn't needed.
- **Alternatives:** exceljs in the worker (as ADR-009 proposed); SheetJS (the npm release is stale; the current one ships only from its own CDN).
- **Consequences:** We own a small reader (`packages/importer-xlsx/src/xlsx.ts`) covering shared strings, inline strings, rich text and the cell types `s/str/inlineStr/b/n/e`. Golden tests use real files written by exceljs, so the reader is tested against an independent writer.

## DEC-007 · Synthetic fixtures until real exports arrive
- **Date:** 2026-11-10 · **Serves:** NFR-QUAL, Architecture §21 (fixture policy), open question T1
- **Decision:** `packages/fixtures/scripts/make-fixtures.mjs` writes three synthetic workbooks: canonical layout, renamed and shuffled headers, and an unknown layout. The canonical one doubles as the in-app sample (`apps/web/public/sample-change-job.xlsx`), so the sample goes through the *real* import path.
- **Why:** No real Workday export is available yet. Golden tests are needed now, and the synthetic files are written by an independent writer (exceljs), so they genuinely exercise our reader. Step and condition wording is our own, not copied from Workday's delivered definitions or from Incubane's sample.
- **Alternatives:** Hand-written JSON fixtures (wouldn't test the XLSX reader); copying a public sample (licensing and provenance unclear).
- **Consequences:** The header synonyms and the "`<Process> (<Variant>) step <order> - <Type>`" Step label pattern are **assumptions** until T1 is answered. Regenerating fixtures changes the file bytes (exceljs stamps timestamps), so the golden snapshot's `contentHash` must be refreshed with `vitest -u`.

## DEC-008 · Content hash = FNV-1a 32-bit + byte length
- **Date:** 2026-11-10 · **Serves:** IMP-06 (re-import detection), Architecture §13
- **Decision:** `contentHash(bytes)` is a synchronous FNV-1a over the file bytes, suffixed with the length.
- **Why:** The hash is used only to detect "is this the same export as last time?" for overlay reconciliation. It isn't a security boundary. `importWorkbook` is synchronous (it runs in a worker and in tests), and WebCrypto's SHA-256 is async-only.
- **Alternatives:** SHA-256 via `crypto.subtle` (would make the whole import async); no hash.
- **Consequences:** Collisions are possible but harmless: the worst case is a missed "this export changed" prompt. Never use this hash for integrity or security.

## DEC-009 · Notifications sheet is detected, not yet parsed
- **Date:** 2026-11-10 · **Serves:** IMP-02 (P0) vs MOD-09 (P1)
- **Decision:** The importer recognises a Notifications sheet (and says so in the sheet report), but `definition.notifications` stays empty in Increment 1.
- **Why:** Detection is P0, but modelling notifications is P1 (Phase 2). We also don't know the real column layout, so a parser written now would be guesswork baked into the model.
- **Alternatives:** Parse it speculatively now.
- **Consequences:** The parse report shows "Notifications sheet found, shown from Phase 2".

## DEC-010 · Condition numbering follows stage order and is keyed by normalised text
- **Date:** 2026-11-10 · **Serves:** MOD-08, Architecture §7.4, §12, §13
- **Decision:** Condition text is split on line breaks (one condition per line), and a trailing "(Workday Owned)" sets `workdayOwned` and is removed. Conditions are deduplicated by lower-cased, whitespace-collapsed text and numbered C1…Cn by first appearance in **stage order** (then source row).
- **Why:** Stage order matches how people read the diagram (C1 is the first condition you meet). Text-keying is what lets plain-word overrides and diffs survive renumbering.
- **Alternatives:** Number by source row (unstable when rows are re-ordered, which the renamed-and-shuffled fixture proves).
- **Consequences:** A condition can be attached to several steps (the fixture's "Location changed?" is on i and k).

## DEC-011 · Lane assignment rules
- **Date:** 2026-11-10 · **Serves:** VIS-01, MOD-06
- **Decision:** A step's lane is its **first** security group. Service and integration steps always go to the system lanes ("Workday (automatic)", "Integrations") at the bottom, whatever their group column says. An initiation step with no group goes to "Initiator", and any other step with no group goes to "Unassigned" (plus a `W-GROUP-EMPTY` warning). Lanes are ordered by first appearance in **stage order**.
- **Why:** VIS-01 says system work sits at the bottom so readers can see where people stop and the system takes over. Using the first group gives one deterministic lane per step; the extra groups are shown as "Also:" in the Configurator view (Phase 2).
- **Alternatives:** Duplicate a multi-group step into every lane (misleading: it is one task); order lanes alphabetically (loses the narrative order).
- **Consequences:** Lane IDs are `lane-<slug(label)>`, which is what overlay lane renames key on.

## DEC-012 · Tokens: TypeScript source, CSS mirror guarded by a test
- **Date:** 2026-11-10 · **Serves:** Design System §15.2
- **Decision:** `packages/design-tokens/src/index.ts` is the source (primitives, semantic light/dark, node tokens, canvas type). `tokens.css` mirrors the semantic layer for Tailwind, and `tokens.test.ts` fails if any value drifts. The same test re-checks the Design System §14.2 contrast guarantees.
- **Why:** The Design System's target is a W3C `tokens.json` plus a generator. That's worth it once PPTX and draw.io exporters also consume the tokens (Phase 2). Today there are two consumers, and a drift test gives the same safety without a build step.
- **Alternatives:** Build the generator now; CSS-only tokens (the canvas and exporters can't read CSS in a worker).
- **Consequences:** Move to `tokens.json` + generator when the third consumer arrives.

## DEC-013 · Edge routing: "gutter router" for Increment 1; decision diamonds deferred
- **Date:** 2026-11-10 · **Serves:** VIS-05, ADR-004 (phase 2 of the layout), open question T2
- **Decision:** Transitions between consecutive stages are orthogonal polylines that bend **only in the gutter** (the boundary between two columns). Parallel stages get split/join bars, with short stubs to each step. Conditional steps are shown with the dashed amber outline and C-badges; **no decision diamonds yet**.
- **Why:** Because nodes live strictly inside their column, an edge that only turns at column boundaries can never cross a node (a layout test proves it). That meets VIS-05 for Increment 1 without pulling in ELK or libavoid before the T2 spike. Diamonds belong with SCN-02 ("show as a yes/no decision"), which is P1, and the DS says diamonds appear only on approvals or when toggled.
- **Alternatives:** Run the ELK spike now; draw a diamond for every condition (the prototype's approach, which DS principle 2 rejects).
- **Consequences:** `routeTransition` is isolated in `engine-layout`, so the router can be swapped after the T2 spike. Long diagrams have one vertical segment per gutter, which is readable but not optimised for crossings.

## DEC-014 · Scene resolves colours at build time; the canvas background *is* the export scene
- **Date:** 2026-11-10 · **Serves:** ADR-007, EXP-01, VIS-06
- **Decision:**
  1. `buildDiagramScene` and `buildExportScene` take a theme and emit concrete colours.
  2. The canvas draws the **export scene** (header, lanes, stage headers, edges, bars, legend, condition list) as its background, and renders the step boxes as interactive React Flow nodes at the same coordinates.
  3. Step icons are left out of Increment 1, both on the canvas and in exports.
- **Why:**
  - The architecture's `TokenRef` indirection only pays off with user branding (Pro, Phase 3). Resolving early keeps exporters trivial.
  - Reusing the export scene for the canvas means "what you see is exactly what you export", the strongest form of ADR-007.
  - The kind label text already carries the meaning (DS principle 6), and icons would need an SVG icon pipeline for exports, so they wait for Phase 2 to keep canvas and export identical.
- **Alternatives:** A separate canvas renderer for lanes and edges (risk of drift); React Flow edges for transitions (React Flow edges need node handles; our bars aren't nodes).
- **Consequences:** Scene text is measured with a width approximation (no DOM in workers), so the canvas's DOM-rendered node text may wrap slightly differently from the export. This is acceptable because both clamp to 2 lines.

## DEC-015 · Leave the `fsevents` install script blocked
- **Date:** 2026-11-10 · **Serves:** Architecture §18.1 (supply chain)
- **Decision:** npm 11 blocks dependency install scripts unless they're allow-listed. The only one in the tree is `fsevents` (an optional macOS file watcher pulled in by the dev tooling). We leave it blocked.
- **Why:** fsevents ships a prebuilt binary; its install script is only a compile fallback. Blocking install scripts by default is the supply-chain posture we want.
- **Consequences:** If a future dependency genuinely needs an install script, approve it explicitly with `npm install-scripts approve <pkg>` and log it here.

## DEC-016 · Production CSP injected at build time; theme script is an external file
- **Date:** 2026-11-10 · **Serves:** NFR-PRIV-01, NFR-SEC-02, Architecture §18.1
- **Decision:** A small Vite plugin (`apply: 'build'`) adds a `<meta http-equiv="Content-Security-Policy">` to the built HTML: `connect-src 'self'`, `script-src 'self'`, `worker-src 'self' blob:`, `img-src 'self' blob: data:`, `font-src 'self'`. The pre-paint theme script is `public/theme-init.js` (external), not inline.
- **Why:** Increment 1 has no optional services, so nothing besides our own origin needs to be reachable. The architecture's `connect-src` entries for the AI and team domains are added only when those features exist. Vite's dev server needs inline scripts for hot reload, so the policy applies to builds only.
- **Verified:** In the production preview, the sample imported through the worker, all 18 steps rendered, there were **0 CSP violations**, the self-hosted Inter font loaded, and there were **0 off-origin requests**.
- **Consequences:** A meta CSP can't set `frame-ancestors`. When hosting is chosen, move the policy to an HTTP response header and add `frame-ancestors 'none'`.

## DEC-017 · IndexedDB: one key-value table for Increment 1
- **Date:** 2026-11-10 · **Serves:** NFR-REL, IMP-07, Architecture §14.2 (simplified)
- **Decision:** Dexie database `bpmap` v1 has a single `kv` table holding `project` (definitions, overlays, reports, activeId) and `mappingProfiles`. Autosave is debounced at 500 ms. On load, every definition goes back through `parseDefinition` (zod), and invalid entries are dropped, not loaded.
- **Why:** There's one local project per browser in Increment 1. The architecture's multi-table schema is for multiple projects, scenarios and versions (Phase 2+). A single document is simpler and atomic.
- **Alternatives:** The full §14.2 schema now.
- **Consequences:** Moving to the multi-table schema is a Dexie `version(2).upgrade()` migration when projects or scenarios arrive. If storage fails (private mode, quota), the status bar says so and suggests exporting a project file.

## DEC-018 · Overlay subset lives in the web app for now
- **Date:** 2026-11-10 · **Serves:** CUS-01 (P0 part), Architecture §13
- **Decision:** The overlay type (labels, notes, hidden, laneNames) is defined in `apps/web/src/store/overlay.ts`. The graph receives `hiddenStepIds`/`laneNames`, and the scene receives `labels`/`notes`.
- **Why:** Only the web app uses overlays today. Re-import reconciliation and orphan detection (IMP-06, P1) is when overlay logic becomes worth a package (`packages/overlay` per the architecture).
- **Consequences:** Overlays are keyed by StepId / lane ID, so they already survive re-import of an unchanged step. Orphan reporting comes with IMP-06.

## DEC-019 · Undo groups keystrokes per field
- **Date:** 2026-11-10 · **Serves:** CUS-04, ADR-005
- **Decision:** zundo tracks only `overlays`. Its `handleSet` is wrapped so a burst of edits becomes one undo step, and the burst ends after 500 ms of quiet **or as soon as a different field is edited**. Imports, hydration and project loads run inside `untracked()` (temporal tracking paused). Removing a definition clears the history.
- **Why:** The first version used time-only grouping. Browser testing showed one Undo removed *both* a label and a note typed back to back. Users expect one undo per field. Loads aren't user edits, so they mustn't be undoable.
- **Verified in browser:** label + note → Undo removes the note only → Undo removes the label → Undo is disabled.

## DEC-020 · Derivation runs on the main thread in Increment 1
- **Date:** 2026-11-10 · **Serves:** Architecture §8 (worker threshold), §23
- **Decision:** `buildGraph → layout → buildExportScene` run in a `useMemo` on the main thread. Only XLSX parsing is in a worker.
- **Why:** The architecture puts derivation in a compute worker only above ~40 steps. The sample has 18, and the derivation is pure and fast. A worker round-trip would add latency and complexity for no gain yet.
- **Consequences:** Add the compute worker when the T6 benchmark (or a real 60+ step export) shows main-thread time above 50 ms.

## DEC-021 · Show only what works; mark the roadmap honestly
- **Date:** 2026-11-10 · **Serves:** Design System §13.1 ("honest about limits")
- **Decision:**
  - The right panel shows only the implemented tabs (Step, Import report). Health, Scenario and Customise aren't shown yet.
  - The view switcher shows Executive and Configurator **disabled**, with a "Coming in Phase 2" tooltip, because the three-view model is central to the product.
  - The Export menu lists SVG, PNG and Project file, with a footnote that PDF, PowerPoint and draw.io arrive in Phase 2.
  - The sample button says "synthetic".
- **Why:** Empty tabs would read as broken. The disabled views tell a beta user where the product is going without pretending it's there.

## DEC-022 · Lazy-load the workspace to meet the bundle budget
- **Date:** 2026-11-10 · **Serves:** Architecture §23 (≤ 180 KB gzip initial JS)
- **Decision:** `App` lazy-loads `Workspace` (React Flow, engines, scene, panels, exporters). The import screen ships React, zod, Dexie and the store only.
- **Measured:** Before, one 715 KB chunk (226 KB gzip, **over** budget). After, 163 KB gzip initial (+8 KB CSS) and 65 KB gzip for Workspace, loaded when a definition exists. The import worker (177 KB raw) loads on first import.
- **Consequences:** Initial JS is within budget but has little headroom. The next candidates are moving zod validation of stored data into the worker, and trimming the lucide imports.

## DEC-023 · Native `<dialog>` and `<details>` instead of Radix for Increment 1
- **Date:** 2026-11-10 · **Serves:** Design System §9.10, §15.3 (deferred)
- **Decision:** The mapping dialog uses the native `<dialog>` (focus trap, Esc, backdrop for free), and the Export menu uses `<details>`. Tabs and radio groups are hand-written with ARIA roles and arrow-key handling.
- **Why:** These few primitives work well natively. Radix becomes worth it with the Phase 2 component set (popovers, tooltips, toggle groups, dropdown menus with typeahead).
- **Consequences:** Swap to Radix as part of the Storybook component library work. `<details>` menus don't close on outside click; acceptable for now, revisit with Radix.

## DEC-024 · "Fit" fits the whole scene, not just the steps
- **Date:** 2026-11-10 · **Serves:** VIS-07, VIS-06
- **Decision:** On open, and from the Fit control, the canvas calls `fitBounds` with the export scene's bounds (title, lanes, legend, conditions). React Flow's default fit button is replaced.
- **Why:** The browser test showed React Flow's `fitView` frames only the step nodes, which cut off the lane headers, the title and the legend. Those are part of the diagram's meaning (DS principle 2).

## DEC-025 · Dev server: run Vite via npm in the background; launch config uses an absolute node path
- **Date:** 2026-11-10 · **Serves:** developer tooling only
- **Decision:** `.claude/launch.json` runs `/usr/local/bin/node node_modules/vite/bin/vite.js apps/web`. The dev script binds to the default `localhost` (`--strictPort`).
- **Why:** Starting the server from the browser pane with `npm` produced no process and no logs, probably because `npm`/`node` aren't on that launcher's PATH. Running `npm run dev` from the shell works.
- **Consequences:** Run `npm run dev` from a terminal and open http://localhost:5173.
