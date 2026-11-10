/**
 * Increment 1 exporters (EXP-01, EXP-07, IMP-07). All local: Blob → download, or clipboard.
 * SVG and PNG come from the same export scene the canvas draws, so they show the full diagram
 * (never the viewport, bug E4) plus legend and condition list.
 */
import { slug, parseProject, withFreshStageKeys, SCHEMA_VERSION, type ProcessDefinition } from '@bpmap/model';
import { toSvg, type Scene } from '@bpmap/scene';
import { isView, normaliseOverlay, type Overlay, type View } from '../../store/overlay.ts';
import { isScenarioState, type ScenarioState } from '@bpmap/engine-scenario';

export const fileBase = (def: ProcessDefinition) => slug(`${def.process} ${def.variant}`) || 'business-process';
const title = (def: ProcessDefinition) => (def.variant ? `${def.process} (${def.variant})` : def.process);

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const svgBlob = (def: ProcessDefinition, scene: Scene) => new Blob([toSvg(scene, title(def))], { type: 'image/svg+xml' });

/** Rasterise the SVG at 2× (EXP-01). Uses a blob: image, allowed by the CSP img-src. */
export async function pngBlob(def: ProcessDefinition, scene: Scene, scale = 2): Promise<Blob> {
  const url = URL.createObjectURL(svgBlob(def, scene));
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(scene.width * scale);
    canvas.height = Math.ceil(scene.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not available in this browser.');
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    return await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('PNG encoding failed'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function copyPng(def: ProcessDefinition, scene: Scene): Promise<void> {
  if (!('ClipboardItem' in window) || !navigator.clipboard?.write) throw new Error('This browser cannot copy images. Use Download PNG instead.');
  // Pass the promise so Safari keeps the user-gesture context.
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob(def, scene) })]);
}

/* ---------------------------------------------------------------- project file (IMP-07) */

export interface ProjectFile {
  format: 'bpmap';
  schemaVersion: number;
  exportedAt: string;
  project: { schemaVersion: number; id: string; name: string; definitions: ProcessDefinition[]; createdAt: string; updatedAt: string };
  overlays: Record<string, Overlay>;
  scenarios?: Record<string, ScenarioState>;
  views?: Record<string, View>;
}

export interface ProjectContents {
  definitions: ProcessDefinition[];
  overlays: Record<string, Overlay>;
  scenarios: Record<string, ScenarioState>;
  views: Record<string, View>;
}

export function projectBlob({ definitions, overlays, scenarios, views }: ProjectContents): Blob {
  const now = new Date().toISOString();
  const file: ProjectFile = {
    format: 'bpmap',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now,
    project: { schemaVersion: SCHEMA_VERSION, id: 'local', name: definitions[0]?.process ?? 'BPMap project', definitions, createdAt: now, updatedAt: now },
    overlays,
    scenarios,
    views,
  };
  return new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
}

export async function readProjectFile(file: File, preParsed?: unknown): Promise<ProjectContents> {
  if (file.size > 25 * 1024 * 1024) throw new Error('This project file is too large.');
  let json: unknown = preParsed;
  if (json === undefined) {
    try {
      json = JSON.parse(await file.text());
    } catch {
      throw new Error('This is not a BPMap project file (invalid JSON).');
    }
  }
  const f = json as Partial<ProjectFile>;
  if (f.format !== 'bpmap') throw new Error('This is not a BPMap project file.');
  if (f.schemaVersion !== SCHEMA_VERSION) throw new Error(`Project file version ${f.schemaVersion} is not supported by this version of BPMap.`);
  const parsed = parseProject(f.project);
  if (!parsed.ok) throw new Error(`The project file is damaged: ${parsed.error}`);
  const overlays: Record<string, Overlay> = {};
  for (const [k, v] of Object.entries(f.overlays ?? {})) {
    const o = normaliseOverlay(v);
    if (o) overlays[k] = o;
  }
  const scenarios: Record<string, ScenarioState> = {};
  for (const [k, v] of Object.entries(f.scenarios ?? {})) if (isScenarioState(v)) scenarios[k] = v;
  const views: Record<string, View> = {};
  for (const [k, v] of Object.entries(f.views ?? {})) if (isView(v)) views[k] = v;
  return { definitions: parsed.value.definitions.map(withFreshStageKeys), overlays, scenarios, views };
}

/* ---------------------------------------------------------------- customisations file (CUS-03) */

/**
 * Only the customisations for ONE definition: no Workday data except the process name it belongs to,
 * so a colleague can apply them to their own export of the same process (DEC-050).
 */
export interface CustomisationsFile {
  format: 'bpmap-customisations';
  schemaVersion: 1;
  exportedAt: string;
  definition: { process: string; variant: string };
  overlay: Overlay;
  presets: ScenarioState['presets'];
  view?: View;
}

export function customisationsBlob(def: ProcessDefinition, overlay: Overlay, scenario: ScenarioState | undefined, view: View | undefined): Blob {
  const file: CustomisationsFile = {
    format: 'bpmap-customisations',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    definition: { process: def.process, variant: def.variant },
    overlay,
    presets: scenario?.presets ?? [],
    ...(view ? { view } : {}),
  };
  return new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
}

export const sameDefinition = (a: { process: string; variant: string }, b: { process: string; variant: string }) =>
  a.process.trim().toLowerCase() === b.process.trim().toLowerCase() && a.variant.trim().toLowerCase() === b.variant.trim().toLowerCase();

export type OpenedFile = { kind: 'project'; contents: ProjectContents } | { kind: 'customisations'; file: CustomisationsFile };

/** "Open" accepts a project file or a customisations file; the format field decides. */
export async function readBpmapFile(file: File): Promise<OpenedFile> {
  if (file.size > 25 * 1024 * 1024) throw new Error('This file is too large.');
  let json: unknown;
  try {
    json = JSON.parse(await file.text());
  } catch {
    throw new Error('This is not a BPMap file (invalid JSON).');
  }
  const f = json as Partial<CustomisationsFile>;
  if (f?.format !== 'bpmap-customisations') return { kind: 'project', contents: await readProjectFile(file, json) };
  if (f.schemaVersion !== 1) throw new Error(`Customisations file version ${f.schemaVersion} is not supported by this version of BPMap.`);
  const overlay = normaliseOverlay(f.overlay);
  const d = f.definition;
  if (!overlay || !d || typeof d.process !== 'string' || typeof d.variant !== 'string') throw new Error('The customisations file is damaged.');
  const presets = isScenarioState({ answers: {}, decisions: [], presets: f.presets }) ? f.presets! : [];
  return { kind: 'customisations', file: { format: 'bpmap-customisations', schemaVersion: 1, exportedAt: String(f.exportedAt ?? ''), definition: { process: d.process, variant: d.variant }, overlay, presets, ...(isView(f.view) ? { view: f.view } : {}) } };
}

/* ---------------------------------------------------------------- Increment 2.2 formats (lazy) */

export interface ExportPage {
  title: string;
  scene: Scene;
}

export async function pptxBlob(pages: ExportPage[], title: string): Promise<Blob> {
  const { buildPptx } = await import('@bpmap/exporters');
  const pptx = buildPptx(pages, { title });
  return (await pptx.write({ outputType: 'blob' })) as Blob;
}

export async function drawioBlob(pages: ExportPage[]): Promise<Blob> {
  const { toDrawio } = await import('@bpmap/exporters');
  return new Blob([toDrawio(pages.map((p) => ({ name: p.title, scene: p.scene })))], { type: 'application/xml' });
}

export async function pdfBlob(pages: ExportPage[]): Promise<Blob> {
  const { pdfBlob: render } = await import('./pdf.ts');
  return render(pages);
}
