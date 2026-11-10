# BPMap for Workday

See Workday business process definitions as a readable swimlane flow, privately in your browser.

> Working product name. Independent product, not affiliated with Workday, Inc. Workday® is a trademark of Workday, Inc.

**Status:** Increment 1 (Phase 0 + the Phase 1 core). Import a *View Definition* Excel export → correct stages, parallel steps, conditions and lanes → customise → export SVG / PNG / project file. Everything runs locally: nothing is uploaded.

## Run it

Requires Node ≥ 22 (developed on Node 26, npm 11).

```bash
npm install
npm run dev          # http://localhost:5173
```

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server for `apps/web` |
| `npm test` | Unit + golden-file tests for all packages (Vitest) |
| `npm run typecheck` | TypeScript 7 over the whole workspace |
| `npm run build` | Production build with CSP (`apps/web/dist`) |
| `npm run check` | typecheck + test + build |
| `npm run fixtures` | Regenerate the synthetic XLSX fixtures and the in-app sample |

## Layout

```
apps/web                 React 19 + Vite 8 app (shell, canvas, panels, import worker, persistence)
packages/model           canonical model: zod schemas, stable IDs, order → stage keys, step kinds
packages/importer-xlsx   worker-safe XLSX reader + Workday normaliser (fflate + fast-xml-parser)
packages/engine-graph    stages, lanes, transitions
packages/engine-layout   deterministic grid placement + gutter edge routing
packages/scene           one display list for canvas background and exports; SVG serialiser
packages/design-tokens   colours/type tokens (TS) + Tailwind CSS mirror
packages/fixtures        SYNTHETIC workbooks + golden snapshot (replace with anonymised real exports)
archive/prototype-v0     the original AI Studio prototype (not built)
```

## Docs

- [PRD](docs/PRD_BPMap_for_Workday.md) ([PDF](docs/PRD_BPMap_for_Workday.pdf)) · [Design System](docs/DESIGN_SYSTEM.md) · [Architecture](docs/ARCHITECTURE.md)
- [Decisions log](docs/DECISIONS.md): every implementation decision and why
- [Execution flow](docs/FLOW.md): what calls what, and what is being changed now
