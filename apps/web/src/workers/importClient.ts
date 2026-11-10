/**
 * Main-thread side of the import worker. The worker is created lazily on first import so the
 * import screen loads without parsing code (performance budget, Architecture §23).
 */
import * as Comlink from 'comlink';
import type { ImportOptions, ImportOutcome } from '@bpmap/importer-xlsx';
import type { ImportApi } from './import.worker.ts';

let api: Comlink.Remote<ImportApi> | null = null;

function worker(): Comlink.Remote<ImportApi> {
  if (!api) {
    const w = new Worker(new URL('./import.worker.ts', import.meta.url), { type: 'module', name: 'bpmap-import' });
    api = Comlink.wrap<ImportApi>(w);
  }
  return api;
}

/** Transfers the buffer (zero-copy); callers pass a copy if they still need the bytes. */
export function importFile(bytes: Uint8Array, opts: ImportOptions): Promise<ImportOutcome> {
  return worker().importFile(Comlink.transfer(bytes, [bytes.buffer as ArrayBuffer]), opts) as Promise<ImportOutcome>;
}
