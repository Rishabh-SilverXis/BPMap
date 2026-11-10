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

---

# Increment 1.1: fixes from the first real Workday export (2026-11-11)

Source: a real *Change Job (Default Definition)* export (26 steps, 6 sheets), compared with the Incubane BP Visualizer's output for the same file. The file stays **out of git** (it contains company-specific names); it's kept locally in the git-ignored `.local/` folder for manual checks. An anonymised mirror is the new golden fixture (DEC-030).

## DEC-026 · Order letters sort alphabetically (corrects Architecture §7.4)
- **Decision:** `stageKeyOf` pads letters on the **right** (`"ba" → "ba_"`), so stage keys sort alphabetically: `a < ba < bb < bd < d`. Numeric suffixes still sort numerically (`k < k1 < k2 < k10 < m`). The importer adds `W-ORDER-MISMATCH` if the export's row order ever disagrees with this sort. Stored definitions get their stage keys recomputed on load (`withFreshStageKeys`), because keys written before this change used the old format.
- **Why:** The real export lists its rows as `a, ba, bb, bc, bd, d, e …`, and the Notifications sheet repeats that order, so Workday runs the `b*` reviews straight after initiation. Our previous rule (shorter letter runs first: `a…z`, then `aa…`) was a guess written into the architecture. It put `ba` to `bd` at the very end, **after** the process-complete step. Incubane's tool makes exactly the same mistake on this file.
- **Alternatives:** Use the file's row order as the stage order. Rejected as the primary rule because the renamed/shuffled fixture shows rows can be out of order; the order letters are the semantic source, and the row order is now a cross-check.
- **Consequences:** Architecture §7.4 is corrected. The old synthetic golden snapshot changed only in its `stageKey` strings.

## DEC-027 · Decode Workday's literal `&#xa;` before splitting; never split on `;`
- **Decision:**
  - `decodeCell` turns numeric entities (`&#xa;`, `&#10;`) and basic named entities into characters, and normalises line endings.
  - `cellLines` then splits on line breaks **only**.
  - Any entity left after decoding (double-encoding) raises `W-ENCODING` rather than being guessed at.
- **Why:** The real export writes in-cell line breaks as the literal text `&#xa;` (in the XML, `&amp;#xa;`), with list items separated by `&#xa;&#xa;`. Our old splitter also split on `;`, and `&#xa;` *ends* in `;`, so every multi-value cell broke apart. The effects:
  - a phantom condition `C2 = "&#xa"` attached to 11 steps;
  - stray `&#xa` text on 15 conditions;
  - two Workday-owned conditions labelled Custom;
  - duplicate conditions (37 instead of 34);
  - a phantom lane `"HR Administrator&#xa"`.

  And the import report said "no warnings".
- **Consequences:** Groups are no longer split on `;` either. A group name containing `;` stays intact.

## DEC-028 · Identify sheets by their section-title row
- **Decision:** Every sheet of the export has a one-cell title row ("Business Process Steps", "Notifications", "Allowed Actions by Role", "Allowed Services", "Related Links", "Available Rules & Fields"). The title decides the sheet's role, and header heuristics are only a fallback for files without titles. Recognised-but-unused sections are reported as "recognised, used in a later phase".
- **Why:** The old header heuristic marked the real Notifications sheet as *ignored* (its header row doesn't contain the word "notification") and the "Available Rules & Fields" sheet as *notifications* (a long data cell happened to mention notifications and recipients). The fallback heuristic now also ignores cells longer than 40 characters.

## DEC-029 · Parse notifications (MOD-09 brought forward) and read all 17 step columns
- **Decision:**
  - The importer now maps every column of the real Steps sheet: `Additional Information` (split into `restriction`, `alternate` and other text), `Routing Modifier`, `All`, `Run As User`, `Validation` (with severity), `Due Date Is Based On Effective Date`, `Do Not Advance`, `Subprocess Definitions`.
  - It also reads the definition settings above the table: effective date (Excel serial → ISO), most recent used date, overall due date, autocomplete, and **Initiating Security Groups**.
  - It parses the Notifications sheet's *System* and *Custom* tables. Notifications are linked to steps by order (`On Exit : o - …` → step `o`).
- **Why:** These fields were the Configurator-level detail the real file contained, but they were silently dropped (9 of 17 columns mapped, `initiatingGroups=[]`). Now that a real layout is known, parsing notifications is no longer speculation. DEC-009 deferred it only because the format was unknown.
- **Schema:** `Step` gains `validations` (default `[]`), `runAs` and `additionalInfo`. `ProcessDefinition` gains `meta` (default `{}`). `Notification` is reshaped (`kind`, `name`, `condition`, `disabled`, `stepOrder`). `SCHEMA_VERSION` stays 1 because every new field has a default, so older saved data still validates.

## DEC-030 · Anonymised mirror of the real export as a golden fixture
- **Decision:** `change-job-workday-layout.xlsx` is generated by the fixture script. It has the same sheets, title rows, preamble, all 17 columns, the literal `&#xa;` encoding, and the same order values (`a, ba…bd, d … v`). Conditions, groups and company wording are invented, and it includes `1=0?`-style conditions and a disabled custom notification. The real file is never committed.
- **Why:** The fixture policy (Architecture §21) requires anonymised fixtures. A mirror keeps every structural property that caused a bug, so each fix has a regression test.

## DEC-031 · First health rule: HC-16 "step can never run"
- **Decision:** New package `@bpmap/engine-rules` with the Architecture §11 shape (rules → findings with stable fingerprints). The first rule, **HC-16**, flags steps whose condition name is constant-false (`1=0?`, `1 = 0?`, `False?`, `Never?`). The web app gains a **Health** tab with finding cards (DS §9.7).
- **Why:** In the real export, steps `s` (Create Subordinate) and `s1` (Change Superior Organization) carry `1=0?`. That's a common Workday trick for switching a step off without deleting it, but both tools drew them as ordinary conditional steps, which misleads readers and testers.
- **Consequences:** HC-16 is added to the PRD rule catalogue (Markdown; the PDF is regenerated with the next PRD revision). Detection works on the condition *name*, because the export doesn't contain the rule logic. Rules HC-01 to HC-15 follow in Phase 2.

## DEC-032 · Decision diamonds on conditional approvals; start/end markers
- **Decision:**
  - Every conditional **approval** gets a decision diamond in a 96 px slot in front of it, with "Yes" into the step and a dashed amber **"No, skip"** path that runs under the step and rejoins after it. The diamond label reads in words, with IDs sorted: "C5 and C6?", "C3, C6 and C8?", or "4 conditions?" for more than three. Never "C5+C6".
  - The flow gets a start marker (green ring) and an end marker (navy ring).
  - Non-approval conditional steps keep the dashed outline and badges only (DS §9).
- **Why:**
  - This implements the Design System default that Increment 1 had deferred (DEC-013).
  - Incubane's "C5+C6?" labels are ambiguous (AND or OR?), and it also draws diamonds on some action steps, which contradicts its own rule.
  - The skip path rejoins *after* the step and never points backwards. The scene test "no backwards arrows" still holds.
- **Consequences:** The diamond slot widens only the columns that need it. The "No, skip" label sits on the line inside a surface-coloured pill (DS §10.4), after a browser check showed it crowding the step box.

## DEC-033 · Legend and condition list keep a fixed reading width
- **Decision:** Legend columns are capped at 290 px, and condition-list columns at 600 px, whatever the diagram's width.
- **Why:** The legend's columns were a quarter of the diagram's width, which spread the items across a 26-stage diagram about 4,000 px wide. The user's screenshot showed "Action or review" thousands of pixels from "Approval".

---

# Phase 2 · Increment 2.1: views, scenarios, health (2026-11-11)

Phase 2 ("Parity+") is split in two. **2.1** (this increment) covers views (VW-01/03/04), scenarios (SCN-01..03), health rules (HLT-01/02 with HC-01..07) and the Phase 1 leftovers that gate everything else (automated privacy e2e and CI). **2.2** covers exports (PDF, PPTX, draw.io), packs, re-import reconciliation (IMP-06), focus role (VIS-08) and the screen-reader step list.

## DEC-034 · Scenario semantics: "No" skips, "Yes" resolves, "Not set" may run
- **Decision:** New package `@bpmap/engine-scenario`. A step is skipped if any of its conditions is answered **No**. A condition answered **Yes** is *resolved*: it no longer makes a step conditional, so the dashed outline, its badge and the decision diamond disappear for that case. **Not set** leaves the step conditional (dashed).
  - `buildGraph` takes `resolvedConditionIds` and `decisionConditionIds`. `GraphStep.conditional` now means "has an *unresolved* condition", and `openConditionIds` drives badges and diamond labels.
  - Skipped steps are removed through the same `hiddenStepIds` path as overlay-hidden steps, so empty lanes and stages collapse with no extra code.
  - Scenario state (answers, decisions, presets) is stored per definition, persisted, included in project files, undoable like overlays, and pruned to existing conditions on re-import.
- **Why:** Architecture §10.1 defined skipping. Resolving "Yes" answers is what makes a scenario diagram *read* as a single path rather than a sea of dashed boxes.
- **Verified on the real export:** C6 = No removes the four approvals (26 → 22 steps, lanes 11 → 7), and save / reset / re-apply of a preset works.

## DEC-035 · Views: Configurator = detail lines; Executive = stage cards from the scene
- **Decision:**
  - **Configurator:** boxes are 140 px tall, with up to 4 detail lines from `stepMetaLines` (due, alternate, routing, restriction, extra groups, run-as, validations, notifications, do-not-advance; "+n more" beyond 4). The scene and the canvas node use the same function.
  - **Executive:** `executiveLayout` (engine-layout, text measurement injected) places one card per stage, 6 per row, snaking arrows between rows. `buildExecutiveDiagram` draws the cards with a dot per step coloured by kind, the title, and a caption "lane · only if C… · process complete". The canvas shows Executive as background only (no interactive nodes).
  - The view is stored per definition (VW-04), drives exports, and is named in the export subtitle.
- **Why:** Matches DS §11's view matrix. Text measurement stays in the scene package, so layout remains font-free and testable.
- **Bug caught in the browser:** the first Executive render showed only arrows. The cards had the scene role `step`, which the canvas deliberately skips because React Flow draws steps live. Cards now have their own role, `stage-card`, plus a unit test and an e2e assertion (26 cards).

## DEC-036 · Health rules HC-01..HC-07: rules skip themselves when their column is missing
- **Decision:** Rules receive `{ def, graph, settings }`, with `maxSerialApprovals = 4` and `maxTasksPerStage = 3`.
  - HC-01, HC-02 and HC-03 return nothing when no step in the export has a value for the column they rely on (restriction, alternate, due date).
  - HC-07 is a single summary finding, not one per condition.
  - HC-02 ignores optional steps and "Employee As Self" / "Initiator" groups.
  - Health always runs on the **full** definition, not the scenario.
- **Why:** Without the skip, an export that lacks a column (like our synthetic sample) would produce a wall of false "critical" findings. On the real-layout fixture, HC-01 correctly flags approval `i`, which is restricted to "Subject" only, so the initiator could approve. The real file has the same pattern.
- **Dismissals (HLT-02):** each finding can be dismissed with a reason. Dismissals are stored in the overlay by fingerprint (so they're undoable and survive re-import) and can be restored from a "Dismissed" list. Older stored overlays without `dismissedFindings` are upgraded on load (`normaliseOverlay`).

## DEC-037 · Health badge counts Critical + Warning only
- **Decision:** The tab badge shows open Critical + Warning findings. Info findings are listed, grouped by rule (groups with more than 3 findings start collapsed), but don't count.
- **Why:** On the real export the badge first read **34**, mostly Info ("no due date"). A number that large reads as "everything is broken" and trains people to ignore it. It now reads 14.

## DEC-038 · E2E with Playwright on the system Chrome; CI on GitHub Actions
- **Decision:** `@playwright/test` with `channel: 'chrome'` runs against the **production build** (`vite preview`, CSP active).
  - `privacy.spec.ts` (NFR-PRIV-01) records every request through import → three views → scenario → Health → SVG export, and asserts no off-origin request, no request body and no CSP violation.
  - `flows.spec.ts` covers Workday order and diamonds, scenario skip and reset, views, and the dismiss → reload → restore cycle.
  - `.github/workflows/ci.yml` runs typecheck → unit tests → build with a secret scan of `dist/` → e2e, uploading traces on failure. Browser download is skipped; the runner's Google Chrome is used.
- **Why:** The privacy promise is the product's main differentiator (PRD §2.2), so it must be enforced by a test, not by a manual check. Using the installed Chrome avoids a large browser download on every machine.
- **Results:** 5/5 e2e tests pass locally. The first run failed in 2 tests because of an ambiguous test locator (`'No'` also matched "**No**t set"), fixed with `exact: true`.
- **Consequences:** Actions are pinned to major tags (`@v4`); pinning to commit SHAs is a follow-up once Renovate is set up. Bundle check: initial JS is 169 KB gzip + 8 KB CSS = **177 KB of the 180 KB budget**. Increment 2.2 must move the zod validation of stored data off the initial chunk before adding more to it.

## DEC-039 · Verify against an independent oracle, not against ourselves
- **Date:** 2026-11-11 · **Serves:** NFR-QUAL, Architecture §21
- **Decision:** `tools/oracle/workday_export_oracle.py` re-parses Workday exports with Python's standard library and its own implementation of the rules. Cross-checks compare our model, scenarios and views with it. A local-only Playwright spec (`real-export.local.spec.ts`) drives the real UI against a private file and the oracle's expected counts, and skips when either is absent.
- **Why:** Golden snapshots only prove the importer is *stable*, not *right*. Both earlier real-file bugs (DEC-026, DEC-027) would have passed our own snapshots. Results are in `docs/testing/TEST_REPORT_2026-11-11.md`: 1,116 scenario × view renders, 70/73 checks, 23/23 edge cases, 4/4 real-UI tests. The 3 failures (F-01..F-03) plus a rule false positive (F-04) are open.

## DEC-040 · Executive captions: one fact per line (fixes F-01, F-02, F-03)
- **Date:** 2026-11-11 · **Serves:** VW-01, test report F-01..F-03
- **Decision:** Under each step title, the Executive card now draws separate lines:
  1. the lane;
  2. the **full** "only if C5, C6, C7 and C8" list (`conditionPhrase(ids, Infinity)`, wrapped to at most 2 lines; never collapsed to "4 conditions");
  3. "✓ Process complete after this step" in the success colour.

  Card heights are measured from the same lines. The export header now adds "effective 2026-11-10 · overall due 1 Week" from `def.meta`.
- **Why:** The single joined caption was cut at one line, so "process complete" vanished in all 224 scenarios where step `o` is visible, and long condition lists became "only if 4…". Separate lines mean no fact competes with another for space. The dates were already parsed (DEC-029) but never shown.
- **Verified:** oracle cross-check 73/73 (was 70/73). New unit regression test on the real-layout fixture. Visual check on the real file.

## DEC-041 · Flow rules ignore steps that never run and mutually exclusive pairs (fixes F-04)
- **Date:** 2026-11-11 · **Serves:** HLT-01, test report F-04
- **Decision:**
  - HC-04, HC-05 and HC-06 skip steps guarded by a constant-false condition (the HC-16 set).
  - HC-04 also skips a pair when one step's condition is the single-negation of the other's (`areExclusive`: "Country is NOT Canada?" vs "Country is Canada?", "isn't" vs "is"), because the two steps never both run.
- **Why:** On the real export, HC-04 reported "HR Administrator acts at s and again at s1" (both can never run) and "Employee As Self acts at t and again at t1" (mutually exclusive by country). Both were false positives that would erode trust in Health.
- **Limits:** Exclusivity is inferred from condition *names* only. The export doesn't contain rule logic, so complementary rules with different wording (e.g. "Hourly?" vs "Salaried?") are not detected. Revisit when condition-rule import (IMP-09) lands.

## DEC-042 · Replace the pan/zoom canvas with a scrolling viewer and a frozen lane column
- **Date:** 2026-11-11 · **Serves:** user request ("fixed canvas, scroll, first column frozen"), VIS-07, NFR-A11Y. Supersedes "React Flow (keep)" in Architecture §11.2 and §15.
- **Decision:**
  - `DiagramViewer` puts the scene at a **fixed zoom** inside a native `overflow: auto` container. You scroll with the wheel, trackpad, scrollbars or the keyboard.
  - The **lane-name column is `position: sticky; left: 0`**, drawn with the same `laneHeaderItems` as the scene at the same coordinates. At scroll 0 it sits exactly over the scene's headers; when scrolled it stays pinned, with a shadow.
  - **Zoom:** −/+ steps (30–200%), click the percentage for 100%, "Fit height" / "Fit width", and Ctrl/⌘ + wheel (or pinch) zooms around the cursor. The default is fit-height for swimlanes and fit-width for Executive, clamped to **60–100%** so text stays readable.
  - Steps are focusable `<button>`s (`data-testid="step"`, `aria-pressed`), and "Show step" scrolls the selected step to the centre.
  - **React Flow is removed** (dependency, provider, CSS) along with its minimap.
- **Why:** In React Flow, wide processes (26 stages ≈ 6,800 px) opened fitted to a tiny scale and had to be dragged around. You lost track of which lane you were in. Steps are never dragged or connected (the layout is deterministic), so the library only added free panning, which is exactly what hurt readability.
- **Results:**
  - Workspace chunk **65 KB → 13 KB** gzip; CSS 8.2 → 6.4 KB.
  - Tests: 122 unit, 10 e2e (incl. a new viewer test: frozen column at the left edge after scrolling 1,500 px; zoom controls).
  - Browser-verified on the real export: frozen lanes after scrolling 1,900 px; Ctrl+wheel 100% → 165% while plain wheel scrolls; Show step centres step `s`.
- **Consequences:**
  - Stage headers ("Step k") scroll away vertically. A frozen top row is a possible follow-up.
  - Free-form node dragging (VIS-11 nudges) will need its own pointer handling when it's built.
  - Architecture §11.2/§15 are updated to match.
