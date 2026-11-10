import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { XMLParser } from 'fast-xml-parser';
import { readWorkbook } from '../../importer-xlsx/src/xlsx.ts';
import { LIMITS } from '../../importer-xlsx/src/limits.ts';
import { buildXlsx, colName } from './xlsx.ts';

describe('XLSX writer (EXP-08)', () => {
  const bytes = buildXlsx(
    [
      { name: 'Steps', columns: [{ header: 'Order' }, { header: 'Step' }, { header: 'Due (days)' }], rows: [['a', 'Initiation', null], ['ba', 'Review: <Manager> & "HR"', 2], ['c', '=HYPERLINK("http://x")', 3]] },
      { name: 'Health: findings / [all]', columns: [{ header: 'Rule' }], rows: [['HC-01']] },
      { name: 'Steps', columns: [{ header: 'X' }], rows: [] },
    ],
    { title: 'Change Job' },
  );

  it('round-trips through our own XLSX reader (text, escaping, numbers)', () => {
    const sheets = readWorkbook(bytes, LIMITS);
    expect(sheets.map((s) => s.name)).toEqual(['Steps', 'Health  findings    all', 'Steps 2']);
    expect(sheets[0]!.rows).toEqual([
      ['Order', 'Step', 'Due (days)'],
      ['a', 'Initiation'], // empty trailing cell is not written
      ['ba', 'Review: <Manager> & "HR"', '2'],
      ['c', '=HYPERLINK("http://x")', '3'],
    ]);
  });

  it('writes text as inline strings (never formulas) and numbers as numbers', () => {
    const xml = strFromU8(unzipSync(bytes)['xl/worksheets/sheet1.xml']!);
    expect(xml).not.toContain('<f>');
    expect(xml).toContain('<c r="C3" s="2"><v>2</v></c>');
    expect(xml).toContain('t="inlineStr"');
    expect(xml).toContain('state="frozen"');
    expect(() => new XMLParser().parse(xml)).not.toThrow();
  });

  it('names columns like Excel', () => {
    expect([0, 25, 26, 51, 52, 701, 702].map(colName)).toEqual(['A', 'Z', 'AA', 'AZ', 'BA', 'ZZ', 'AAA']);
  });
});
