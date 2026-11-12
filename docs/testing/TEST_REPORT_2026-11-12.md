# Test campaign: Phase 2 release (2026-11-12)

Scope: the whole app at the end of Phase 2 (main @ `35cb37b`), tested well beyond the automated suite: malformed and edge-case workbooks, every export opened with independent parsers, performance against the PRD budgets, and browser scenarios (keyboard, accessibility, themes, screen sizes, undo depth, multiple tabs, blocked storage, bad files). Clear-cut defects were fixed on branch `fix/test-campaign-2026-11-11` and each fix has a regression test. Everything else is listed under **Open findings**, ranked.

Company data: the real export stayed in `.local/` and the scratchpad. Nothing from it is in this report except Workday's own step-type and section names.

## 1. Results at a glance

| Area | Method | Result |
|---|---|---|
| Typecheck, unit, e2e, build | full suite | ✅ 157 unit (was 149), 25 e2e (was 21), build OK |
| Importer robustness | 62 generated workbooks through `importWorkbook` | ✅ no crash, hang or silent limit breach; **12 defects** (6 fixed) |
| Export validity | every Export item opened with pypdf, python-pptx, lxml, openpyxl, Pillow | ✅ all open and carry the content; **editability and layout gaps** (§4) |
| Performance | 60- and 200-step synthetic definitions, Node + Chrome | ✅ far inside budget; ❌ PNG hung on 200 steps (fixed) |
| Keyboard | Tab, Enter, arrows, Escape | ✅ after fix (Escape did not deselect) |
| Accessibility | names, ids, contrast (light + dark), target size | ✅ after fixes (1 contrast, 2 target-size failures) |
| Screen sizes | 1440, 1024, 768, 375 px | ✅ after fix (tablet/phone had no details panel and overflowed) |
| Data safety | undo depth, tab close, two tabs, blocked storage | ✅ undo 52/52; ❌ late edits lost on close (fixed); ⚠️ two tabs (notice added) |
| Security | `npm audit`, secret scan, CSP, outbound URLs | ✅ CSP intact, no secrets, no runtime calls out; ⚠️ 3 advisories (§5) |
| Cross-browser | — | ⚠️ **not run**: only Chrome is installed for Playwright (§5) |

## 2. Performance (NFR-PERF-01/02)

| Measure | 60 steps | 200 steps | Budget |
|---|---|---|---|
| Import (Node, pure) | 4 ms | 11–13 ms | — |
| graph + layout + scene + SVG | < 1 ms | ~2 ms | — |
| Drop file → all steps on screen (Chrome, prod build) | 815 ms | 802 ms | < 2 s (60) |
| Select step / switch view / step list | 35–67 ms | 35–57 ms | — |
| PDF / PowerPoint / draw.io / Excel / SVG export | 39–126 ms | 41–173 ms | PDF < 5 s |
| 5-page pack (PDF, PPTX) | 35–110 ms | — | < 30 s |
| JS heap after both | 17 MB | | — |

The ~800 ms import is almost all worker start-up and the first lazy chunk; the pipeline itself is milliseconds. A 20,000-row workbook (the row cap) imports in ~1.1 s with a truncation warning.

## 3. Defects fixed in this campaign

| ID | Severity | Defect | Fix | Test |
|---|---|---|---|---|
| B1 | **High** | PNG export of a wide process (200 steps, 35,908 px) **hung silently** (> 75 s, no download, no message): beyond the browser canvas limit `toBlob` never calls back | Scale capped to the canvas limit (16,384 px/side, 128 MP); below 0.5× a clear "use SVG or PDF" error in 51 ms; 30 s timeout; the toast says when the PNG was scaled | `exporters/limits.test.ts`, re-measured |
| B2 | **High** | **An edit made < 0.5 s before closing the tab was lost** (autosave debounce never ran) | Pending save flushed on `pagehide` / hidden tab | e2e "edit made just before the tab closes" |
| B3 | Medium | Two tabs: the last tab to save silently overwrote the other's edits | `BroadcastChannel`: other tabs show "changed in another tab, Reload" (no merge yet, see O7) | e2e "a save in another tab" |
| B4 | Medium | Below 1,024 px the details panel was hidden with no way to open it; the toolbar overflowed sideways on tablet and phone | "Details" button + drawer (opens on step select); toolbar wraps | e2e "drawer below 1024 px"; 768/375 px: no overflow |
| B5 | Medium | PDF: weights 500/600 fell back to **Times** (serif) in PDF exports | Map weights to the standard fonts' regular/bold | validated with pypdf font list |
| B6 | Medium | PDF pages wider than 200 in (14,400 pt) are refused by Acrobat; 200-step pages were ~360 in | Pages scaled to the reader limit (still vector) | `exporters/limits.test.ts` |
| I1 | Medium | Step types **Consolidated Approval, Batch/Job, Report, Document** imported as "unknown" (+ false "no security group" warnings) | Added to the type catalogue | `model.test.ts`, `robustness.test.ts` D1 |
| I2 | Medium | A workbook without a Steps sheet opened the mapping dialog **on the Notifications sheet** (its header looks like a Steps header); two code paths | Notifications sub-table titles recognised; sheets with a non-steps title never guessed as Steps | `robustness.test.ts` D2 |
| I3 | Medium-low | A Steps sheet with a header and no rows imported as an **empty, "ok" definition** | Clear error | `robustness.test.ts` D3 |
| I4 | Low | Two Initiation steps raised no warning | Warning with both orders | `robustness.test.ts` D7 |
| I5 | Low | A custom notification with a blank name was **silently dropped** | Kept, named after its trigger | `robustness.test.ts` D8 |
| I6 | Low | "No Steps sheet" didn't say it only searched the first 15 rows | Message says so | — |
| A1 | Low | Escape did not clear the selected step | Escape in the diagram deselects | e2e "Escape clears" |
| A2 | Low | White ✓ on green (completion badge) 3.3:1 contrast | Green-700, ≈ 5:1 | contrast audit: 0 failures light + dark |
| A3 | Low | Tab name and close × were 20 px targets (WCAG 2.2 needs 24) | 24 px | target audit |
| A4 | Low | Conditions page cut long conditions at 3 lines ("…") | Never clamped (the page grows) | — |
| D5 | Low | Export menu said customisations contain "no Workday data", but rewritten conditions are keyed by their Workday text | Hint and docs corrected | — |

## 4. Open findings, ranked (not fixed: need a design decision or a larger change)

| ID | Severity | Finding | Suggested direction |
|---|---|---|---|
| O1 | **High** | **PowerPoint and draw.io are editable only in a weak sense.** A 26-step slide = 460 loose shapes (a box is 2–4 separate shapes), 0 groups, 0 connectors; moving a box leaves its text and arrows behind. draw.io: lanes are plain rectangles (not swimlane containers), edges have no source/target. PRD EXP-03/04 ("every box and connector editable", "lanes and containers preserved") are **not met** | One shape per step with multi-run text; draw.io `swimlane` containers with steps as children and edges bound to cells; PPTX connectors via a post-process of the slide XML |
| O2 | Medium | Wide processes export as one **poster page/slide** (57 × 28 in; 7–8 pt text when fitted); no A4/Letter/A3 (EXP-02) | Tile by stage ranges, repeating the lane column; page-size picker |
| O3 | Medium | Step names and Configurator detail lines truncated with "…" on the diagram stay truncated in every export except Excel | Steps-and-notes appendix page in multi-page formats |
| O4 | Medium | Note **text** appears only in Excel; other exports show just the "N" badge | Same appendix; PPTX speaker notes |
| O5 | Low-medium | Missing optional columns (If, Due Date, Complete…) are silent: a file without "If" shows 0 conditions with no hint | `W-COLUMN-MISSING` warning |
| O6 | Low-medium | A title without a variant ("…Definition: Hire") loses the process name (file name used instead) | Accept titles without "(…)" |
| O7 | Low-medium | Two tabs: now **warned**, not merged | Per-key merge on save, or a single-writer lock |
| O8 | Low | Duplicate steps (same order + task) get `~2/~3` suffixes by row order, so a re-export that reorders rows can swap their edits | Include the group in the id |
| O9 | Low | Double-encoded `&amp;amp;#xa;` stays one item (flagged W-ENCODING) | Decode until stable (max 2 passes) |
| O10 | Low | 1 warning per unparseable row (85 at 20k rows) | Aggregate |
| O11 | Low | PDF fonts not embedded; non-Latin text becomes "?" (DEC-046) | Embed an Inter subset (also fixes B5 at the root) |
| O12 | Low | PNG cap (16,384 px) is Safari-safe but conservative: Chrome could do 2× on a 60-step process, now 1.5× | Try the full size first, fall back on failure |
| O13 | Low | Native 13 px checkboxes (label is clickable, so WCAG's exception applies) | Larger custom checkbox |
| O14 | Trivial | Order `zzz999` collides with the "unparseable" stage key; zip-but-not-xlsx error wording is technical | Rename key; reword |

## 5. Not covered / environment gaps

- **Cross-browser (NFR-COMP):** only Chrome is installed for Playwright. Firefox, Safari (WebKit) and Edge are untested. `npx playwright install firefox webkit` (a ~300 MB download) plus a `projects` entry in `playwright.config.ts` would add them to CI.
- **Dependency advisories (`npm audit`):** `image-size` (high, DoS on JXL/HEIF/ICNS parsing) via `pptxgenjs`. Not reachable, since we never add images (DEC-045). `fast-xml-parser` ≤ 5.11.2 (low, quadratic CPU on unterminated stop-nodes; our importer reads untrusted XML, so it matters a little). The fix is 5.12.0, released 2026-11-03, which is inside our 14-day install delay (DEC-004), so it can be taken from 2026-11-17.
- **No linter** is configured (only `tsc`).
- **Real-world corpus (NFR-QUAL):** 1 real export + 9 synthetic fixtures against a target of 30 real definitions. The biggest remaining risk is Workday layouts we haven't seen.
- **Not tested:** the IndexedDB storage quota on huge projects (12 definitions used 84 KB); screen readers (NVDA / VoiceOver); touch input on tablets.

## 6. How to re-run

Scripts and raw results are in the session scratchpad (not committed): `robust/` (62 workbooks + runner), `exports/` (downloaded files + `validate.py`), `perf/` (generator, Node and Chrome timing), `scenarios/` (keyboard, a11y, viewport, undo, tabs, storage). The regressions they found are now permanent tests in `packages/importer-xlsx/src/robustness.test.ts`, `packages/exporters/src/limits.test.ts`, `packages/model/src/model.test.ts` and `apps/web/e2e/flows.spec.ts`.
