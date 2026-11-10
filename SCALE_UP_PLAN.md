# Workday Flowchart AI: Analysis & Scale-Up Plan

_Prepared 2026-11-10_

---

## 1. The market signal: Rick Leunisse's LinkedIn post

**What he built:** a free Workday **business process (BP) visualizer**. He made a point of saying it uses **no AI or LLMs** and that **all data stays local**.

| Capability | Detail |
|---|---|
| Input | Upload a BP definition (the full one or just the steps table) |
| End-to-end flow | Shows condition rules, validations and key steps |
| Audience zoom levels | **Executive / Process Owner / Configurator** |
| Simplify | Toggle condition rules on and off, choose which scenarios to show |
| Quality flags | Indicators for steps that "don't make sense" |
| Enrich | Add integrations manually |
| Compare | Old vs. new definition, **tenant vs. tenant** |
| Multi-BP | Merge several BPs into one pack (e.g. the Hire family) |
| Export | PDF, PowerPoint, SVG, PNG, **Draw.io (for Visio)** |

**Engagement:** about 70 reactions and 10 comments within 5 days. One comment says "I was literally looking for something like that today." Another asks for Mermaid output. Your own comment there says you built something similar.

**What this tells us:**
1. The need is real and widely shared. Every Workday customer and partner redraws BPs in Visio.
2. **Privacy is the main selling point** in this market. Rick leads with "no AI, fully local" because HRIS and Finance teams won't upload tenant configuration to a public LLM. Your current tool does exactly that.
3. The basic features are now known and free. To get a wider audience, you need parity on those plus something the free tool doesn't do.

---

## 1b. Hands-on teardown: incubane.com/tools/bp-visualizer (tested 2026-11-10)

Tested with their built-in **Change Job (Default Definition)** sample: 18 steps, 12 stages, 16 conditional, 9 security groups.

### What it does
| Area | What we observed |
|---|---|
| **Input** | Excel file from *View Business Process Definition → Export to Excel*. Uses the **Steps** and **Notifications** sheets and ignores the rest. Several files can be added (a definition plus its subprocesses), and **each becomes a tab**. The page includes a three-step "how to get the export" guide. |
| **Privacy** | "Your file is read in this browser. Nothing is uploaded." Network traffic was the site itself, Plausible (cookieless analytics) and Google Fonts. No upload calls. State lives in `localStorage` (`ib-bpviz-v1`). |
| **Layout rules** | **Columns are order letters** (same letter = parallel, shown with split/join bars). **Lanes are security groups**, with Workday services and integrations in lanes at the bottom. **Conditional steps get a dashed border and a C1, C2… badge**, and the conditions are listed below the diagram instead of drawn as diamonds. Diamonds appear only on approvals or on demand. "No" is labelled **"No, skip"**. Send back, deny, cancel and rescind are **explained once in a legend note**, not drawn on every box. A "process complete" marker shows the completion step. |
| **Three views** | **Executive:** one card per stage (parallel steps grouped), "only if" tags, fits on one slide. **Process owner:** the swimlane diagram. **Configurator:** adds due date, alternate, routing ("Routes to proposed manager") and "Also:" extra groups on each box. |
| **Toolbar** | Zoom, Fit, Hide panel, Full screen, **Focus on one role**, show/hide the condition list, Copy image. |
| **Health tab** | 4 "Good to know" heuristics: *a group gets N tasks at once* (suggests a checklist or consolidated step), *a group acts N times in a row* (suggests parallel steps to save days), *N of M steps are conditional* (use scenarios and test each one), *N conditions are customer-owned* (re-check after each release). |
| **Scenario tab** | Each condition can be set to **Not set / Yes / No**, can be rendered as a yes/no diamond, and can be renamed. Answering removes the steps that won't run. Empty lanes and columns collapse, and the header shows "Scenario: C3 no". |
| **Step tab** | Click a step to see order, type, Workday task, security group(s), optional, due date, alternate, routing setting, *Runs only if* conditions, a custom label, a note (shown as **N** on the step), "Hide this step", and **"Downstream system after this step"**. |
| **Customise tab** | Rename lanes, add downstream systems on completion, rewrite conditions in plain words. **Changes are stored as an overlay that survives loading a newer export of the same definition.** Save, load and reset customisations, plus "Remove everything from this browser". |
| **Export** | PDF, **editable PowerPoint** ("every box and line can be edited"), draw.io (for Visio/Lucidchart), PNG, SVG. **A free account is required to download**, so the tool doubles as a lead magnet for their consultancy ("Book 30 minutes"). |
| **Stack** | Next.js marketing site with an SVG renderer. Parsed data model in localStorage (below). |

**Their data model (from localStorage). This validates the IR we planned:**
```
def   { id, name, process, variant, initiatingGroups[], steps[], conditions[],
        customNotifications[], systemNotificationOff{}, sections[], warnings[] }
step  { id:"g-7", order:"g", kind: initiation|action|approval|todo|service|…, typeLabel, task,
        conditionIds[], optional, groups[] (multi), allMustAct, runsAsNamedUser,
        dueOnEffectiveDate, doNotAdvance, complete, restriction, alternate, routing, dueDate }
cond  { id:"C1", text, workdayOwned, stepIds[] }
state { overlays{defId}, scenarios{defId:{C3:"no"}}, activeId, zoom }
```

### What we should take from it (now table stakes)
1. **XLSX import of the Steps and Notifications sheets**, multi-file, with an in-app guide for getting the export.
2. **Columns = order letters, lanes = security groups**, separate lanes for system steps, split/join bars for parallel steps.
3. **Dashed border plus a C-number badge instead of a diamond for every condition**, with a condition list below. This is far more readable than our current design of a diamond per condition with "No → back to initiation".
4. **Exceptions in a legend, not as arrows.** One note explains send back, deny, cancel and rescind.
5. **Three views** (Executive cards, Process owner swimlanes, Configurator details) and **Focus on one role**.
6. **Scenario toggles with Yes/No/Not set** that remove skipped steps and collapse empty lanes.
7. **Workday-owned vs. customer-owned conditions** (the export marks "(Workday Owned)"), useful for release regression.
8. **Overlay customisations keyed to the definition** that survive re-import, with save/load as a file.
9. **Editable PPTX**, not just a picture pasted onto a slide.
10. **Honest "what the export does not show" section**, which builds trust with configurators.

### Gaps we observed (our openings)
| Gap in their tool | Our response |
|---|---|
| The **condition logic isn't in the export** ("The export gives the condition name, not the rule"). The user has to rewrite each condition by hand. | **Import the condition-rule report** to show the real logic, plus **AI-drafted plain-English wording** (opt-in) from the rule text. |
| **Who can cancel, rescind or correct is out of scope** (that's the BP security policy). | **Import the BP security policy report** and show the allowed roles for each action, plus a **segregation-of-duties check**. |
| **Subprocesses are separate tabs**, not linked. | **Drill-down BP packs**: click "Propose Compensation Change" to open its definition inline. |
| Health check is **4 heuristics, all "good to know"**. | Rules engine with severities: SoD, missing due dates, approvals with no alternate, conditions that can never be true, very long serial chains, steps after completion. |
| **Scenarios only filter the view.** | **Generate a test plan:** one test case per meaningful condition combination, with expected approvers, exportable to XLSX. Also **Scenario presets** ("Promotion – NL"). |
| We **didn't find version or tenant compare** in the web tool (the LinkedIn post mentioned it). | **Visual diff** (version vs. version, tenant vs. tenant) plus an AI change summary for CAB. |
| **No BPMN or Mermaid**, no sharing or collaboration, and downloads require an account. | BPMN 2.0 and Mermaid export, read-only share links, comments, and a team library. |
| No handling of **messy inputs** (screenshots, PDFs from a client). | Keep our AI vision importer as an **opt-in fallback**. |

---

## 2. Deep analysis of the current codebase

### 2.1 What it is
A ~1,300-line React 19 + Vite + TypeScript single-page app that was scaffolded in **Google AI Studio**.

```
Screenshot/PDF ──► Gemini 2.5 Flash (JSON schema) ──► FlowchartData{title, swimlanes[], steps[]}
                                                              │
                         DataVerification (editable table) ◄──┤
                                                              ▼
                              FlowchartEditor: linear layout ──► React Flow canvas ──► PNG export
```

| File | Role |
|---|---|
| `src/lib/gemini.ts` | Calls the vision LLM with a structured `responseSchema` |
| `src/types.ts` | `ProcessStep` / `FlowchartData` model (10 string fields) |
| `src/components/FlowchartEditor.tsx` | Turns data into a graph, lays it out by hand, handles editing, undo, PNG export |
| `src/components/CustomNodes.tsx` | 7 node shapes (start, end, approval, action, decision, info, swimlane) |
| `src/components/DataVerification.tsx` | Modal table to fix extraction errors and regenerate |
| `src/components/UploadSection.tsx` | Dropzone for PNG/JPG/PDF up to 10 MB |
| `src/App.tsx` | Landing hero, source-image side panel, wiring |

### 2.2 What's good
- **Good editing loop:** extract, then human verification, then regenerate. That workflow is correct for an extraction tool.
- **Structured output** via Gemini `responseSchema` instead of free-text parsing.
- **Sensible technology:** React Flow (`@xyflow/react` v12) is the right canvas library. Tailwind v4 keeps the UI lean.
- The vendor chunking in `vite.config.ts` keeps the AI SDK and the canvas out of the main bundle.
- Screenshot input handles the case where a user can't export (for example, they only have a view of someone's screen).

### 2.3 Bugs in Workday domain logic (these produce *wrong* diagrams)

| # | Issue | Where | Impact |
|---|---|---|---|
| D1 | **A false condition is drawn as "revert to initiation".** In Workday, when an entry condition evaluates false, the step is **skipped** and the flow continues. Send-back is a separate action. The footer note on the canvas states the wrong rule. | `FlowchartEditor.tsx:137-157`, `:501-503` | Every conditional BP is drawn incorrectly. Configurators will notice right away. |
| D2 | **Order is ignored.** Layout uses the array index, so steps that share an order letter (parallel steps) are drawn as sequential. | `FlowchartEditor.tsx:82-206` | Parallel approvals and to-dos look serial. |
| D3 | **Only 4 step types are mapped.** To Do, Approval Chain, Consolidated Approval Chain, Review, Checklist, Questionnaire, Integration, Service and Sub-Process all collapse into a plain "action" box. | `:89-96` | Loses the information configurators care about most. |
| D4 | **Non-Action nodes show the type name as their label.** Every approval node just says "Approval", not *who* approves or *what*. | `:165` | Diagram has to be cross-read against the table. |
| D5 | Steps whose group isn't in `swimlanes` get `y=100`, which overlaps lane 0. | `:86-87` | Nodes are misplaced silently. |
| D6 | No model for validations, notifications, sub-process links, delegation or routing restrictions. | `types.ts` | Can't reach "Configurator" depth. |

### 2.4 Engineering, security and product issues

| # | Issue | Where |
|---|---|---|
| E1 | **API key is in client code.** `process.env.GEMINI_API_KEY` is read in the browser. `vite.config.ts` has no `define`, so outside AI Studio this probably throws `process is not defined` and the page goes blank. If you add a `define`, the key ships in the public JS bundle. Either way, it needs a server-side proxy. | `gemini.ts:4`, `vite.config.ts` |
| E2 | **Tenant data goes to a third-party LLM** with no consent, redaction or opt-out. This is the opposite of what the market wants (see §1). | `gemini.ts` |
| E3 | **Likely TypeScript error:** "Add Row" creates a step without `id`, `optional` or `additionalInfo`, which are required by `ProcessStep`, so `npm run lint` should fail. `additionalInfo` and `optional` also can't be edited in the table. | `DataVerification.tsx:20-35` |
| E4 | **PNG export captures only the current viewport**, not the full diagram. `getNodesBounds` + `getViewportForBounds` are needed. | `FlowchartEditor.tsx:342-371` |
| E5 | **The canvas and the table are two separate sources of truth.** Canvas edits never flow back into the data and are erased by any "Regenerate". | `:211-235` |
| E6 | Undo is one level deep, and every keystroke in the label box overwrites the history. State objects are mutated in place (`node.data = …`, `edge.label = …`). | `:219-229`, `:308`, `:321` |
| E7 | No runtime validation of LLM output. The JSON is cast with `as FlowchartData`. | `gemini.ts:86` |
| E8 | PDFs are accepted, but the source panel shows them with `<img>`, which renders broken. Only one file is allowed. | `UploadSection.tsx:29`, `App.tsx:234` |
| E9 | No persistence (a refresh loses everything), no save/load, no project library. | — |
| E10 | **Trademark / branding:** the app is called "Workday Flowchart AI" and hotlinks the Workday logo from `logos-world.net`. This needs fixing before a public launch. | `App.tsx:156-165` |
| E11 | Housekeeping: this is not a git repo, there are no tests, the package is named `react-example`, there are unused dependencies (`express`, `dotenv`, `motion` + `framer-motion` together, `tsx`), unused imports, and the AI Studio README and metadata are still in place. Node.js isn't installed on this machine. | — |
| E12 | Accessibility: color-only node meaning, no keyboard editing, and the source panel is hidden on mobile. | — |

### 2.5 Head-to-head summary

| Dimension | Your tool today | Rick's V1 | Gap |
|---|---|---|---|
| Input fidelity | Screenshot through LLM (probabilistic) | Structured definition upload (deterministic) | **Large** |
| Privacy | Cloud LLM, key in browser | Local, no AI | **Large** |
| Semantic correctness | Wrong condition semantics, no parallel steps | Conditions, validations, scenarios | **Large** |
| Audience views | None | Exec / Owner / Configurator | Large |
| Compare / multi-BP | None | Both | Large |
| Export | PNG (viewport only) | PDF, PPTX, SVG, PNG, Draw.io | Large |
| Manual editing | **Yes**, free-form canvas | "Customize and refine" | Roughly even |
| Messy inputs (screenshots, scans) | **Yes** | Probably not | **Your edge** |
| AI-generated narrative and insight | Possible (pipeline already exists) | Explicitly none | **Your edge** |

---

## 3. Product strategy for a larger Workday audience

### 3.1 Positioning: "deterministic core, optional AI"
Don't compete on "AI vs. no AI". Do both, in the right order:

1. **Local-first deterministic engine** as the default. Parse the Workday BP definition export (XLSX) in the browser. Nothing leaves the machine. This matches Rick's privacy promise and fixes accuracy.
2. **AI as an opt-in layer on the structured model, not on images.** It runs only when the user turns it on, with redaction of names and IDs, through a server proxy or a bring-your-own key. Screenshot OCR stays as a *fallback* importer.
3. **Differentiate on what comes after the diagram:** test scripts, SOPs and training material, SOX control matrices, release-to-release diffs, and BPMN interoperability. A diagram-only tool can't produce these.

### 3.2 Target segments (in order)
| Segment | Job to be done | What they'd pay for |
|---|---|---|
| **Workday partners/consultants** (SIs, independents) | Design workshops, deliverables, handover docs | Branded PPTX/PDF packs, compare, test scripts |
| **Customer HRIS / Finance systems teams** | Document the as-is, impact of changes, R1/R2 release regression | Library, versioning, diff, health check |
| **Internal audit / SOX / controls** | Evidence of approval controls on Financials BPs | Controls matrix, segregation-of-duties flags, audit-ready exports |
| **Process owners / executives / change & training** | Understand "who approves what, when" | Exec view, plain-English narrative, Q&A |

### 3.3 Name and brand
Rename to something that doesn't start with the Workday trademark, for example "*BPMap* — for Workday". Use nominative wording ("works with Workday BP definitions"), add a "not affiliated with Workday, Inc." disclaimer, and remove the hotlinked logo.

---

## 4. Target architecture

```
                     ┌────────────── Importers ──────────────┐
  XLSX BP export ───►│ xlsxParser (deterministic, primary)   │
  Screenshot/PDF ───►│ visionImporter (AI, opt-in, fallback) │──► Canonical IR (zod-validated)
  JSON project   ───►│ projectLoader                         │      BusinessProcess, Step, Condition,
  (later) RaaS   ───►│ tenantConnector                       │      Validation, Notification, SubProcessRef
                     └───────────────────────────────────────┘                 │
          ┌────────────────────┬──────────────────────┬────────────────────────┼──────────────────┐
          ▼                    ▼                      ▼                        ▼                  ▼
   Graph builder         Rules engine           Diff engine              View filters        AI services
  (semantics: skip,     (health check,         (version/tenant          (Exec / Owner /     (narrative, test
   parallel, subproc)    SoD, SOX flags)        compare)                 Config, scenario)   scripts, Q&A)
          │
          ▼
   ELK.js layered layout with swimlane partitions
          │
          ▼
   Renderers: React Flow canvas · SVG · PNG · PDF · PPTX · draw.io XML · Mermaid · BPMN 2.0 · Visio(.vsdx, later)
```

**Key design decisions**
- **One source of truth: the IR.** The table and the canvas are both views of it. Manual canvas tweaks are stored as an *overlay* (positions, notes, custom shapes) keyed by stable step IDs, so they survive re-imports and regenerations.
- **Stable IDs** come from the BP type, order and step type, not the array index. This makes diffing and overlays possible.
- **ELK.js** replaces the hand-written x/y math. It handles parallel branches, lane partitions and edge routing.
- **Local-first storage:** IndexedDB (Dexie) for a personal library. Export and import of a `.bpmap.json` project file.
- **State:** Zustand + `zundo` for multi-level undo and redo.

**Recommended stack additions:** `zod`, `exceljs` (or SheetJS from its official CDN), `elkjs`, `pptxgenjs`, `jspdf` + `svg2pdf.js`, `dexie`, `zustand`/`zundo`, `vitest`, `playwright`. A thin backend (Cloudflare Workers or a small Node service) only for the AI proxy and, later, team workspaces.

---

## 5. Enhanced feature set

### Tier A: Parity+ (needed to be taken seriously)
1. **Deterministic XLSX import** of the BP definition, plus multi-file upload.
2. **Correct semantics:** skip-on-false conditions, parallel steps that share an order letter, sub-process steps as collapsible or linked nodes, validations (critical vs. warning) at initiation, notifications as annotations.
3. **Full step-type catalog** with distinct shapes and a legend.
4. **Audience views:** *Executive* (lanes and major milestones only), *Process Owner* (approvals, conditions in plain English, SLAs), *Configurator* (everything, including security groups, routing restrictions and due-date rules).
5. **Scenario simulator:** toggle conditions ("Amount > 50k = true", "Country = US") to highlight the actual path a transaction takes.
6. **Compare:** version vs. version and tenant vs. tenant, with a color-coded visual diff and a change log table.
7. **BP packs:** merge related BPs (Hire → Propose Comp → Assign Pay Group…) with drill-down navigation.
8. **Exports:** full-canvas PNG/SVG, multi-page PDF, PPTX (one slide per BP plus a summary), draw.io XML, Mermaid.

### Tier B: Differentiators (your advantages)
9. **BP Health Check (rules engine).** Explainable flags: the initiator approves their own transaction (**segregation of duties**), approval steps with no due date, conditions that can never be true, duplicate approvals by the same group, too many approval levels, optional steps with no owner, steps after End. Each flag comes with a severity rating and a suggested fix.
10. **AI Assist (opt-in, structured input, redacted):**
    - Plain-English **SOP / process narrative** for each audience.
    - **Test script generator:** one test case per condition path, with expected approvers. This is valuable for implementations and **R1/R2 release regression**.
    - **Change summary** in business language for CAB or steering committees from a diff.
    - **"Ask the process"** Q&A: "Who approves a journal over $100k in entity X?"
11. **SOX / Controls view** (Financials BPs): map approval steps to control IDs and export a controls matrix (XLSX) for audit evidence.
12. **BPMN 2.0 export** so the output opens in Signavio, Camunda, Bizagi or ARIS. Enterprise process-excellence teams care about this.
13. **Branded templates:** consultancies white-label exports with their own and their client's logos and colors.
14. **Fill in what the definition export can't show** (found in the Incubane teardown, §1b):
    - **Condition-rule import:** show the actual rule logic behind C1…Cn, not just its name.
    - **BP security policy import:** show who can cancel, rescind, correct or send back at each step, and use it as the main input for segregation-of-duties checks.
    - **Linked subprocess drill-down** instead of separate tabs.

### Tier C: Team & Enterprise (monetization)
15. Shared workspace and BP library with versioning, comments, @mentions and read-only share links.
16. SSO (SAML/OIDC), audit log, role-based access, data residency, **self-hosted or offline build** for regulated customers.
17. *(Validate first)* **Tenant connector:** pull BP definitions in bulk through a custom report exposed as RaaS, then schedule nightly snapshots and alert on changes. Check feasibility and security review needs with a design partner before committing.

---

## 6. Phased roadmap (solo builder with AI-assisted coding)

| Phase | Weeks | Goal | Key deliverables | Exit criteria |
|---|---|---|---|---|
| **0. Foundation** | 1 | Make it shippable | Install Node, `git init`, fix E1/E3/E4/E6/E10/E11, remove client-side key, add Vitest and CI, rename/rebrand | `npm run lint && npm test && npm run build` pass, no secret in the bundle |
| **1. Core engine** | 2–5 | Correct and private | IR + zod, XLSX parser, semantics (D1–D6), ELK layout, full step catalog, IndexedDB library, overlay-based editing, multi-level undo | 20+ anonymized real BP exports parse with 100% step fidelity (golden-file tests) |
| **2. Parity+** | 6–9 | Match the free tool | Audience views, scenario simulator, compare/diff, BP packs, PDF/PPTX/SVG/draw.io/Mermaid export | 5 design-partner consultants use it on real work |
| **3. Differentiate** | 10–14 | A reason to choose you | Health Check rules, AI Assist (narrative, test scripts, change summary), BPMN export, SOX matrix, branded templates; screenshot importer moved to opt-in AI | Design partners say they'd pay; test-script feature used weekly |
| **4. Team / Enterprise** | 15–24 | Revenue | Workspace, sharing, comments, SSO, audit log, self-host build, pricing and billing, RaaS connector pilot | First paying teams |

**Suggested pricing:** *Free* (local, single BP, PNG/SVG/PDF) · *Pro* (~$15–25/user/month: packs, compare, PPTX/draw.io/BPMN, Health Check, AI Assist) · *Team / Enterprise* (workspace, SSO, self-host, controls matrix).

---

## 7. Go-to-market
- **Design partners first:** recruit 5–10 consultants and customer HRIS leads from LinkedIn. The commenters on Rick's post are a ready-made list of interested people. Exchange early access for **anonymized BP exports**, which become your test fixture corpus.
- **Build in public:** short weekly LinkedIn videos that each show one differentiator ("Generated 14 test scripts for Change Job in 10 seconds").
- **Trust content:** a one-page security note (local-first, what the AI sees, redaction, no training on data) for IT and security reviewers.
- **Community and events:** Workday Community groups, regional user groups, the Workday Rising partner ecosystem. Later, consider a Workday Marketplace or partner listing.
- **SI channel:** offer branded-export licences to boutique Workday partners.

## 8. Key risks & mitigations
| Risk | Mitigation |
|---|---|
| Export format varies by tenant, release and locale | Fixture corpus from design partners, tolerant column mapping, "map columns" UI fallback |
| Data-sensitivity objections | Local-first default, AI opt-in with redaction preview, self-host option |
| A free competitor with an early lead | Differentiate on downstream outputs (tests, SOPs, controls, BPMN) and team features, not diagrams alone |
| Trademark | Rename, add disclaimer, no Workday logo |
| Scope creep for one builder | Strict phase exit criteria; ship Phase 1 publicly before starting Phase 3 |

## 9. Immediate next steps (this week)
1. Install Node (e.g. `brew install node`), `git init`, and commit the current state as a baseline.
2. Collect 3–5 **Workday BP definition Excel exports** (anonymized) to define the parser contract.
3. Phase 0 fixes. Highest priority: E1 (key exposure) and D1 (condition semantics).
4. Design the canonical IR (`BusinessProcess`, `Step`, `Condition`, …) with zod. Everything else depends on it.
