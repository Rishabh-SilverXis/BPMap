import { describe, expect, it } from 'vitest';
import { readFixture } from '@bpmap/fixtures';
import { importWorkbook } from '@bpmap/importer-xlsx';
import { buildGraph } from '@bpmap/engine-graph';
import { layout } from '@bpmap/engine-layout';
import { buildExportScene, toSvg, wrapText, type SceneItem } from './index.ts';

const r = importWorkbook(readFixture('changeJob'), { importedAt: '2026-11-10T00:00:00.000Z' });
if (r.status !== 'ok') throw new Error('fixture failed to import');
const g = buildGraph(r.definition);
const L = layout(g);

const flat = (items: SceneItem[]): SceneItem[] => items.flatMap((i) => (i.t === 'group' ? [i, ...flat(i.children)] : [i]));

describe('scene + SVG export (EXP-01, VIS-03, VIS-06)', () => {
  const scene = buildExportScene(r.definition, g, L);
  const svg = toSvg(scene, 'Change Job');

  it('contains every step, the legend and the condition list', () => {
    const roles = flat(scene.items).filter((i) => i.t === 'group').map((i) => (i as { role: string }).role);
    expect(roles.filter((x) => x === 'step')).toHaveLength(18);
    expect(roles).toContain('legend');
    expect(roles).toContain('conditions');
    expect(svg).toContain('Not drawn on every step');
  });

  it('draws conditional steps dashed in amber and non-conditional ones solid (VIS-03)', () => {
    const stepGroups = scene.items.filter((i): i is Extract<SceneItem, { t: 'group' }> => i.t === 'group' && i.role === 'step');
    const outline = (id: string) => stepGroups.find((s) => s.id === id)!.children[0] as Extract<SceneItem, { t: 'rect' }>;
    expect(outline('b-action-review-current-manager').dash).toBeDefined();
    expect(outline('b-action-review-current-manager').stroke).toBe('#D97706');
    expect(outline('a-initiation-initiation').dash).toBeUndefined();
  });

  it('never draws a backwards edge, so no "return to initiation" (bug D1 regression)', () => {
    const arrows = flat(scene.items).filter((i) => i.t === 'path' && i.arrow) as Extract<SceneItem, { t: 'path' }>[];
    expect(arrows.length).toBeGreaterThan(0);
    for (const p of arrows) expect(p.points.at(-1)![0]).toBeGreaterThan(p.points[0]![0]);
  });

  it('escapes imported/overlay text (XSS guard) and is byte-stable', () => {
    const hostile = toSvg(buildExportScene(r.definition, g, L, 'light', { labels: { 'a-initiation-initiation': '<script>alert("x")</script> & co' } }));
    expect(hostile).not.toContain('<script>');
    expect(hostile).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(toSvg(buildExportScene(r.definition, g, L), 'Change Job')).toBe(svg);
  });

  it('wraps and ellipsises long titles', () => {
    const lines = wrapText('Manage Business Processes for Worker After a Very Long Change', 168, 13, 600, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1]!.endsWith('…')).toBe(true);
  });
});

describe('decision labels (DEC-032)', () => {
  it('reads as plain words, not "+"', async () => {
    const { conditionPhrase } = await import('./index.ts');
    expect(conditionPhrase(['C5', 'C6'])).toBe('C5 and C6');
    expect(conditionPhrase(['C4', 'C8', 'C9'])).toBe('C4, C8 and C9');
    expect(conditionPhrase(['C6', 'C3', 'C8'])).toBe('C3, C6 and C8'); // numeric, not row order
    expect(conditionPhrase(['C1', 'C2', 'C3', 'C4'])).toBe('4 conditions');
  });
});

describe('executive scene (VW-01)', () => {
  it('draws one stage card per stage, not as interactive step groups', async () => {
    const { buildExportScene: build } = await import('./index.ts');
    const ex = build(r.definition, g, L, 'light', { view: 'executive' });
    const roles = flat(ex.items).filter((i) => i.t === 'group').map((i) => (i as { role: string }).role);
    expect(roles.filter((x) => x === 'stage-card')).toHaveLength(g.stages.length);
    expect(roles).not.toContain('step');
  });
});

describe('executive captions and header on the real Workday layout (F-01..F-03, DEC-040)', () => {
  it('keeps "process complete", never truncates "only if", shows effective/due dates', async () => {
    const { buildExportScene: build, toSvg: svgOf } = await import('./index.ts');
    const rr = importWorkbook(readFixture('workdayLayout'), { importedAt: 'x' });
    if (rr.status !== 'ok') throw new Error('fixture');
    const gg = buildGraph(rr.definition);
    const ex = build(rr.definition, gg, layout(gg), 'light', { view: 'executive' });
    const texts = flat(ex.items).filter((i): i is Extract<SceneItem, { t: 'text' }> => i.t === 'text').map((i) => i.text);
    expect(texts).toContain('✓ Process complete after this step');
    expect(texts.filter((t) => t.includes('only if') && t.endsWith('…'))).toEqual([]);
    expect(texts.some((t) => t === 'only if C5, C6, C7 and C8' || t.startsWith('only if C5, C6, C7'))).toBe(true); // full list, not "4 conditions"
    const header = svgOf(ex, 'x');
    expect(header).toContain('effective 2026-11-10');
    expect(header).toContain('overall due 1 Week');
  });
});
