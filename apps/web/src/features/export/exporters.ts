/**
 * Increment 1 exporters (EXP-01, EXP-07, IMP-07). All local: Blob → download, or clipboard.
 * SVG and PNG come from the same export scene the canvas draws, so they show the full diagram
 * (never the viewport, bug E4) plus legend and condition list.
 */
import { slug, parseProject, withFreshStageKeys, SCHEMA_VERSION, type ProcessDefinition } from '@bpmap/model';
import { toSvg, type Scene } from '@bpmap/scene';
import { isOverlay, type Overlay } from '../../store/overlay.ts';

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
}

export function projectBlob(definitions: ProcessDefinition[], overlays: Record<string, Overlay>): Blob {
  const now = new Date().toISOString();
  const file: ProjectFile = {
    format: 'bpmap',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now,
    project: { schemaVersion: SCHEMA_VERSION, id: 'local', name: definitions[0]?.process ?? 'BPMap project', definitions, createdAt: now, updatedAt: now },
    overlays,
  };
  return new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
}

export async function readProjectFile(file: File): Promise<{ definitions: ProcessDefinition[]; overlays: Record<string, Overlay> }> {
  if (file.size > 25 * 1024 * 1024) throw new Error('This project file is too large.');
  let json: unknown;
  try {
    json = JSON.parse(await file.text());
  } catch {
    throw new Error('This is not a BPMap project file (invalid JSON).');
  }
  const f = json as Partial<ProjectFile>;
  if (f.format !== 'bpmap') throw new Error('This is not a BPMap project file.');
  if (f.schemaVersion !== SCHEMA_VERSION) throw new Error(`Project file version ${f.schemaVersion} is not supported by this version of BPMap.`);
  const parsed = parseProject(f.project);
  if (!parsed.ok) throw new Error(`The project file is damaged: ${parsed.error}`);
  const overlays: Record<string, Overlay> = {};
  for (const [k, v] of Object.entries(f.overlays ?? {})) if (isOverlay(v)) overlays[k] = v;
  return { definitions: parsed.value.definitions.map(withFreshStageKeys), overlays };
}
