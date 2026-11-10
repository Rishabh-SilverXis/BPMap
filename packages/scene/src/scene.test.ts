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
