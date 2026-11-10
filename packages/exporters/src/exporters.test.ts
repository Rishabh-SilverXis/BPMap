import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { XMLValidator } from 'fast-xml-parser';
import { readFixture } from '@bpmap/fixtures';
import { importWorkbook } from '@bpmap/importer-xlsx';
import { buildGraph } from '@bpmap/engine-graph';
import { layout } from '@bpmap/engine-layout';
import { buildExportScene } from '@bpmap/scene';
import { buildPptx, flatten, toDrawio } from './index.ts';

const r = importWorkbook(readFixture('workdayLayout'), { importedAt: 'x' });
if (r.status !== 'ok') throw new Error('fixture');
const g = buildGraph(r.definition);
const L = layout(g);
const owner = buildExportScene(r.definition, g, L, 'light', { view: 'owner' });
const exec = buildExportScene(r.definition, g, L, 'light', { view: 'executive' });

describe('draw.io export (EXP-04)', () => {
  const xml = toDrawio([{ name: 'Change Job · Process owner', scene: owner }, { name: 'Executive', scene: exec }]);
  it('is well-formed XML with one page per scene', () => {
    expect(XMLValidator.validate(xml)).toBe(true);
    expect(xml.match(/<diagram /g)).toHaveLength(2);
  });
  it('turns every primitive into an editable cell; lines become edges with arrowheads', () => {
    const prims = flatten(owner);
    const page1 = xml.split('<diagram ')[1]!;
    expect(page1.match(/vertex="1"/g)!.length).toBe(prims.filter((p) => p.t !== 'path').length + 1); // + background
    expect(page1.match(/edge="1"/g)!.length).toBe(prims.filter((p) => p.t === 'path').length);
    expect(page1).toContain('rhombus;');
    expect(page1).toContain('endArrow=block');
    expect(page1).toContain('value="Assign Pay Group"');
  });
  it('escapes text and never enables HTML labels', () => {
    const hostile = buildExportScene(r.definition, g, L, 'light', { labels: { [r.definition.steps[0]!.id]: '<img src=x onerror=alert(1)> & "q"' } });
    const x = toDrawio([{ name: 'x', scene: hostile }]);
    expect(XMLValidator.validate(x)).toBe(true);
    expect(x).not.toContain('<img');
    expect(x).not.toContain('html=1');
  });
});

describe('PowerPoint export (EXP-03)', async () => {
  const pptx = buildPptx([{ title: 'Process owner', scene: owner }, { title: 'Executive', scene: exec }], { title: 'Change Job' });
  const bytes = new Uint8Array((await pptx.write({ outputType: 'uint8array' })) as Uint8Array);
  const zip = unzipSync(bytes);
  const slide1 = strFromU8(zip['ppt/slides/slide1.xml']!);
  it('produces a valid package with one slide per view', () => {
    expect(Object.keys(zip).filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k))).toHaveLength(2);
    expect(XMLValidator.validate(slide1)).toBe(true);
  });
  it('uses native shapes (no pictures) and keeps the text editable', () => {
    expect(slide1).not.toContain('<p:pic>');
    expect(slide1).toContain('prst="diamond"');
    expect(slide1).toContain('prst="roundRect"');
    expect(slide1).toContain('Assign Pay Group');
    expect(slide1).toContain('type="triangle"'); // arrowheads on connectors
    const shapes = slide1.match(/<p:sp>/g)!.length;
    expect(shapes).toBeGreaterThan(flatten(owner).length); // paths become one line per segment
  });
  it('sizes the slide within PowerPoint limits (≤ 56 in)', () => {
    const pres = strFromU8(zip['ppt/presentation.xml']!);
    const cx = Number(/<p:sldSz cx="(\d+)"/.exec(pres)![1]);
    expect(cx / 914400).toBeLessThanOrEqual(56.01);
  });
});
