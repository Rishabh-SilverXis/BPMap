/**
 * Minimal XLSX writer (EXP-08): plain sheets of rows → a valid Office Open XML workbook, zipped with
 * fflate (already used by the importer, so no new dependency). Deliberately small:
 *   - text is written as inline strings (t="inlineStr"), which Excel never evaluates as formulas,
 *     so a cell like "=HYPERLINK(...)" from an export stays text (no formula injection);
 *   - numbers are written as numbers; header row bold, frozen, with an auto-filter;
 *   - characters XML 1.0 forbids (control chars) are dropped.
 */
import { strToU8, zipSync } from 'fflate';

export type Cell = string | number | boolean | null | undefined;
export interface SheetSpec {
  name: string;
  columns: { header: string; width?: number }[];
  rows: Cell[][];
}

// eslint-disable-next-line no-control-regex
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
const esc = (s: string) => s.replace(INVALID_XML, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A1-style column letters: 0 → A, 25 → Z, 26 → AA. */
export function colName(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Excel sheet names: ≤ 31 chars, none of []:*?/\ , unique. */
function sheetNames(specs: SheetSpec[]): string[] {
  const used = new Set<string>();
  return specs.map((s, i) => {
    const base = (s.name.replace(/[[\]:*?/\\]/g, ' ').trim() || `Sheet${i + 1}`).slice(0, 31);
    let name = base;
    for (let k = 2; used.has(name.toLowerCase()); k++) name = `${base.slice(0, 31 - String(k).length - 1)} ${k}`;
    used.add(name.toLowerCase());
    return name;
  });
}

function cellXml(ref: string, v: Cell, style: number): string {
  if (v === null || v === undefined || v === '') return '';
  const s = style ? ` s="${style}"` : '';
  if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${s}><v>${v}</v></c>`;
  const text = typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v);
  const space = /^\s|\s$|\n/.test(text) ? ' xml:space="preserve"' : '';
  return `<c r="${ref}" t="inlineStr"${s}><is><t${space}>${esc(text)}</t></is></c>`;
}

function sheetXml(spec: SheetSpec): string {
  const ncol = spec.columns.length;
  const cols = spec.columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width ?? 18}" customWidth="1"/>`).join('');
  const header = `<row r="1">${spec.columns.map((c, i) => cellXml(`${colName(i)}1`, c.header, 1)).join('')}</row>`;
  const body = spec.rows.map((r, ri) => `<row r="${ri + 2}">${r.slice(0, ncol).map((v, ci) => cellXml(`${colName(ci)}${ri + 2}`, v, 2)).join('')}</row>`).join('');
  const last = `${colName(Math.max(0, ncol - 1))}${spec.rows.length + 1}`;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<cols>${cols}</cols><sheetData>${header}${body}</sheetData>` +
    (ncol ? `<autoFilter ref="A1:${last}"/>` : '') +
    `</worksheet>`
  );
}

const STYLES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
  `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
  `<borders count="1"><border/></borders>` +
  `<cellStyleXfs count="1"><xf/></cellStyleXfs>` +
  `<cellXfs count="3"><xf/><xf fontId="1" applyFont="1"/><xf applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs>` +
  `</styleSheet>`;

export function buildXlsx(specs: SheetSpec[], meta: { title?: string } = {}): Uint8Array {
  const names = sheetNames(specs);
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
        `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
        specs.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
        `</Types>`,
    ),
    '_rels/.rels': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
        `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
        `</Relationships>`,
    ),
    'docProps/core.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">` +
        `<dc:title>${esc(meta.title ?? 'BPMap')}</dc:title><dc:creator>BPMap (independent; not affiliated with Workday, Inc.)</dc:creator></cp:coreProperties>`,
    ),
    'xl/workbook.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>` +
        names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
        `</sheets>` +
        (specs.length ? `<definedNames>${names.map((n, i) => (specs[i]!.columns.length ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${esc(n.replace(/'/g, "''"))}'!$A$1:$${colName(specs[i]!.columns.length - 1)}$${specs[i]!.rows.length + 1}</definedName>` : '')).join('')}</definedNames>` : '') +
        `</workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        specs.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
        `<Relationship Id="rId${specs.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        `</Relationships>`,
    ),
    'xl/styles.xml': strToU8(STYLES),
  };
  specs.forEach((s, i) => (files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s))));
  return zipSync(files, { level: 6 });
}
