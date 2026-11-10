import { describe, expect, it } from 'vitest';
import { readFixture } from '@bpmap/fixtures';
import { importWorkbook } from '@bpmap/importer-xlsx';
import { buildGraph } from '@bpmap/engine-graph';
import { layout } from '@bpmap/engine-layout';
import { buildConditionsScene, buildCoverScene, buildExportScene, toSvg, wrapText, type SceneItem } from './index.ts';

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

describe('plain-word conditions in the condition list (CUS-01, US-07)', () => {
  const c1 = r.definition.conditions[0]!;
  const texts = (s: ReturnType<typeof buildExportScene>) =>
    flat(s.items.filter((i) => i.t === 'group' && i.role === 'conditions'))
      .filter((i): i is Extract<SceneItem, { t: 'text' }> => i.t === 'text')
      .map((t) => t.text);

  it('shows the plain words first and keeps the Workday text underneath', () => {
    const t = texts(buildExportScene(r.definition, g, L, 'light', { conditionText: { [c1.id]: 'Transfer was requested' } }));
    const i = t.indexOf('Transfer was requested');
    expect(i).toBeGreaterThan(0);
    expect(t[i + 1]).toMatch(/^Workday: /);
  });

  it('without plain words the list is unchanged', () => {
    expect(texts(buildExportScene(r.definition, g, L))).toEqual(texts(buildExportScene(r.definition, g, L, 'light', { conditionText: {} })));
  });
});

describe('extra export pages (EXP-03, PCK-03)', () => {
  const textsOf = (sc: { items: SceneItem[] }) => flat(sc.items).filter((i): i is Extract<SceneItem, { t: 'text' }> => i.t === 'text').map((t) => t.text);

  it('conditions page: every condition with its badge, plain words first, 16:9 at least', () => {
    const c1 = r.definition.conditions[0]!;
    const page = buildConditionsScene(r.definition, 'light', { [c1.id]: 'Transfer was requested' })!;
    const t = textsOf(page);
    for (const c of r.definition.conditions) expect(t).toContain(c.id);
    expect(t.indexOf('Transfer was requested')).toBeLessThan(t.findIndex((x) => x.startsWith('Workday: ')));
    expect(page.width).toBe(1600);
    expect(page.height).toBeGreaterThanOrEqual(900);
    expect(toSvg(page)).toContain('Conditions');
  });

  it('no conditions → no page', () => {
    expect(buildConditionsScene({ ...r.definition, conditions: [] })).toBeNull();
  });

  it('cover lists every definition with its health counts and grows for long packs', () => {
    const entry = { name: 'Change Job', view: 'Process owner', summary: '18 steps', health: { critical: 1, warning: 2, info: 0 } };
    const cover = buildCoverScene({ title: 'Pack', date: '11 November 2026', entries: [entry, { ...entry, name: 'Hire', health: { critical: 0, warning: 0, info: 0 } }] });
    const t = textsOf(cover);
    expect(t).toEqual(expect.arrayContaining(['Pack', 'Change Job', 'Hire', '1 · 2 · 0', 'No findings']));
    const long = buildCoverScene({ title: 'Pack', date: 'd', entries: Array.from({ length: 30 }, (_, i) => ({ ...entry, name: `Process ${i}` })) });
    expect(long.height).toBeGreaterThan(900);
  });
});
