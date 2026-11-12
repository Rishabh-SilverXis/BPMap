import { describe, expect, it } from 'vitest';
import { PDF_MAX_PT, PNG_MAX_AREA, PNG_MAX_SIDE, pdfPointsPerPx, pngScale } from './limits.ts';

describe('format size limits (TEST-2026-11-11)', () => {
  it('a normal diagram gets the full 2× PNG and 0.75 pt/px PDF', () => {
    expect(pngScale({ width: 5500, height: 2600 })).toBe(2);
    expect(pdfPointsPerPx({ width: 5500, height: 2600 })).toBe(0.75);
  });

  it('a 200-step diagram (35,908 × 3,459 px, which hung the PNG export) is scaled to fit the canvas', () => {
    const s = pngScale({ width: 35908, height: 3459 });
    expect(s).toBeLessThan(1);
    expect(35908 * s).toBeLessThanOrEqual(PNG_MAX_SIDE);
    expect(35908 * s * 3459 * s).toBeLessThanOrEqual(PNG_MAX_AREA);
  });

  it('PDF pages never exceed the 200-inch reader limit', () => {
    const k = pdfPointsPerPx({ width: 35908, height: 3459 });
    expect(35908 * k).toBeCloseTo(PDF_MAX_PT, 6);
    expect(3459 * k).toBeLessThan(PDF_MAX_PT);
  });
});
