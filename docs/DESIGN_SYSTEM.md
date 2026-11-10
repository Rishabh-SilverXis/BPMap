# BPMap Design System

**Version** 1.0 (Draft) · **Date** 10 November 2026 · **Owner** Rishabh · **Applies to** the web app, canvas diagrams and all exports (PDF, PPTX, SVG/PNG, draw.io)
**Companion docs** [PRD](PRD_BPMap_for_Workday.md) · [Architecture](ARCHITECTURE.md)

> BPMap is a working product name. Workday® is a trademark of Workday, Inc. BPMap is independent and must never borrow Workday's logo, colours or visual identity (§2.3).

---

## Contents

1. [Purpose & scope](#1-purpose--scope)
2. [Principles & brand](#2-principles--brand)
3. [Design tokens](#3-design-tokens)
4. [Typography](#4-typography)
5. [Spacing, layout & grid](#5-spacing-layout--grid)
6. [Shape, elevation & motion](#6-shape-elevation--motion)
7. [Iconography](#7-iconography)
8. [App shell & screen layouts](#8-app-shell--screen-layouts)
9. [UI components](#9-ui-components)
10. [Diagram system (canvas)](#10-diagram-system-canvas)
11. [Audience views](#11-audience-views)
12. [Export themes](#12-export-themes)
13. [Content & voice](#13-content--voice)
14. [Accessibility](#14-accessibility)
15. [Implementation (Tailwind v4 + tokens)](#15-implementation-tailwind-v4--tokens)
16. [Governance](#16-governance)
17. [Decisions log](#17-decisions-log)

---

## 1. Purpose & scope

This design system has one job: **make every Workday business process readable and trustworthy, on screen and in every export.**

It covers:

- **Foundations:** tokens, type, spacing, shape, motion, icons.
- **The app shell and UI components:** import, panels, controls, feedback.
- **The diagram system:** the visual notation for Workday processes (stages, lanes, step kinds, conditions, parallel steps, completion).
- **Export themes**, so a PDF or PowerPoint looks like the canvas.
- **Content and voice**, and **accessibility**.

**One source of truth.** The tokens in §3 drive the web UI, the canvas and the exporters. If a colour changes, it changes everywhere, including in a PowerPoint generated six months later.

## 2. Principles & brand

### 2.1 Design principles

| # | Principle | What it means in practice |
|---|---|---|
| 1 | **Correct before pretty** | Never simplify a diagram in a way that changes Workday semantics. A skipped step is "No, skip", never "back to start". |
| 2 | **Show what changes the path; explain the rest once** | Conditions, parallel stages and lanes are drawn. Send back, deny, cancel, rescind and correct go in the legend. |
| 3 | **Private by default, and visibly so** | The privacy state is always on screen. Nothing implies data is uploaded when it isn't. |
| 4 | **One model, many views** | Executive, Process owner and Configurator are the same data shown at different depths, with the same colours and shapes. |
| 5 | **Calm density** | Configurators need detail. Use hierarchy (size, weight, muted colour), not boxes and borders, to manage it. |
| 6 | **Colour is never the only signal** | Every state uses shape, pattern, icon or text as well as colour. Diagrams must work printed in greyscale. |
| 7 | **Exports are first-class** | The PowerPoint is the deliverable. It must be editable, on-brand and match the canvas. |

### 2.2 Personality

**Precise, calm, helpful.** Think of a senior configurator explaining a process to a colleague: confident, plain-spoken, never flashy.

Visual cues that express this:
- A deep navy foundation.
- A single teal accent for actions.
- Amber reserved for conditional logic.
- Generous whitespace and quiet borders.

### 2.3 Brand rules

| Do | Don't |
|---|---|
| Use the BPMap wordmark and the "stage-and-lane" logomark | Use the Workday logo, wordmark or "W" shapes |
| Say "for Workday" or "works with Workday BP definitions" (nominative use) | Name the product "Workday …" or imply endorsement |
| Use the navy and teal palette | Use Workday's brand palette or imitate its UI chrome |
| Show the "Independent · not affiliated with Workday, Inc." line in the footer and on exports | Hide or shrink the disclaimer below legibility (min 8 pt in exports) |

**Logomark concept:** three rounded bars stacked as lanes, joined by one connector that turns two corners (a stage-and-lane path). It is navy on light backgrounds and teal-300 on navy. The minimum size is 16 px, and the clear space equals the bar height.

---

## 3. Design tokens

Tokens come in three layers. **Components only ever use semantic or component tokens, never primitives.**

```
primitive  (navy-800 = #14284B)
   └─ semantic  (--color-primary → navy-800 in light, navy-node-dark in dark)
        └─ component  (--node-approval-bg → --color-primary)
```

### 3.1 Primitive colour palette

| Family | 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 |
|---|---|---|---|---|---|---|---|---|---|---|
| **Navy** (brand) | `#EEF2FA` | `#DCE4F2` | `#B9C8E4` | `#8FB0E8` | `#5B7FBF` | `#3B5F99` | `#2F5D9E` | `#1F3A66` | `#14284B` | `#0B1B36` |
| **Teal** (accent) | `#E9F7F4` | `#CCFBF1` | `#99F6E4` | `#5EEAD4` | `#2DD4BF` | `#14B8A6` | `#0F9D8A` | `#0B6E63` | `#0F5E55` | `#134E4A` |
| **Amber** (conditional) | `#FFFBEB` | `#FEF3C7` | `#FDE68A` | `#FCD34D` | `#FBBF24` | `#F59E0B` | `#D97706` | `#B45309` | `#92400E` | `#78350F` |
| **Violet** (AI) | `#F5F3FF` | `#EDE9FE` | `#DDD6FE` | `#C4B5FD` | `#A78BFA` | `#8B5CF6` | `#7C3AED` | `#6D28D9` | `#5B21B6` | `#4C1D95` |
| **Slate** (neutral) | `#F8FAFC` | `#F1F5F9` | `#E2E8F0` | `#CBD5E1` | `#94A3B8` | `#64748B` | `#475569` | `#334155` | `#1E293B` | `#0F172A` |
| **Green** (success / added) | `#F0FDF4` | `#DCFCE7` | `#BBF7D0` | `#86EFAC` | `#4ADE80` | `#22C55E` | `#16A34A` | `#15803D` | `#166534` | `#14532D` |
| **Red** (danger / removed) | `#FEF2F2` | `#FEE2E2` | `#FECACA` | `#FCA5A5` | `#F87171` | `#EF4444` | `#DC2626` | `#B91C1C` | `#991B1B` | `#7F1D1D` |
| **Sky** (info) | `#F0F9FF` | `#E0F2FE` | `#BAE6FD` | `#7DD3FC` | `#38BDF8` | `#0EA5E9` | `#0284C7` | `#0369A1` | `#075985` | `#0C4A6E` |

**Reserved meanings (non-negotiable):**

| Hue | Reserved for | Never use for |
|---|---|---|
| **Amber** | Conditional logic: dashed step outlines, C-badges, decision diamonds | Warnings in the UI chrome (use the `warning` token, which is amber *with an icon*, and only in panels), AI, diff |
| **Violet** | AI Assist: AI-generated drafts, AI toggles, the consent dialog | Anything deterministic |
| **Teal** | Primary actions, "local only" privacy state, focus accents | Errors or diff |
| **Green / Red** | Success / danger, and diff added / removed | Step kinds |

### 3.2 Semantic tokens

All pairs below were measured against the WCAG 2.x formula (§14.2).

| Token | Light | Dark | Use |
|---|---|---|---|
| `--color-bg` | `#F8FAFC` slate-50 | `#0B1220` | App background |
| `--color-surface` | `#FFFFFF` | `#111A2E` | Panels, cards, canvas |
| `--color-surface-raised` | `#FFFFFF` + shadow e2 | `#16223A` | Popovers, menus |
| `--color-surface-sunken` | `#F1F5F9` slate-100 | `#0E1728` | Wells, alternate lanes, code |
| `--color-border` | `#E2E8F0` slate-200 | `#334155` | Decorative dividers **only** |
| `--color-border-strong` | `#64748B` slate-500 | `#7B8BA3` | Inputs, node outlines, any boundary that carries meaning |
| `--color-text` | `#0F172A` slate-900 | `#E2E8F0` | Body and titles |
| `--color-text-secondary` | `#475569` slate-600 | `#94A3B8` | Supporting text |
| `--color-text-muted` | `#64748B` slate-500 | `#7B8BA3` | Captions, metadata |
| `--color-text-disabled` | `#94A3B8` slate-400 | `#475569` | Disabled only (exempt from contrast) |
| `--color-primary` | `#14284B` navy-800 | `#3B5F99` navy-500 | Brand, approval nodes, headings |
| `--color-on-primary` | `#FFFFFF` | `#FFFFFF` | Text on primary |
| `--color-action` | `#0B6E63` teal-700 | `#5EEAD4` teal-300 | Primary buttons, links |
| `--color-on-action` | `#FFFFFF` | `#0B1220` | Text on action |
| `--color-accent` | `#0F9D8A` teal-600 | `#5EEAD4` teal-300 | Non-text accents: progress, selected tab bar, privacy chip icon |
| `--color-focus` | `#2F5D9E` navy-600 | `#8FB0E8` navy-300 | 2 px focus ring, 2 px offset |
| `--color-conditional` | `#D97706` amber-600 | `#F59E0B` amber-500 | Dashed outlines, decision stroke |
| `--color-conditional-subtle` | `#FEF3C7` amber-100 | `#3A2A0B` | C-badge fill, decision fill |
| `--color-on-conditional-subtle` | `#92400E` amber-800 | `#FCD34D` amber-300 | C-badge text |
| `--color-ai` | `#6D28D9` violet-700 | `#C4B5FD` violet-300 | AI text, icons, outlines |
| `--color-ai-subtle` | `#F5F3FF` violet-50 | `#221A3D` | AI draft backgrounds |
| `--color-success` | `#15803D` green-700 | `#4ADE80` green-400 | Success text, "added" |
| `--color-danger` | `#DC2626` red-600 | `#F87171` red-400 | Errors, destructive, "removed" |
| `--color-warning` | `#B45309` amber-700 | `#FBBF24` amber-400 | Warning text (always with an icon) |
| `--color-info` | `#075985` sky-800 | `#7DD3FC` sky-300 | Info text |
| `--color-diff-modified` | `#2F5D9E` navy-600 | `#93C5FD` | "Modified" in compare (not amber, see D-03) |

### 3.3 Component tokens: diagram notation

These are the most important tokens in the system: they **are** the notation (PRD §9).

| Token group | Background | Border | Text | Pattern / extra |
|---|---|---|---|---|
| `--node-initiation-*` | `--color-primary` | `--color-primary` | `--color-on-primary` | "START" kind label; play icon |
| `--node-approval-*` | `--color-primary` | `--color-primary` (dark: `--color-border-strong`) | `--color-on-primary` | badge-check icon |
| `--node-action-*` | `--color-surface` | `--color-border-strong` | `--color-text` | solid 1.5 px |
| `--node-todo-*` | teal-50 `#E9F7F4` | `#3E9C90` | `--color-text` | list-todo icon |
| `--node-review-*` | `--color-surface` | `--color-border-strong` | `--color-text` | eye icon |
| `--node-service-*` | slate-100 `#F1F5F9` | slate-500 | `--color-text-secondary` | cog icon; system lane |
| `--node-integration-*` | slate-100 | slate-500 | `--color-text-secondary` | plug icon; system lane |
| `--node-subprocess-*` | `--color-surface` | `--color-border-strong`, **double** 1 px rule | `--color-text` | workflow icon; "Open ›" affordance |
| `--node-conditional-border` | — | `--color-conditional`, **dashed 5/3.5**, 1.75 px | — | Combines with any kind above |
| `--node-selected-ring` | — | `--color-focus`, 2 px, offset 2 px | — | — |
| `--lane-bg` / `--lane-bg-alt` | `--color-surface` / `--color-surface-sunken` | `--color-border` | — | Alternating bands |
| `--lane-header-bg` | navy-50 `#EEF2FA` (dark `#16223A`) | — | `--color-primary` (dark `--color-text`) | System lanes use slate-100 |
| `--edge-default` | — | slate-500, 1.5 px, arrow-closed | — | Orthogonal |
| `--edge-skip` | — | `--color-conditional`, dashed 5/4 | "No, skip" label | — |
| `--edge-path-highlight` | — | `--color-action`, 2.5 px | — | Scenario path |
| `--parallel-bar` | `--color-primary` | — | — | 6 px wide, 2 px radius |
| `--completion` | green-600 `#16A34A` | white 1.5 px | ✓ white | 16 px circle |

### 3.4 Other token families (summary)

| Family | Tokens |
|---|---|
| Space | `--space-0` 0 · `-0.5` 2 · `-1` 4 · `-2` 8 · `-3` 12 · `-4` 16 · `-5` 20 · `-6` 24 · `-8` 32 · `-10` 40 · `-12` 48 · `-16` 64 (px) |
| Radius | `--radius-xs` 4 · `-sm` 6 · `-md` 8 · `-lg` 12 · `-xl` 16 · `-full` 9999 |
| Shadow | `--shadow-e1` `0 1px 2px rgb(15 23 42 / .06)` · `-e2` `0 4px 12px rgb(15 23 42 / .08)` · `-e3` `0 12px 32px rgb(15 23 42 / .14)` · `-e4` `0 24px 64px rgb(15 23 42 / .22)` |
| Duration | `--dur-fast` 120 ms · `-base` 200 ms · `-slow` 320 ms |
| Easing | `--ease-standard` `cubic-bezier(.2,0,0,1)` · `--ease-exit` `cubic-bezier(.4,0,1,1)` |
| Z-index | base 0 · canvas-overlay 10 · toolbar 20 · panel 30 · dropdown 40 · sticky 50 · modal 60 · toast 70 · tooltip 80 |
| Breakpoints | `sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280 · `2xl` 1536 |

---

## 4. Typography

### 4.1 Typefaces

| Role | Family | Notes |
|---|---|---|
| UI and diagrams | **Inter** (variable, **self-hosted** woff2) → `-apple-system, "Segoe UI", Roboto, sans-serif` | Self-hosted so we never call Google Fonts (privacy NFR). Enable `font-feature-settings: "cv11", "ss01"` for clearer digits and `tnum` in tables. |
| Code / IDs | `"JetBrains Mono", "SF Mono", Menlo, Consolas, monospace` (self-hosted subset) | Step IDs, condition IDs, `.bpmap` keys |
| Exports | Inter embedded in PDF; PPTX uses **Inter** with **Arial** fallback declared in the theme | PowerPoint on machines without Inter falls back gracefully |

### 4.2 Type scale (UI)

| Token | Size / line height | Weight | Use |
|---|---|---|---|
| `display` | 32 / 40 | 700, tracking −0.02em | Empty-state hero, export cover |
| `h1` | 24 / 32 | 700 | Page title (definition name) |
| `h2` | 20 / 28 | 650 | Panel titles |
| `h3` | 16 / 24 | 600 | Section titles in panels |
| `body` | 14 / 20 | 400 | Default |
| `body-strong` | 14 / 20 | 600 | Emphasis, table first column |
| `small` | 13 / 18 | 400 | Secondary text, table cells |
| `caption` | 12 / 16 | 500 | Metadata, helper text |
| `overline` | 11 / 14 | 700, uppercase, +0.08em | Kind labels ("APPROVAL"), section eyebrows |
| `mono-sm` | 12 / 16 | 500 | IDs |

### 4.3 Type on the canvas (at 100% zoom)

| Element | Style |
|---|---|
| Lane header | 12 / 16, 600 |
| Stage header | 11 / 14, 600, `--color-text-muted` ("Step c · 2 in parallel") |
| Step kind label | `overline` 10 / 12 (canvas exception; never below 10 px at 100%) |
| Step title | 13 / 17, 600, max 3 lines then ellipsis + tooltip |
| Step meta (Configurator) | 11 / 14, 400, `--color-text-secondary` |
| Badge text (C1, N) | 10 / 12, 700 |
| Edge label ("Yes", "No, skip") | 11 / 14, 600 on a surface-coloured label background |

---

## 5. Spacing, layout & grid

- **Base unit 4 px.** Component padding uses 8, 12 and 16. Section gaps use 24 and 32.
- **Density modes:** *Comfortable* (default) and *Compact* (−25% vertical padding in tables and panels; canvas unaffected).
- **App grid:** the canvas is fluid. Side panels have fixed widths (§8). Content in panels uses a single column with 16 px gutters.
- **Canvas grid:** stage columns are at least 200 px wide; lanes are at least 88 px tall (grows with stacked parallel steps: 72 px per extra step). The lane header column is 140 px.

---

## 6. Shape, elevation & motion

| Element | Radius | Elevation |
|---|---|---|
| Buttons, inputs | `sm` 6 | e0 |
| Cards, panels | `md` 8 | e1 |
| Step nodes | `sm` 6 | e1; e2 on hover |
| Popovers, menus | `md` 8 | e3 |
| Modals | `lg` 12 | e4 |
| Pills / badges | `full` | e0 |

**Motion rules**
- Motion explains change; it never decorates. Use it for scenario pruning (steps fade and collapse in `--dur-base`), panel open/close, and toasts.
- Canvas pan and zoom are never animated by default, except "Fit" (`--dur-slow`).
- Respect `prefers-reduced-motion`: replace transitions with instant changes, and keep the opacity cross-fade at ≤ 120 ms.

---

## 7. Iconography

**Library:** `lucide-react` (already a dependency). Sizes 16 px (inline, nodes) and 20 px (toolbar), stroke 1.75. Icons are never the only label for a primary action: use text, or a tooltip plus `aria-label`.

| Meaning | Icon | Meaning | Icon |
|---|---|---|---|
| Initiation | `Play` | Sub-process | `Workflow` |
| Approval | `BadgeCheck` | Completion | `CircleCheck` |
| Action | `SquarePen` | Condition | `GitBranch` |
| To do | `ListTodo` | Note | `StickyNote` |
| Review | `Eye` | Parallel | `Columns2` |
| Service | `Cog` | Health: critical | `OctagonAlert` |
| Integration | `PlugZap` | Health: warning | `TriangleAlert` |
| Local only (privacy) | `ShieldCheck` | Health: info | `Info` |
| AI Assist | `Sparkles` | Compare | `GitCompare` |
| Import | `FileUp` | Export | `Download` |
| Scenario | `SlidersHorizontal` | Focus role | `ScanSearch` |

---

## 8. App shell & screen layouts

### 8.1 Workspace layout (≥ 1280 px)

```
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ Top bar 56   [logo] BPMap   Project ▾      [ShieldCheck Local only]   [Export ▾] [⋯]   │
├───────────────────────────────────────────────────────────────────────────────────────┤
│ Definition tabs 40   [Change Job (Default) ×] [Propose Compensation ×]  [+ Add file]  │
├───────────────────────────────────────────────────────────────────────────────────────┤
│ Toolbar 48  [Executive|Process owner|Configurator]  − 85% + Fit  Focus: [All roles ▾] │
│             [☐ Condition list]  [Compare]                                [Copy image] │
├─────────────────────────────────────────────────────────────┬─────────────────────────┤
│                                                             │ Right panel 360         │
│                    CANVAS (fluid)                           │ (resizable 300–480)     │
│   title · summary line                                      │ [Health 4][Scenario]    │
│   ┌ stage headers ───────────────────────────────┐          │ [Step][Customise]       │
│   │ lanes × stages grid with step nodes          │          │                         │
│   └──────────────────────────────────────────────┘          │  panel content          │
│   legend · condition list                                   │                         │
├─────────────────────────────────────────────────────────────┴─────────────────────────┤
│ Status bar 28   18 steps · 12 stages · 16 conditional   ⚠ 2 parse warnings   Saved ✓ │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

- **1024–1279 px:** the right panel overlays the canvas as a drawer (e3) and opens with the panel tabs.
- **768–1023 px (tablet):** read-only. The toolbar collapses into an overflow menu.
- **< 768 px:** an informative screen ("BPMap works best on a larger screen") with view-only access to exports.

### 8.2 Import (empty state)

```
┌──────────────────────────────────────────────────────────────┐
│  [display] See your business process as a flow.              │
│  [body] Drop a Workday "View Definition" Excel export.       │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  ⬆  Drop files here, or Choose files                    │  │
│  │     .xlsx · several files allowed (definition + subs)  │  │
│  └────────────────────────────────────────────────────────┘  │
│  [ShieldCheck] Read in this browser. Nothing is uploaded.    │
│  [link] How to get the export (3 steps)   [link] Try sample  │
│  ── Only have a screenshot? [Sparkles] Use AI import (opt-in) │
└──────────────────────────────────────────────────────────────┘
```

The AI import entry is **secondary and violet**, below the fold of the primary path, and always labelled "opt-in".

---

## 9. UI components

Each component lists its **anatomy, variants, states and accessibility**. All interactive components support the states *default, hover, active, focus-visible, disabled* and, where relevant, *loading* and *invalid*.

### 9.1 Button

| Variant | Fill / text | Use |
|---|---|---|
| Primary | `--color-action` / `--color-on-action` | One per view: "Export", "Apply scenario" |
| Secondary | surface / `--color-text`, 1 px `--color-border-strong` | Most actions |
| Ghost | transparent / `--color-text-secondary` | Toolbar, low emphasis |
| Danger | `--color-danger` / white | Destructive (with confirm) |
| AI | `--color-ai-subtle` / `--color-ai`, `Sparkles` icon | Any AI action |

Sizes: `sm` 28 px · `md` 32 px (default) · `lg` 40 px. The minimum target is **24 × 24 px** (WCAG 2.2 AA, 2.5.8); toolbar icon buttons are 32 × 32. Loading replaces the label with a spinner plus "Exporting…" and keeps the width.

### 9.2 Segmented control (view switcher)

Three segments: **Executive · Process owner · Configurator**. Use `role="radiogroup"` with arrow-key navigation. The selected segment is navy-800 with white text (14.64:1). The choice persists per definition.

### 9.3 Tabs

- **Panel tabs** (Health, Scenario, Step, Customise): underline indicator, 2 px `--color-accent`. A count badge appears when there are findings ("Health 4").
- **Definition tabs:** closable chips with the definition name, and a dot when the definition has unsaved overlay edits (autosave is pending).
- Implemented with `role="tablist"`; arrow keys move focus and Enter activates.

### 9.4 Form controls

Inputs, selects and textareas are 32 px tall, with a 1 px `--color-border-strong` border (4.76:1) and a 2 px focus ring. Errors use `--color-danger` text plus an icon below the field and `aria-describedby`. Labels always sit above the field; placeholders never replace labels.

### 9.5 Tri-state condition toggle (Scenario)

```
C3  Custom · step d                                   [Rename]
Job Change is Promotion?
[ Not set | Yes | No ]     ☐ Show as a yes/no decision
```

- "Not set" is the default and is styled neutral. "Yes" uses success styling, and "No" uses neutral plus a strike icon. **Do not use red for No**: No is a valid answer, not an error.
- The C-badge uses the conditional-subtle fill with amber-800 text (6.37:1).
- The ownership tag reads "Workday-owned" (slate) or "Custom" (navy-50). Custom conditions also carry a "re-check after release" tooltip.

### 9.6 Badges & tags

| Badge | Style | Example |
|---|---|---|
| Condition | amber-100 / amber-800, `full` radius, mono 10 px | `C12` |
| Note | navy-800 / white circle, 16 px | `N` |
| Severity | Critical: red-100 / red-800 + `OctagonAlert`; Warning: amber-100 / amber-800 + `TriangleAlert`; Info: sky-100 / sky-800 + `Info` | Health panel |
| Kind tag | overline text, no fill | `APPROVAL · OPTIONAL` |
| Privacy chip | teal-50 / navy-800 + teal `ShieldCheck` "Local only"; violet-50 / violet-700 + `Sparkles` "AI on" | Top bar |
| Diff | Added: green-700 "+"; Removed: red-600 "−"; Modified: navy-600 "~" | Compare |

### 9.7 Health finding card

```
┌ ▌[TriangleAlert] WARNING · HC-06 ─────────────────── [Dismiss ▾] ┐
│ Serial approval chain of 5 steps                                  │
│ Steps d → h each wait for the previous approval. Typical cycle    │
│ time grows by ~2 days per step.                                   │
│ Suggested fix: run h and i in parallel (same order letter).       │
│ [Show steps]                                                      │
└───────────────────────────────────────────────────────────────────┘
```

The left rule (4 px) uses the severity colour. "Show steps" highlights the affected nodes and dims the rest. "Dismiss" asks for a reason, which is stored in the overlay.

### 9.8 Dropzone

The idle state has a dashed 1.5 px `--color-border-strong` border, `radius-lg` corners and a sunken background. The drag-over state uses a teal-600 border, teal-50 fill and the text "Drop to read locally". Errors appear inline with a link to the export guide. The dropzone is keyboard reachable through its "Choose files" button.

### 9.9 Parse report

A popover from the status bar showing rows read, steps built, conditions found and unknown step types. Warnings are listed with codes (`W-ORDER-UNPARSEABLE`) and row numbers. Each warning links to the step.

### 9.10 Feedback: toast, inline alert, modal

- **Toasts** (sonner, already used) appear bottom-right and stay 5 s; errors stay until dismissed.
- **Inline alerts** are for persistent conditions, for example an unsupported column layout.
- **Modals** are for confirmations and AI consent only, never for information. Focus is trapped, Esc closes, and focus returns to the trigger.

### 9.11 AI consent & redaction preview (violet)

```
┌ [Sparkles] Send to AI Assist? ───────────────────────────────────┐
│ Task: Draft plain-English wording for 10 conditions              │
│ Redaction: ☑ Security groups  ☑ People  ☑ IDs  ☐ Condition text │
│ ┌ Exact payload (read-only, monospace) ───────────────────────┐  │
│ │ {"conditions":[{"id":"C3","text":"Job Change is …"}], …}    │  │
│ └─────────────────────────────────────────────────────────────┘  │
│ Sent to: BPMap AI gateway → zero-retention model. Not stored.    │
│                                      [Cancel]  [AI: Send 1.2 KB] │
└──────────────────────────────────────────────────────────────────┘
```

AI output always appears in a violet-50 "AI draft" container with **Accept / Edit / Discard** buttons. Accepted text loses the violet styling and moves into the overlay, with an "AI-assisted" history entry.

### 9.12 Empty, loading and error states

| State | Pattern |
|---|---|
| Empty panel | Icon (20 px, muted) + one sentence + one action |
| Loading (parse) | Determinate progress bar (`--color-accent`) with the stage name: "Reading sheets…", "Building model…" |
| Loading (canvas) | Skeleton lanes; never a spinner over a blank canvas |
| Error | What happened + why (if known) + what to do: "We couldn't find a Steps sheet. Make sure you exported from View Definition. [How to export]" |

---

## 10. Diagram system (canvas)

The canvas implements the PRD notation (§9 there) in React Flow custom nodes.

### 10.1 Grid anatomy

```
              Step a        Step b        Step c · 2 in parallel        Step d
            ┌─────────────┬─────────────┬───────────────────────────┬──────────────┐
 Initiator  │ [START ▸ Initiate]          │                           │              │
 Manager    │             │ ┊C1 Review┊─┐ │                           │ ◇C3?─[Approve]│
 HR Partner │             │             ├─┃─┊C2 Change Org┊─┃──────────┘              │
 Comp. Ptnr │             │             └─┃──[Propose Comp]─┃                         │
 Workday ⚙  │             │             │                           │ No, skip ┄┄┄▸ [⚙ Remove time off] ✓
            └─────────────┴─────────────┴───────────────────────────┴──────────────┘
   ┊ ┊ = dashed amber (conditional)   ┃ = parallel bar   ◇ = decision   ✓ = completion
```

### 10.2 Step node anatomy

```
┌──────────────────────────────────── C1 C4 ┐   ← condition badges (top-right, max 3, then "+2")
│ ICON  APPROVAL · OPTIONAL                  │   ← overline kind label (+ "OPTIONAL", "ALL MUST ACT")
│ Propose Compensation Change                │   ← title: Workday task or overlay label (≤ 3 lines)
│ Due 2 days · Alt: Manager · Routes: Proposed│  ← Configurator meta (hidden in other views)
│ Also: Payroll Partner                      │   ← extra groups
└ N ─────────────────────────────────────────┘   ← note badge (bottom-left)
```

- Width is 168–220 px; height grows with content. Text never shrinks below the §4.3 sizes. It is clamped with an ellipsis, and a tooltip shows the full text.
- **Conditional** is a modifier: any kind can take the dashed amber border. Kind and conditional are independent.
- **Unknown step types** render as an Action node with a `?` icon and a "Unknown type: <raw>" tooltip, and are listed in the parse report.

### 10.3 Node states

| State | Treatment |
|---|---|
| Hover | e2 shadow; ports appear (edit mode only) |
| Selected | 2 px `--color-focus` ring, offset 2 px; the Step panel opens |
| Dimmed (Focus role / Show steps) | 25% opacity, no shadow; edges dimmed |
| Pruned by scenario | Removed. Neighbouring edges reconnect, and empty stages and lanes collapse (`--dur-base` fade) |
| Diff: added | Green 2 px outline + "+" corner tag |
| Diff: removed | Ghost node (40% opacity) + red outline + struck title + "−" tag |
| Diff: modified | Navy-600 outline + "~" tag; the Step panel shows field-level diff |
| AI-assisted label | Small violet `Sparkles` dot (Configurator view only) |

### 10.4 Edges

- **Orthogonal** routing, 1.5 px slate-500, closed arrowheads, 8 px corner radius.
- **"No, skip"** uses the dashed amber edge, labelled once per decision.
- **Highlighted path** (scenario or "Show steps") is 2.5 px `--color-action`, drawn above other edges.
- **Labels** sit on a surface-coloured pill so they stay legible over lanes.

### 10.5 Level of detail (zoom)

| Zoom | What renders |
|---|---|
| ≥ 75% | Everything for the active view |
| 50–74% | Hide meta lines and extra groups; keep badges |
| 30–49% | Kind label and title only; badges become dots |
| < 30% | Coloured blocks with lane and stage headers (minimap-like); titles shown on hover |

### 10.6 Legend & condition list

These are always rendered under the diagram and in every export:
- **Legend:** kinds, the conditional modifier, decision, parallel, completion, and the exceptions sentence: "Not drawn: at an approval or action the person can send back or deny; allowed roles can cancel, rescind or correct (BP security policy)."
- **Condition list:** two columns (`Cn` badge · text · "Workday-owned/Custom · step x"), wrapping across export pages.

---

## 11. Audience views

| Element | Executive | Process owner | Configurator |
|---|---|---|---|
| Layout | Stage cards (one per order letter), flowing 2 rows max | Swimlane grid | Swimlane grid |
| Step title | ✓ | ✓ | ✓ (Workday task name; overlay label shown as subtitle) |
| Lane / group | As caption on the card | Lanes | Lanes + "Also:" groups |
| Conditions | "only if" tag | Dashed + C-badge + list | Same + condition text in the Step panel + rule logic (Phase 3) |
| Due date, alternate, routing, restriction, run-as | — | — | ✓ meta line |
| Notifications | — | — | Bell icon count on the step |
| Legend | Compact (3 items) | Full | Full |
| Target output | One 16:9 slide | A3 / multi-page PDF, PPTX | PPTX + XLSX appendix |

---

## 12. Export themes

All exporters read the **same token JSON** (§15.2) and the same layout "scene". The canvas and the exports therefore can't drift apart.

| Format | Page / canvas | Theme specifics |
|---|---|---|
| **PDF** | A4 / Letter / A3, landscape default; 12 mm margins | Inter embedded; header: definition name + view; footer: "Generated by BPMap · <date> · Independent product…" + page x / y; legend and condition list follow the diagram |
| **PPTX** | 16:9 (13.33 × 7.5 in) | Slide master: title 24 pt navy, footer 9 pt; **native shapes** for nodes, connectors for edges, grouped per lane; conditions slide; one slide per view requested |
| **SVG / PNG** | Diagram bounds + 24 px padding; PNG at 2× | Light theme always (dark exports are opt-in) |
| **draw.io** | Swimlane containers per lane | Styles map 1:1 to node tokens (`dashed=1;strokeColor=#D97706` …) |
| **BPMN 2.0** | — | Semantic only; the DI layout uses the same grid; colours via the `bioc` extension where supported |

**Branding overrides (Pro):** logo (PNG/SVG, ≤ 200 KB), primary and accent colours, footer text. The exporter **checks contrast**: if a custom primary gives white-text contrast below 4.5:1, it falls back to dark text and warns the user. Customer colours never replace the reserved amber (conditional) or violet (AI) meanings.

---

## 13. Content & voice

### 13.1 Voice

- **Plain, specific, calm.** Write as a configurator would talk to a process owner.
- **Short sentences.** Lead with the outcome: "18 steps in 12 stages. 16 are conditional."
- **No hype.** Don't say "magic", "instantly" or "AI-powered" in the core flow. Say what happens.
- **Honest about limits.** For example: "The export gives the condition name, not the rule behind it."

### 13.2 Terminology

| Use | Avoid | Why |
|---|---|---|
| step | node, task box | Workday's own word |
| stage (order a, b, c…) | column, level | Clear, matches order letters |
| security group | role, swimlane (in copy) | Workday's term; "lane" is fine in the canvas UI |
| condition | rule (unless it means the condition-rule logic) | Matches the definition export |
| skipped | rejected, failed | A false condition is not an error |
| definition | flow, diagram (for the data) | The data is the definition; the picture is the diagram |
| send back / deny / cancel / rescind / correct | reject, undo | Workday's terms |
| AI draft | AI answer, AI result | Signals that human review is required |

### 13.3 Microcopy patterns

| Situation | Copy |
|---|---|
| Privacy (import) | "Read in this browser. Nothing is uploaded." |
| Privacy chip tooltip | "Local only: your files and edits stay in this browser. AI Assist is off." |
| Parse success | "Change Job (Default Definition): 18 steps, 12 stages, 16 conditional, 9 security groups." |
| Unknown layout | "We couldn't match 3 columns. Map them once and we'll remember this layout." |
| Scenario active | "Scenario: Promotion · Netherlands. 5 steps won't run." |
| AI consent | "Send this exact text to AI Assist? It's processed by a zero-retention model and not stored." |
| Destructive | "Remove everything from this browser? This deletes all definitions and customisations here. It can't be undone." |

Numbers: use numerals ("3 tasks"), "2 days" not "2 Days" in our own copy, and keep Workday's raw values verbatim inside quotes or the Step panel.

---

## 14. Accessibility

### 14.1 Requirements (WCAG 2.2 AA)

- **Contrast:** text ≥ 4.5:1 (≥ 3:1 for ≥ 18.66 px bold or 24 px). Meaningful UI and graphics boundaries ≥ 3:1.
- **Not colour alone:** conditional = dashed + badge; diff = icon + outline + text; severity = icon + label.
- **Keyboard:**
  - Every control is reachable.
  - Canvas: Tab enters the canvas, arrow keys move between steps (stage order, then lane), Enter opens the Step panel, Esc returns focus to the toolbar.
  - Pan with Space + arrows; `+` / `−` / `0` zoom.
- **Screen readers:** a parallel **Step list view** (`role="treegrid"`) mirrors the canvas, grouped by stage, with group, kind and conditions announced. The canvas nodes carry `aria-label`, for example "Approval, step h, Works Council, runs only if C8 and C9".
- **Targets** ≥ 24 × 24 px. **Focus** is always visible (2 px `--color-focus` + 2 px offset).
- **Reduced motion** is respected (§6). **Zoom** to 200% without loss; the UI reflows at 1280 × 720 at 200%.
- **Exports:** tagged PDF with reading order (title → diagram alt text → legend → condition list); PPTX shapes have alt text.

### 14.2 Verified contrast pairs

Measured with the WCAG relative-luminance formula (10 Nov 2026).

| Pair (foreground / background) | Ratio | Passes |
|---|---|---|
| slate-900 text / white | 17.85 | AA, AAA |
| slate-600 secondary / white | 7.58 | AA, AAA |
| slate-500 muted / white | 4.76 | AA |
| slate-500 muted / slate-50 bg | 4.55 | AA |
| white / navy-800 (approval, selected segment) | 14.64 | AA, AAA |
| slate-300 / navy-800 (meta on dark node) | 9.86 | AA, AAA |
| white / teal-700 (primary button) | 6.13 | AA |
| white / teal-600 | **3.38** | **Large text / non-text only.** This is why buttons use teal-700 |
| amber-600 border / white | 3.19 | Non-text ≥ 3:1 ✓ |
| amber-600 border / slate-50 lane | 3.04 | Non-text ≥ 3:1 ✓ |
| amber-800 / amber-100 (C-badge) | 6.37 | AA |
| red-600 / white | 4.83 | AA |
| red-800 / red-100 (critical badge) | 6.80 | AA |
| green-700 / white | 5.02 | AA |
| green-600 / white (icon only) | 3.30 | Non-text ✓ |
| sky-800 / sky-100 (info badge) | 6.59 | AA |
| violet-700 / white | 7.10 | AA, AAA |
| violet-700 / violet-50 (AI draft) | 6.48 | AA |
| navy-600 / white (focus ring, diff-modified) | 6.60 | AA |
| slate-500 border / white (inputs, node outlines) | 4.76 | Non-text ✓ |
| slate-300 border / white | **1.48** | **Decorative only.** Never for meaningful boundaries |
| slate-400 / white | **2.56** | **Disabled / decorative only** |
| teal-todo border `#3E9C90` / white | 3.30 | Non-text ✓ |
| slate-500 / slate-100 (service node border) | 4.34 | Non-text ✓ |
| *Dark:* slate-200 text / `#0B1220` | 15.19 | AA, AAA |
| *Dark:* slate-400 / surface `#111A2E` | 6.76 | AA |
| *Dark:* `#7B8BA3` border & muted / surface | 5.01 | AA |
| *Dark:* teal-300 / surface | 11.72 | AA, AAA |
| *Dark:* `#0B1220` on teal-300 (primary button) | 12.66 | AA, AAA |
| *Dark:* amber-500 / surface | 8.07 | AA |
| *Dark:* red-400 / surface | 6.27 | AA |
| *Dark:* green-400 / surface | 9.95 | AA |
| *Dark:* violet-300 / surface | 9.39 | AA |
| *Dark:* `#93C5FD` diff-modified / surface | 9.62 | AA |
| *Dark:* white / navy-500 `#3B5F99` (approval) | 6.40 | AA |
| *Dark:* navy-500 fill / surface | **2.71** | **Fails as a boundary**, so dark approval nodes add a `--color-border-strong` outline (5.01) |

---

## 15. Implementation (Tailwind v4 + tokens)

### 15.1 Tailwind v4 theme (replaces the current `src/index.css` `@theme`)

```css
@import "tailwindcss";

@font-face { font-family: "Inter"; src: url("/fonts/InterVariable.woff2") format("woff2"); font-weight: 100 900; font-display: swap; }

@theme {
  --font-sans: "Inter", -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-mono: "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace;

  /* semantic colours — light (default) */
  --color-bg: #F8FAFC;            --color-surface: #FFFFFF;        --color-surface-sunken: #F1F5F9;
  --color-border: #E2E8F0;        --color-border-strong: #64748B;
  --color-text: #0F172A;          --color-text-secondary: #475569; --color-text-muted: #64748B;
  --color-primary: #14284B;       --color-on-primary: #FFFFFF;
  --color-action: #0B6E63;        --color-on-action: #FFFFFF;      --color-accent: #0F9D8A;
  --color-focus: #2F5D9E;
  --color-conditional: #D97706;   --color-conditional-subtle: #FEF3C7; --color-on-conditional-subtle: #92400E;
  --color-ai: #6D28D9;            --color-ai-subtle: #F5F3FF;
  --color-success: #15803D;       --color-danger: #DC2626;         --color-warning: #B45309; --color-info: #075985;
  --color-diff-modified: #2F5D9E;

  --radius-xs: 4px; --radius-sm: 6px; --radius-md: 8px; --radius-lg: 12px; --radius-xl: 16px;
  --shadow-e1: 0 1px 2px rgb(15 23 42 / .06);  --shadow-e2: 0 4px 12px rgb(15 23 42 / .08);
  --shadow-e3: 0 12px 32px rgb(15 23 42 / .14); --shadow-e4: 0 24px 64px rgb(15 23 42 / .22);
  --ease-standard: cubic-bezier(.2,0,0,1);
}

/* dark theme: explicit choice (data-theme="dark"), or system preference (.system-dark set by an
   inline script from matchMedia) unless the user forced light */
:root[data-theme="dark"],
:root:not([data-theme="light"]):where(.system-dark) {
  --color-bg: #0B1220; --color-surface: #111A2E; --color-surface-sunken: #0E1728;
  --color-border: #334155; --color-border-strong: #7B8BA3;
  --color-text: #E2E8F0; --color-text-secondary: #94A3B8; --color-text-muted: #7B8BA3;
  --color-primary: #3B5F99; --color-action: #5EEAD4; --color-on-action: #0B1220; --color-accent: #5EEAD4;
  --color-focus: #8FB0E8; --color-conditional: #F59E0B; --color-conditional-subtle: #3A2A0B; --color-on-conditional-subtle: #FCD34D;
  --color-ai: #C4B5FD; --color-ai-subtle: #221A3D;
  --color-success: #4ADE80; --color-danger: #F87171; --color-warning: #FBBF24; --color-info: #7DD3FC;
  --color-diff-modified: #93C5FD;
}
```

> Implementation note: apply the `.system-dark` class on `<html>` from a tiny inline script that reads `matchMedia('(prefers-color-scheme: dark)')`. This keeps one dark block instead of duplicating it inside the media query. Theme choice is stored per viewer in `localStorage` (wrapped in try/catch).

### 15.2 Token source of truth

`packages/design-tokens/tokens.json` (W3C Design Tokens format) is the source. A build step generates:
- `tokens.css` (the `@theme` block above),
- `tokens.ts` (typed constants for React Flow nodes and exporters),
- `pptx-theme.json` and `drawio-styles.json` (for exporters).

```json
{
  "color": {
    "navy": { "800": { "$value": "#14284B", "$type": "color" } },
    "semantic": {
      "conditional": { "$value": "{color.amber.600}", "$type": "color", "$description": "Reserved: conditional logic only" }
    }
  },
  "node": {
    "approval": { "bg": { "$value": "{color.semantic.primary}" }, "text": { "$value": "{color.semantic.on-primary}" } }
  }
}
```

### 15.3 Component library

- **Primitives:** Radix UI (Tabs, Dialog, Popover, Tooltip, Toggle Group, Dropdown Menu) for accessible behaviour, styled with Tailwind and the tokens.
- **Canvas:** React Flow v12 custom nodes in `features/canvas/nodes/*`. Each node reads **component tokens only**.
- **Workbench:** **Storybook** (or Ladle) with stories for every component and node state, plus Playwright visual snapshots in light and dark.

---

## 16. Governance

- **Versioning:** tokens and components follow semver. Changing a reserved meaning (amber, violet) is a **major** change and needs a decisions-log entry.
- **Contribution:** propose → Storybook story → contrast check (CI script) → visual snapshot review → merge.
- **CI checks:**
  - a contrast linter over `tokens.json` pairs declared in `contrast-pairs.json`;
  - an axe scan on Storybook;
  - visual regression on canvas fixtures (Change Job, Hire, Create Journal).
- **Review cadence:** after each Workday release, re-check that new step types in the fixture corpus have a node style.

---

## 17. Decisions log

| ID | Decision | Rationale |
|---|---|---|
| D-01 | Primary buttons use **teal-700**, not teal-600 | White on teal-600 measures 3.38:1 (fails AA for normal text); teal-700 measures 6.13:1 |
| D-02 | **Violet is reserved for AI**; amber only for conditional logic | The PRD figures used amber for "opt-in / cloud". In the product, amber already means "conditional step", and reusing it would blur the most important notation signal |
| D-03 | Diff "modified" uses **navy-600**, not amber | Same reason as D-02. **Supersedes PRD CMP-02 wording** ("modified = amber") |
| D-04 | Node outlines use **slate-500** (4.76:1); slate-300 is decorative only | Slate-300 is 1.48:1 against white, below the 3:1 non-text minimum |
| D-05 | Dark approval nodes add a strong outline | Navy-500 fill vs the dark surface is 2.71:1 |
| D-06 | Self-host Inter and JetBrains Mono | The privacy NFR forbids third-party font requests |
| D-07 | Conditional is a **modifier** (dashed border), not a node kind | Any kind can be conditional; it keeps the kinds and the condition independent |
| D-08 | No red for a scenario "No" | A false condition is a valid path, not an error |
