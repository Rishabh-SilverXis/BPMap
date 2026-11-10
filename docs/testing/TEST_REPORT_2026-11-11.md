# Test report: real Change Job export vs. Incubane output (11 Nov 2026)

**Build tested:** `fb2a28d` (Phase 2, Increment 2.1) · **Input:** a real *Change Job (Default Definition)* export (26 steps, 6 sheets), kept locally in `.local/`, never committed · **Method:** an independent oracle (`tools/oracle`) plus automated cross-checks, real-browser tests and edge-case tests.

## 1. Why the two Executive views don't match

| # | Difference | Incubane | BPMap | Verdict |
|---|---|---|---|---|
| 1 | Position of the four review steps `ba` to `bd` | Stages 23–26, at the end, after "process complete" | Stages 2–5, right after initiation | **BPMap is correct.** Workday lists rows as `a, ba, bb, bc, bd, d …` (DEC-026) |
| 2 | Arrows between rows | None (each row looks like a separate process) | Snaking arrows join row *n* to row *n+1* | BPMap is better |
| 3 | "Only if" captions | "only if" with no IDs | "only if C5 and C6" | BPMap is more informative, **but long captions are truncated** (F-02) |
| 4 | Process-complete marker on Assign Pay Group (`o`) | Shown | **Missing** | **BPMap bug** (F-01) |
| 5 | Header | Effective date + overall due date | Counts only | **BPMap gap**: parsed but not shown (F-03) |
| 6 | Dot colours | Coloured actions | Hollow actions | Style only; BPMap follows its Design System |

## 2. Coverage and results

| Suite | What it covers | Result |
|---|---|---|
| Model vs. oracle | 26 steps × 9 fields (type, lane, conditions, groups, complete, restriction, alternate, routing, validations); 34 conditions (text, Workday-owned, steps); lanes; notifications; initiating groups; stage order = row order | **All pass** |
| Scenario × view matrix | No answers; each of 34 conditions = No and = Yes; all No; all Yes; all decisions on; 300 random mixes. Each in Owner, Configurator and Executive: **1,116 renders** | Skipped steps match the oracle in every case. Invariants hold in every render: no overlap, nodes in lane/column, diamonds in column, orthogonal edges, forward arrows, skip paths inside the lane, markers, well-formed SVG, one card per stage |
| Executive content | Completion marker, caption truncation, header metadata | **3 failures** → F-01, F-02, F-03 |
| Real-browser UI (production build, CSP on) | 34 × "No" in the Scenario panel vs. oracle counts; keyboard view switching; dark theme; SVG/PNG/project downloads; reload persistence; project file into a fresh browser; re-import keeps customisations, no duplicate tab | **4/4 pass** |
| Privacy (CI e2e) | Import → 3 views → scenario → Health → export: no off-origin request, no request body, no CSP violation | **Pass** |
| Edge cases | Empty / text / truncated / random-PK files; header only; orders `a, aa, b, c, k2, k10, ??`; duplicates; rows out of order; unknown type; double-encoding; Unicode; hostile text; no title row; all steps hidden | **23/23 pass** |
| Performance | 549-step definition: parse 32 ms, layout + scene + SVG 6 ms, all rules 3 ms. Real export: parse 6 ms, 3 views 2 ms | Well within budgets (Architecture §23) |

## 3. Findings

| ID | Severity | Finding | Evidence |
|---|---|---|---|
| F-01 | **High** | Executive view loses the "process complete" marker when the caption also has "only if …" | Missing in 224 of 224 scenarios where step `o` is visible |
| F-02 | Medium | Executive "only if" captions are cut to one line ("only if 4…", "only if C16 an…") | 6 distinct truncated captions on the real file |
| F-03 | Medium | Export header omits effective date and overall due date (already parsed) | Header string check |
| F-04 | Medium | HC-04 false positives: pairs steps whose conditions are mutually exclusive (`t` "Country is NOT …" vs `t1` "Country is …") and steps that can never run (`s` → `s1`, both HC-16) | Health output on the real file |
| F-05 | Low | HC-02 and HC-03 together produce many findings on real data (12 warnings, 11 info) | Already mitigated by the badge counting only critical + warning (DEC-037); consider an "export lacks due dates/alternates broadly" summary |
| F-06 | Info | Two test-code bugs found while building the suites (ambiguous Playwright names "No"/"Not set" and "C1"/"C10") | Fixed with `exact: true` |

## 4. Reproduce

```bash
npm run oracle -- .local/real-change-job.xlsx > /tmp/expected.json
BPMAP_ORACLE_VISIBLE='[25,25,24,25,24,22,25,24,25,25,25,25,25,25,25,25,25,25,25,25,25,25,25,25,25,25,25,25,25,25,25,25,25,25]' npx playwright test real-export.local
npm test && npm run e2e
```
(`real-export.local.spec.ts` skips itself when the private file or the oracle counts are absent, as in CI.)
