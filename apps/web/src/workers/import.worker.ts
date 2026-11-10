/// <reference lib="webworker" />
/**
 * Import worker (Architecture §7.1). XLSX parsing runs off the main thread so a large export
 * never freezes the UI. The worker has no network code paths: it only receives bytes and returns
 * the plain-object ImportOutcome.
 */
import * as Comlink from 'comlink';
import { importWorkbook, type ImportOptions } from '@bpmap/importer-xlsx';

const api = {
  importFile(bytes: Uint8Array, opts: ImportOptions) {
    return importWorkbook(bytes, opts);
  },
};

export type ImportApi = typeof api;
Comlink.expose(api);
