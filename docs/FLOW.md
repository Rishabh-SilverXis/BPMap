# Execution Flow

How execution actually travels between functions and modules: **what calls what, in what order**, and **which part of the path is being modified right now**. This file describes the code as it *is*. The plan is in [ARCHITECTURE.md](ARCHITECTURE.md), and the reasons are in [DECISIONS.md](DECISIONS.md).

Legend: `→` calls / passes data to · `⇢` async (worker message, promise, timer) · 🔧 = being modified now · ✅ = built and verified · ⏭ = next · 🗑 = removed

---

## Current work

> **Phase 2 ✅ complete** (Increment 2.4: DEC-052..054): subprocess linking and multi-file import, layout nudges (Arrange), and scenario answers/presets that survive condition renumbering. 149 unit + 21 e2e tests. EXP-09 (account-gated formats) waits for the Phase 3 backend.
>
> ⏭ **Phase 3** (per PRD §14): condition-rule and security-policy import (IMP-09/10), test plans (SCN-04/05), definition comparison (CMP-01..04), opt-in AI assist.
>
> No path is being modified at the moment.

---

## 1. Startup ✅

```
index.html
 ├ <script src="./theme-init.js">            public/theme-init.js   (sets data-theme / .system-dark before paint)
 └ <script type=module src="/src/main.tsx">
main.tsx
 ├ import '@fontsource-variable/inter'        self-hosted font files (no third-party request)
 ├ import './index.css'                       (Tailwind v4 + @bpmap/design-tokens/tokens.css)
 ⇢ import('./persistence/db.ts')              separate chunk, Dexie + zod (DEC-044); failure → render in memory
 ⇢ hydrateFromStorage()                       persistence/db.ts
 │    ├ db.kv.get('project'), db.kv.get('mappingProfiles')     Dexie / IndexedDB
 │    ├ for each stored definition → parseDefinition()          @bpmap/model (zod gate; invalid → dropped)
 │    ├ isOverlay() for each stored overlay
 │    └ untracked(() → useStore.setState({...}))               store.ts (undo tracking paused)
 ├ startAutosave()                            persistence/db.ts  → useStore.subscribe(...) (see §5)
 └ .finally → root.render(<App/>)                        app/App.tsx
App
 ├ useResolvedTheme()                         app/derive.ts  (pref from store + matchMedia → 'light' | 'dark')
 ├ <TopBar/>  (logo, "Local only" chip, theme toggle → store.setThemePref → localStorage)
 ├ <ImportError/>                             features/import/ImportDialogs.tsx
 ├ definitions.length === 0 ? <ImportScreen/> : <Suspense><Workspace/></Suspense>   (lazy chunk, DEC-022)
 └ <MappingDialog/>                           (opens only when importState = needs-mapping)
```

## 2. Import: file → model ✅

```
<DropZone> onDrop / <input type=file> onChange        features/import/ImportScreen.tsx
   (or "Try the synthetic sample": fetch('./sample-change-job.xlsx') → File)
 → store.importFiles(files)                            store/store.ts
    → runImport(first, bytes, mapping?, queue=rest)
       ├ set importState = { reading, fileName }        → DropZone shows spinner
       ⇢ importFile(bytes.slice(), { fileName, mappingProfiles, mapping? })   workers/importClient.ts
       │   └ lazily new Worker(import.worker.ts) + Comlink.wrap
       │   ⇢ Comlink.transfer(bytes) ──► import.worker.ts: api.importFile(bytes, opts)
       │                                   → importWorkbook(bytes, opts)        packages/importer-xlsx (§2a)
       │   ◄── ImportOutcome (plain object)
       ├ 'error'          → set importState = { error, message }   → <ImportError> alert
       ├ 'needs-mapping'  → set importState = { needs-mapping, bytes, outcome, queue } → <MappingDialog>
       │      user picks columns → store.applyMapping(map) → runImport(file, bytes, { fingerprint, map }, queue)
       └ 'ok' → untracked(set({ definitions (replace by id or append), reports[id], overlays[id] ??= empty,
                                activeId = id, panel = warnings ? 'report' : panel,
                                mappingProfiles[fingerprint] = map (if explicit) }))
              → next file in queue → runImport(...)
```

### 2a. Inside `importWorkbook` (pure, same code in worker and Node tests) ✅

```
importWorkbook(bytes, opts)                               packages/importer-xlsx/src/index.ts
 ├→ readWorkbook(bytes, limits)                           xlsx.ts
 │    ├ size ≤ 25 MB → magic bytes "PK"
 │    ├ fflate.unzipSync(bytes, { filter })               filter runs BEFORE inflate per entry:
 │    │     entries ≤ 2000, Σ originalSize ≤ 150 MB → else XlsxError(E-ZIP-LIMITS)
 │    ├ XMLParser: workbook.xml → rels → sharedStrings → worksheets/sheetN.xml
 │    └ per sheet: typed cell text (s | inlineStr | b | str/n/e) → SheetGrid   (raw text, NOT decoded)
 ├→ per sheet: sectionTitle(rows)          mapping.ts   one-cell title row → steps | notifications | other   (DEC-028)
 │      steps → findStepsHeader (≥ 4 fields); no title → findStepsHeader ▸ looksLikeNotifications ▸ ignored
 ├→ no Steps sheet → bestGuessHeader → mapping from opts.mapping | opts.mappingProfiles | needs-mapping
 ├→ choose map: explicit ▸ saved profile ▸ auto (17 columns)  → missingRequired? → needs-mapping
 ├→ normaliseSteps({ rows, headerRowIndex, map, preamble, … })   normalise.ts
 │    ├ get(row, field) → decodeCell()     decode.ts   "&#xa;" → "\n", entities → chars (DEC-027)
 │    │                    hasEncodingResidue() counts leftovers → W-ENCODING
 │    ├ parsePreamble(): effective date (excelDate), due date, autocomplete, Initiating Security Groups
 │    ├ processName(): Step label regex ▸ "Edit Business Process Definition: X (Y)" ▸ file name
 │    ├ drafts: stageKeyOf(order)  (alphabetical, DEC-026), kindOf(type), cellLines(groups),
 │    │         cellLines(conditions) + "(Workday Owned)", splitAdditionalInfo (restriction/alternate),
 │    │         parseValidations (severity), routing, runAs, all, doNotAdvance, dueOnEffectiveDate, complete
 │    ├ makeStepIds(drafts)                               @bpmap/model ids.ts → W-DUP-STEP
 │    ├ row order vs stage-key order → W-ORDER-MISMATCH
 │    ├ conditions: sort by (stageKey, sourceRow) → dedupe by normalised text → C1…Cn
 │    └ warnings: ORDER-UNPARSEABLE, KIND-UNKNOWN, GROUP-EMPTY, NO-INITIATION, truncation, ENCODING
 ├→ parseNotifications(notificationsSheet, steps)         notifications.ts   (DEC-029)
 │    ├ "System Notifications" table → kind:'system', linked by order (+ specify)
 │    └ "Custom Notifications" table → kind:'custom', trigger "On Exit : o - …" → step o; else unlinked
 │          unlinked > 0 → W-NOTIF-UNLINKED
 ├→ parseDefinition(draft)                                @bpmap/model (zod gate)
 └→ { ok, definition, stats, sheets, mappingUsed }
```

## 3. Model → screen (derivation) ✅

Runs on every change of the active definition, its overlay, its scenario, its view, or the theme. Stored definitions pass through `withFreshStageKeys` on load (DEC-026).

```
<Workspace theme onToast>                                  app/Workspace.tsx (lazy)
 ├ useActiveDefinition(), useActiveOverlay(), useActiveScenario(), useActiveView()   store selectors
 ├ useDiagram(def, overlay, scenario, view, theme)         app/derive.ts  — useMemo, pure
 │    ├ evaluateScenario(def, answers)                     packages/engine-scenario
 │    │     → skipped (steps with a "no"), resolved (conditions answered "yes"), summary
 │    ├ buildGraph(def, { hiddenStepIds: overlay.hidden ∪ skipped, laneNames,
 │    │                   resolvedConditionIds, decisionConditionIds })      packages/engine-graph
 │    │     ├ visible steps sorted by (stageKey, sourceRow); lanes by first appearance; system lanes last
 │    │     ├ GraphStep: conditional (open conditions), openConditionIds, decision (approval | toggled)
 │    │     └ stages (parallel when > 1 step) + transitions i → i+1
 │    ├ layout(graph, { nodeHeight: 76 | 140 (configurator) })   packages/engine-layout
 │    │     ├ lanes, stages (+96 px when a step has a decision), nodes right-aligned, stacked
 │    │     ├ diamonds: "yes-" edge in, "skip-" edge under & after (DEC-032)
 │    │     ├ split/join bars; gutter-routed transitions (DEC-013); start / end markers
 │    ├ buildExportScene(def, graph, L, theme, { labels, notes, view, subtitle: scenario })   packages/scene
 │    │     ├ view === 'executive' → buildExecutiveDiagram → executiveLayout (stage cards, DEC-035)
 │    │     │  else buildDiagramScene (lanes · headers · edges · decisions · markers · bars · steps;
 │    │     │       configurator adds clampMeta(stepMetaLines(step)) lines)
 │    │     └ header (view · summary · scenario) · legend (per view) · condition list · footer
 │    └ runRules(def)                                      packages/engine-rules (full definition, no scenario)
 │          └ buildGraph(def) → HC-01..07, HC-16 → findings sorted by severity
                (HC-04/05/06 skip neverRuns(def) steps; HC-04 skips areExclusive pairs, DEC-041)
 ├ <DefinitionTabs/> · <Toolbar/> (view radiogroup → store.setView, undo/redo, export) · <StatusBar/> (scenario summary)
 ├ <DiagramViewer diagram theme/>                          features/canvas/DiagramViewer.tsx (DEC-042)
 │    ├ scroll container (overflow:auto, ResizeObserver) → zoom: user | fitHeight/fitWidth clamped 60–100%
 │    ├ sized box (scene × zoom)
 │    │    ├ sticky layer (viewport-wide, pointer-events none):
 │    │    │    ├ lane column: translate(laneHeaderItems(lane)) at the scene's own coordinates   (not in Executive)
 │    │    │    └ furniture: scene groups header/legend/conditions/footer, when they fit the width (DEC-043)
 │    │    └ scaled layer: <SceneSvg skip={['step', …furniture if pinned]}/> + <StepNode> buttons at node + EXPORT_DIAGRAM_OFFSET
 │    ├ zoom toolbar (−/+, 100%, Fit height, Fit width); Ctrl/⌘ + wheel → zoomTo(z, cursor) keeps the point under the cursor
 │    └ selection: StepNode onClick → store.select(id); background click → select(null);
 │                 selectedStepId change → scrollIntoView(center)
 └ <RightPanel diagram/>                                   features/panels/RightPanel.tsx
      ├ Step     → details, validations, notifications, conditions, Customise (§4)
      ├ Scenario → ScenarioPanel: setAnswer · toggleDecision · reset · save/apply/delete preset (§4)
      ├ Health   → findings grouped by rule; badge = open critical + warning (DEC-037); Dismiss… / Restore (§4)
      └ Import   → stats, sheets, definition settings, custom notifications, warnings
```

## 4. Customise, scenario, dismissals + undo ✅

```
StepPanel input/textarea/checkbox onChange
 → store.setLabel | setNote | setHidden (stepId, value)          store/store.ts
    → withOverlay(key, f)
       ├ undoBoundary(`${defId}|${key}`)   different field → flush pending undo group (DEC-019)
       └ set({ overlays: { ...overlays, [defId]: f(current) } })
          ⇢ zundo temporal: handleSet wrapped by coalesce(…, 500 ms) → one pastStates entry per burst/field
 → useActiveOverlay() changes → useDiagram recomputes graph/layout/scene (§3)
 → autosave (§5)
ScenarioPanel → store.setAnswer | toggleDecision | resetScenario | savePreset | applyPreset | deletePreset
 → withScenario(key, f) → undoBoundary(`${defId}|scenario|${key}`) → set({ scenarios: {...} })
HealthPanel FindingCard → store.dismissFinding(fp, reason) | restoreFinding(fp) → withOverlay(...) (overlay.dismissedFindings)
Toolbar view radiogroup → store.setView(view) → views[defId]   (persisted, not undoable)
Toolbar Undo/Redo → useStore.temporal.getState().undo()/redo()   (`overlays` + `scenarios` are tracked)
```

## 5. Autosave ✅

```
useStore.subscribe((s, prev) => …)                         persistence/db.ts
 ├ unchanged definitions/overlays/activeId/mappingProfiles → return
 ├ set saveState = 'saving'                                → StatusBar "Saving…"
 ⇢ 500 ms debounce → db.kv.bulkPut([{ project }, { mappingProfiles }])
      ├ ok   → saveState = 'saved'        → "Saved in this browser"
      └ fail → saveState = 'unavailable'  → "Browser storage unavailable: export a project file…"
```

## 6. Export & project file ✅

```
Toolbar ▸ Export menu → run(fn, okText) → toast                     app/Workspace.tsx
 page()  = { name, scene } for the active definition, derived with theme 'light' (DEC-046)
 pagesFor(def, withConditions) = deriveDiagram(def, overlay, scenario, view, 'light')            app/derive.ts
            → [diagram scene, buildConditionsScene(def, 'light', plainWords)?]                    packages/scene/pages.ts
 page()  = pagesFor(active)[0]  (SVG / PNG)    pages() = pagesFor(active, true)  (PDF / PowerPoint / draw.io)
 pack()  = [buildCoverScene(entries: name, view, summary, open findings), ...pagesFor(each, true)]
 │
 ├ This view ▸ PDF        ⇢ import('./pdf.ts') → pdfBlob([page]) → toSvg → toWinAnsi(text)
 │                           → jspdf + svg2pdf (lazy, ~150 KB) → one page per scene
 ├ This view ▸ PowerPoint ⇢ import('@bpmap/exporters') → buildPptx(slides) → flatten(scene)
 │                           → pptxgenjs native shapes, lines per segment, ≤ 56 in → .pptx blob
 ├ This view ▸ draw.io    ⇢ toDrawio([page]) → flatten(scene) → escaped mxCell XML → .drawio
 ├ This view ▸ SVG / PNG  → svgBlob(def, scene) → toSvg  ·  pngBlob: svg → <img> → canvas 2×
 ├ All N definitions ▸ PDF / PowerPoint / draw.io → same functions with pack() (one page/slide each)
 ├ This view ▸ Excel      ⇢ xlsxBlob([{def, overlay, findings}]) → workbookSheets (Steps · Conditions · Health)
 │                           ⇢ import('@bpmap/exporters') → buildXlsx(sheets) → fflate zipSync  features/export/workbook.ts
 ├ All N ▸ Excel pack      → same with every definition (+ Definition column)
 ├ Copy image             → navigator.clipboard.write([ClipboardItem({'image/png': pngBlob(...)})])
 ├ Project ▸ file         → projectBlob(definitions, overlays) → .bpmap.json
 ├ Project ▸ Customisations only → customisationsBlob(def, overlay, scenario, view) → .customisations.json
 └ Open                   → readBpmapFile(file): size ≤ 25 MB → JSON.parse → format?
       ├ 'bpmap'                → readProjectFile → parseProject (zod) → store.replaceProject (untracked)
       └ 'bpmap-customisations' → normaliseOverlay → match def by process+variant (sameDefinition)
                                  → store.applyCustomisations (merge, one undo step) | error "Import that definition first"
```

## 6a. Re-import, focus, step list ✅

```
importFile(same definition) → store.addDefinition (replaces by process+variant)
  → RightPanel ▸ Import tab → OrphanNotice: findOrphans(overlay, stepIds, laneIds)   store/overlay.ts
       → "N customisations no longer match a step" + text → Remove → store.removeOrphans
       → withOverlay(...) → withoutOrphans (undoable)
Toolbar ▸ Focus on a role → store.setFocusLane(id) → DiagramViewer: dimmed-lane bands over other
       lanes + steps whose laneId ≠ focus at opacity 0.3 (setActive resets focus)
       → effect (on focus change only) → scroller.scrollTo(first step of lane, right of frozen column)
       → Toolbar ‹ › stepper: roleSteps (lane nodes by x, y) → store.select(id) → viewer centres it
DefinitionTabs ▸ × → store.removeDefinition (untracked; stash in lastRemoved; clear undo history)
       → App toast "Closed … · Undo" (10 s) → store.restoreRemoved (same tab index) | forgetRemoved
Scenario panel ▸ In plain words → store.setConditionText(conditionKey(text), words) → overlay.conditionText
       → deriveDiagram: plainConditions(def.conditions, overlay) → Diagram.conditionText + scene decor
       → condition list / panels / step list / Excel / conditions page show plain words + "Workday: …"
Import (several files, ≤ MAX_FILES = 20) → store.importFiles → runImport queue (one at a time)
       → extra files → importNotice banner (App)
       → per file: rekeyScenario(oldDef, newDef, scenario)   engine-scenario: answers/decisions/presets by condition text
useSubprocessLinks() → linkSubprocesses(definitions)          @bpmap/model links.ts (exact name → process → task)
       → Step panel SubprocessLinkRow: Open → store.openSubprocess(toId, {defId, stepId}) → cameFrom
       → DefinitionTabs: ↳ marker on linked tabs · "← Back" chip → store.backFromSubprocess (re-selects step)
       → Import tab SubprocessSummary: calls (linked / not loaded) · called by
Viewer ▸ Arrange: pointer drag (preview translate) → drop → store.setNudge(id, dx, dy) → overlay.nudges
       | arrow keys on focused step (8 / Shift 32) → setNudge | Reset layout → store.resetNudges
       → deriveDiagram: layout(graph, { nudges }) → step 4 places node + nudge, lane/column grow
       → diamonds, bars, gutter edges computed from moved nodes (edges follow automatically)
Toolbar ▸ Step list → store.setListMode → Workspace renders StepList (table, tbody per stage)
       instead of DiagramViewer; step button → store.select(stepId) → right panel
```

---

## 7. Tests & CI ✅

```
npm test → vitest (packages/*/src/**/*.test.ts): model · importer (golden files) · graph · layout · scene · scenario · rules
npm run e2e → playwright.config.ts → webServer: npm run build && npm run preview (CSP active, :4173)
   └ apps/web/e2e/*.spec.ts with channel 'chrome' (system Chrome)
        privacy.spec.ts: page.on('request') → assert same-origin, no bodies, no CSP violations (NFR-PRIV-01)
        privacy.spec.ts also downloads SVG, PDF, PowerPoint and draw.io under the CSP
        flows.spec.ts:   order + diamonds · scenario skip/reset · views · dismiss → reload → restore
                         · viewer · exports · focus role · step list · re-import orphans
.github/workflows/ci.yml → npm ci → typecheck → test → build + secret scan of dist → e2e (traces on failure)
npm run oracle -- <export.xlsx> → tools/oracle (stdlib Python) → expected.json; compared with our model,
   scenarios and views; real-export.local.spec.ts drives the UI with the oracle's counts (local only, DEC-039)
```

---

## Prototype v0 flow (archived in `archive/prototype-v0/`) 🗑

Replaced end-to-end in Increment 1. Kept for reference.

```
main.tsx → <App>
 ├ <UploadSection> → FileReader → base64 → App.handleUpload
 │    ⇢ analyzeTableImage (src/lib/gemini.ts) → GoogleGenAI in the browser (key in client, E1)
 │    → JSON.parse as FlowchartData (no validation, E7)
 ├ <FlowchartEditor> useMemo: array order → x += 300 (no parallel, D2); condition → diamond + "No" → initiation (D1)
 │    → Export PNG = toPng(wrapper DOM) (viewport only, E4)
 └ <DataVerification> → onRegenerate → canvas edits lost (E5)
```
