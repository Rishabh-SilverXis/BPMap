# Execution Flow

How execution actually travels between functions and modules: **what calls what, in what order**, and **which part of the path is being modified right now**. This file describes the code as it *is*. The plan is in [ARCHITECTURE.md](ARCHITECTURE.md), and the reasons are in [DECISIONS.md](DECISIONS.md).

Legend: `→` calls / passes data to · `⇢` async (worker message, promise, timer) · 🔧 = being modified now · ✅ = built and verified · ⏭ = next · 🗑 = removed

---

## Current work

> **Increment 1.1 ✅ complete**: fixes from the first real Workday export (DEC-026 to DEC-033). Built, tested (108 tests) and checked in the browser against the real file (kept in the git-ignored `.local/`).
>
> ⏭ **Next (Increment 2):** Playwright e2e with the automated network-privacy test, a screen-reader step list, CI and import-boundary lint, then Phase 2 (three views, scenarios, PDF/PPTX export, more health rules).
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
 ├ import '@xyflow/react/dist/style.css', './index.css'  (Tailwind v4 + @bpmap/design-tokens/tokens.css)
 ⇢ hydrateFromStorage()                       persistence/db.ts
 │    ├ db.kv.get('project'), db.kv.get('mappingProfiles')     Dexie / IndexedDB
 │    ├ for each stored definition → parseDefinition()          @bpmap/model (zod gate; invalid → dropped)
 │    ├ isOverlay() for each stored overlay
 │    └ untracked(() → useStore.setState({...}))               store.ts (undo tracking paused)
 ├ startAutosave()                            persistence/db.ts  → useStore.subscribe(...) (see §5)
 └ root.render(<App/>)                        app/App.tsx
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

Runs on every change of the active definition, its overlay, or the theme. Stored definitions are passed through `withFreshStageKeys` on load (DEC-026 migration).

```
<Workspace theme onToast>                                  app/Workspace.tsx (lazy)
 ├ useActiveDefinition(), useActiveOverlay()               store/store.ts selectors
 ├ useDiagram(def, overlay, theme)                         app/derive.ts  — useMemo, pure
 │    ├ buildGraph(def, { hiddenStepIds, laneNames })      packages/engine-graph
 │    │     ├ visible steps sorted by (stageKey, sourceRow)
 │    │     ├ lanes by first appearance; service/integration → system lanes last; renames applied
 │    │     ├ stages: one per stageKey; parallel = > 1 step; label "Step k · 6 in parallel"
 │    │     └ transitions: consecutive stages (i → i+1)
 │    ├ layout(graph)                                      packages/engine-layout
 │    │     ├ lane height = stack depth × node + padding
 │    │     ├ stage x/width (wider when parallel; +96 px when it holds a conditional approval)
 │    │     ├ nodes right-aligned in the column, stacked within a cell
 │    │     ├ diamonds before conditional approvals: "yes-" edge in, "skip-" edge under & after (DEC-032)
 │    │     ├ split/join bars + stubs (stubs enter the diamond when there is one)
 │    │     ├ transitions routed in the gutter between columns (DEC-013), entering diamonds
 │    │     └ start marker → first stage; last stage → end marker
 │    ├ runRules(def)                                      packages/engine-rules  (HC-16 → Health tab)
 │    └ buildExportScene(def, graph, L, theme, { labels, notes })   packages/scene
 │          ├ header (title + summaryLine)
 │          ├ translate(buildDiagramScene(...), EXPORT_DIAGRAM_OFFSET)
 │          │     lanes · stage headers · edges (Yes / "No, skip" pill labels) · decisions
 │          │     ("C5 and C6?") · markers · bars · step groups (kind tag, wrapText title,
 │          │     C-badges, N badge, completion ✓; dashed amber if conditional)
 │          ├ legend (≤ 290 px columns, DEC-033) · condition list (≤ 600 px columns) · footer
 │          └ colours from nodeTokens(theme)/semantic[theme]   packages/design-tokens
 ├ <DefinitionTabs/> · <Toolbar diagram/> · <StatusBar diagram/>   (summaryLine, warnings, save state)
 ├ <DiagramCanvas diagram theme/>                          features/canvas/DiagramCanvas.tsx
 │    ├ nodes = layout.nodes → { position: n + EXPORT_DIAGRAM_OFFSET, width, height, selected, ariaLabel,
 │    │                           data: { step, label, note, tokens, surface } }
 │    ├ <ReactFlow onInit → fitScene()>   fitBounds(scene bounds), not node bounds (DEC-024)
 │    │    ├ <ViewportPortal><SceneSvg scene skip={['step']}/></ViewportPortal>   background = export scene
 │    │    ├ nodeTypes.step → <StepNode/>   features/canvas/StepNode.tsx  (same rules as scene step group)
 │    │    └ <Controls> (custom Fit button) · <MiniMap>
 │    └ selection: onNodesChange('select') / onPaneClick → store.select(id | null)
 └ <RightPanel diagram/>                                   features/panels/RightPanel.tsx
      ├ tab "Step"   → StepPanel: details (restriction, alternate, routing, run-as, validations,
      │               notifications for this step), "Runs only if" conditions, Customise fields (§4)
      ├ tab "Health" → HealthPanel: diagram.findings → "Show step" → store.select(stepId)
      └ tab "Import report" → ReportPanel: stats, sheets, definition settings, custom notifications, warnings
```

## 4. Customise + undo ✅

```
StepPanel input/textarea/checkbox onChange
 → store.setLabel | setNote | setHidden (stepId, value)          store/store.ts
    → withOverlay(key, f)
       ├ undoBoundary(`${defId}|${key}`)   different field → flush pending undo group (DEC-019)
       └ set({ overlays: { ...overlays, [defId]: f(current) } })
          ⇢ zundo temporal: handleSet wrapped by coalesce(…, 500 ms) → one pastStates entry per burst/field
 → useActiveOverlay() changes → useDiagram recomputes graph/layout/scene (§3)
 → autosave (§5)
Toolbar Undo/Redo → useStore.temporal.getState().undo()/redo()   (only `overlays` is tracked)
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
Toolbar → run(fn, okText) → toast                          app/Workspace.tsx
 ├ Export ▸ SVG          → svgBlob(def, scene) → toSvg(scene, title)   packages/scene → download()
 ├ Export ▸ PNG (2×)     → pngBlob(def, scene): svgBlob → blob: URL → <img>.decode() → canvas 2× → toBlob
 ├ Copy image            → navigator.clipboard.write([ClipboardItem({'image/png': pngBlob(...)})])
 ├ Export ▸ Project file → projectBlob(definitions, overlays) → .bpmap.json
 └ Open project          → readProjectFile(file): size ≤ 25 MB → JSON.parse → format/version check
                            → parseProject (zod) → isOverlay → store.replaceProject (untracked)
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
