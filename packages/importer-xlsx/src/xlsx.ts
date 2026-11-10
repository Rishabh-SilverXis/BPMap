/**
 * Minimal, worker-safe XLSX reader (DEC-006): fflate for unzip, fast-xml-parser for XML.
 * Returns every sheet as a dense grid of strings. Formulas are never evaluated; we read cached
 * values only (Architecture §7.2).
 *
 * Zip-bomb guard: fflate's `filter` callback sees each entry's declared uncompressed size *before*
 * inflation, so we stop at the entry/size limits without allocating the payload.
 */
import { unzipSync, strFromU8 } from 'fflate';
import { XMLParser } from 'fast-xml-parser';
import type { Limits } from './limits.ts';

export interface SheetGrid {
  name: string;
  rows: string[][]; // dense; missing cells are ''
  truncatedRows: boolean;
}

export class XlsxError extends Error {
  constructor(
    public code: 'E-NOT-XLSX' | 'E-TOO-LARGE' | 'E-ZIP-LIMITS',
    message: string,
  ) {
    super(message);
  }
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  isArray: (name) => ['sheet', 'si', 'r', 'row', 'c', 'Relationship'].includes(name),
});

type XNode = Record<string, unknown>;

/** Text of a <t> node, which fast-xml-parser yields as a string or {#text, @_xml:space}. */
function tText(t: unknown): string {
  if (t == null) return '';
  if (typeof t === 'string' || typeof t === 'number') return String(t);
  if (typeof t === 'object' && '#text' in (t as XNode)) return String((t as XNode)['#text'] ?? '');
  return '';
}

/** Shared-string or inline-string item: plain <t> or rich text runs <r><t>. */
function itemText(si: XNode | undefined): string {
  if (!si) return '';
  if (si.t !== undefined) return tText(si.t);
  const runs = (si.r as XNode[] | undefined) ?? [];
  return runs.map((r) => tText(r.t)).join('');
}

function colIndex(ref: string): number {
  let n = 0;
  for (const ch of ref) {
    const c = ch.charCodeAt(0);
    if (c < 65 || c > 90) break; // stop at the row digits
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

const WANTED = /^(xl\/workbook\.xml|xl\/_rels\/workbook\.xml\.rels|xl\/sharedStrings\.xml|xl\/worksheets\/[^/]+\.xml)$/;

export function readWorkbook(bytes: Uint8Array, limits: Limits): SheetGrid[] {
  if (bytes.byteLength > limits.maxFileBytes) {
    throw new XlsxError('E-TOO-LARGE', `File is larger than ${limits.maxFileBytes / 1024 / 1024} MB.`);
  }
  // XLSX is a ZIP: must start with "PK\x03\x04".
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new XlsxError('E-NOT-XLSX', 'This is not an Excel (.xlsx) file.');
  }

  let entries = 0;
  let total = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter(f) {
        entries += 1;
        total += f.originalSize;
        if (entries > limits.maxZipEntries || total > limits.maxUncompressedBytes) {
          throw new XlsxError('E-ZIP-LIMITS', 'The file expands to more data than an Excel export should. It was not opened.');
        }
        return WANTED.test(f.name);
      },
    });
  } catch (e) {
    if (e instanceof XlsxError) throw e;
    throw new XlsxError('E-NOT-XLSX', 'The file could not be read as an Excel workbook.');
  }

  const wbXml = files['xl/workbook.xml'];
  if (!wbXml) throw new XlsxError('E-NOT-XLSX', 'The workbook has no sheets (xl/workbook.xml missing).');

  const wb = parser.parse(strFromU8(wbXml)) as XNode;
  const sheets = (((wb.workbook as XNode)?.sheets as XNode)?.sheet as XNode[]) ?? [];
  const relsXml = files['xl/_rels/workbook.xml.rels'];
  const rels = relsXml ? (((parser.parse(strFromU8(relsXml)) as XNode).Relationships as XNode)?.Relationship as XNode[]) ?? [] : [];
  const relTarget = new Map(rels.map((r) => [String(r['@_Id']), String(r['@_Target'])]));

  const ssXml = files['xl/sharedStrings.xml'];
  const shared: string[] = ssXml
    ? ((((parser.parse(strFromU8(ssXml)) as XNode).sst as XNode)?.si as XNode[]) ?? []).map(itemText)
    : [];

  return sheets.map((s, i) => {
    const rid = String(s['@_r:id'] ?? '');
    let target = relTarget.get(rid) ?? `worksheets/sheet${i + 1}.xml`;
    target = target.replace(/^\/?xl\//, '').replace(/^\//, '');
    const xml = files[`xl/${target}`];
    const name = String(s['@_name'] ?? `Sheet${i + 1}`);
    if (!xml) return { name, rows: [], truncatedRows: false };

    const ws = parser.parse(strFromU8(xml)) as XNode;
    const rowNodes = (((ws.worksheet as XNode)?.sheetData as XNode)?.row as XNode[]) ?? [];
    const rows: string[][] = [];
    let truncatedRows = false;
    for (const row of rowNodes) {
      const r = Number(row['@_r'] ?? rows.length + 1) - 1;
      if (r >= limits.maxRowsPerSheet) {
        truncatedRows = true;
        break;
      }
      const out: string[] = [];
      for (const c of (row.c as XNode[]) ?? []) {
        const ref = String(c['@_r'] ?? '');
        const ci = ref ? colIndex(ref) : out.length;
        const type = String(c['@_t'] ?? 'n');
        const v = c.v === undefined ? '' : tText(c.v);
        let text: string;
        if (type === 's') text = shared[Number(v)] ?? '';
        else if (type === 'inlineStr') text = itemText(c.is as XNode);
        else if (type === 'b') text = v === '1' ? 'TRUE' : 'FALSE';
        else text = v; // str, n, e, d
        out[ci] = text;
      }
      rows[r] = Array.from(out, (x) => x ?? '');
    }
    return { name, rows: Array.from(rows, (x) => x ?? []), truncatedRows };
  });
}
