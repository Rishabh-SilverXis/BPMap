import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { semantic } from './index.ts';

const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');
const block = (selectorStart: string) => {
  const i = css.indexOf(selectorStart);
  return css.slice(i, css.indexOf('}', i));
};

function lum(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x! + 0.05) / (y! + 0.05);
};

describe('tokens.css mirrors the TypeScript source (DEC-012)', () => {
  for (const theme of ['light', 'dark'] as const) {
    const scope = block(theme === 'light' ? '@theme' : ':root[data-theme="dark"]');
    for (const [name, value] of Object.entries(semantic[theme])) {
      it(`${theme} --color-${name}`, () => {
        expect(scope).toContain(`--color-${name}: ${value};`);
      });
    }
  }
});

describe('contrast guarantees from Design System §14.2', () => {
  it.each([
    ['light', 'text', 'surface', 4.5],
    ['light', 'text-muted', 'surface', 4.5],
    ['light', 'on-action', 'action', 4.5],
    ['light', 'on-primary', 'primary', 4.5],
    ['light', 'on-conditional-subtle', 'conditional-subtle', 4.5],
    ['light', 'conditional', 'surface', 3],
    ['light', 'border-strong', 'surface', 3],
    ['dark', 'text', 'surface', 4.5],
    ['dark', 'text-muted', 'surface', 4.5],
    ['dark', 'on-action', 'action', 4.5],
    ['dark', 'conditional', 'surface', 3],
    ['dark', 'border-strong', 'surface', 3],
  ] as const)('%s %s on %s ≥ %s:1', (theme, fg, bg, min) => {
    expect(contrast(semantic[theme][fg], semantic[theme][bg])).toBeGreaterThanOrEqual(min);
  });
});
