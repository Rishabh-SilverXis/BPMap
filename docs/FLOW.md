# Execution Flow

How execution actually travels between functions and modules: **what calls what, in what order**, and **which part of the path is being modified right now**. This file describes the code as it *is*. The plan is in [ARCHITECTURE.md](ARCHITECTURE.md), and the reasons are in [DECISIONS.md](DECISIONS.md).

Legend: `→` calls / passes data to · `⇢` async (worker message, promise, timer) · 🔧 = being modified now · ✅ = built and verified · ⏭ = next · 🗑 = removed

---

## Current work

> **Increment 1 ✅ complete** (Phase 0 + the Phase 1 core). Every path below is built, unit-tested (92 tests) and was exercised in the browser (dev and production builds).
>
> ⏭ **Next (Increment 2, rest of Phase 1):**
> 1. Playwright e2e with the automated *network-privacy* test (NFR-PRIV-01). Today this is checked manually.
> 2. A screen-reader step list (`role="treegrid"`) and keyboard navigation between steps (NFR-A11Y).
> 3. CI pipeline and ESLint import-boundary rules (Architecture §5, §20).
> 4. Replace the synthetic fixtures with anonymised real exports (T1). This needs files from you.
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
 │    │     keep only workbook.xml, workbook.xml.rels, sharedStrings.xml, worksheets/*.xml
 │    ├ XMLParser.parse(workbook.xml) → sheet names + r:id → rels → worksheets/sheetN.xml
 │    ├ sharedStrings → itemText(si)   (plain <t> or rich-text runs)
 │    └ per sheet: rows/cells → colIndex("C12") → typed text (s | inlineStr | b | str/n/e) → SheetGrid
 ├→ per sheet: findStepsHeader(rows, 15) (≥ 4 fields) ▸ looksLikeNotifications ▸ ignored   mapping.ts
 ├→ no Steps sheet → bestGuessHeader → mapping from opts.mapping | opts.mappingProfiles
 │        └ none / incomplete → return { needs-mapping, fingerprint, headers, suggested, missing }
 ├→ choose map: explicit ▸ saved profile ▸ auto  → missingRequired? → needs-mapping
 ├→ normaliseSteps({ rows, headerRowIndex, map, preamble, … })   normalise.ts
 │    ├ data rows = below header with order or type
 │    ├ processName(): Step label regex ▸ preamble title ▸ file name (+ W-PROCESS-NAME-GUESSED)
 │    ├ drafts: stageKeyOf(order), kindOf(type), lines(groups), condition lines (+ "(Workday Owned)")
 │    ├ makeStepIds(drafts)                               @bpmap/model ids.ts → W-DUP-STEP on "~n"
 │    ├ conditions: sort by (stageKey, sourceRow) → dedupe by normalised text → C1…Cn
 │    └ warnings: W-ORDER-UNPARSEABLE, W-KIND-UNKNOWN, W-GROUP-EMPTY, W-NO-INITIATION, truncation
 ├→ parseDefinition(draft)                                @bpmap/model (zod gate)
 └→ { ok, definition, stats, sheets, mappingUsed }
```

## 3. Model → screen (derivation) ✅

Runs on every change of the active definition, its overlay, or the theme.

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
 │    │     ├ stage x/width (wider when parallel); node centred, stacked within a cell
 │    │     ├ split/join bars + stubs for parallel stages
 │    │     └ transitions routed in the gutter between columns (DEC-013)
 │    └ buildExportScene(def, graph, L, theme, { labels, notes })   packages/scene
 │          ├ header (title + summaryLine)
 │          ├ translate(buildDiagramScene(...), EXPORT_DIAGRAM_OFFSET)
 │          │     lanes · stage headers · edges · bars · step groups (kind tag, wrapText title,
 │          │     C-badges, N badge, completion ✓; dashed amber if conditional)
 │          ├ legend (+ exceptions note) · condition list (2 columns) · footer disclaimer
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
      ├ tab "Step"   → StepPanel: details, "Runs only if" conditions, Customise fields (§4)
      └ tab "Import report" → ReportPanel: stats, sheets, warnings → "Show step" → store.select(stepId)
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
