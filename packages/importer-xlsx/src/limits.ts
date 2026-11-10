/** Hardening limits (Architecture §7.2, NFR-SEC-02). Exported so the UI can show them in messages. */
export const LIMITS = {
  maxFileBytes: 25 * 1024 * 1024,
  maxZipEntries: 2000,
  maxUncompressedBytes: 150 * 1024 * 1024,
  maxRowsPerSheet: 20_000,
  maxCellChars: 4000,
  headerSearchRows: 15,
} as const;

export type Limits = typeof LIMITS;
