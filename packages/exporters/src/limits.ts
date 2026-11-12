/**
 * Size limits of the formats and of browsers (TEST-2026-11-11). Pure; imported by the web app via
 * the "@bpmap/exporters/limits" subpath so it doesn't pull pptxgenjs into the startup bundle.
 *
 *   PNG: browser canvases fail silently past ≈16,384 px per side or a few hundred megapixels
 *        (Safari is lower), and toBlob may then never call back: the export hung on a 200-step process.
 *   PDF: readers cap a page at 14,400 pt (200 in); Acrobat refuses larger pages.
 */
export const PNG_MAX_SIDE = 16_384;
export const PNG_MAX_AREA = 128e6;
/** Below this the PNG would be too blurry to be worth it: say "use SVG or PDF" instead. */
export const PNG_MIN_SCALE = 0.5;
export const PDF_MAX_PT = 14_400;
const CSS_PX_TO_PT = 0.75;

/** Largest scale ≤ wanted at which the scene fits a browser canvas. */
export function pngScale(scene: { width: number; height: number }, wanted = 2): number {
  const bySide = PNG_MAX_SIDE / Math.max(scene.width, scene.height);
  const byArea = Math.sqrt(PNG_MAX_AREA / (scene.width * scene.height));
  return Math.min(wanted, bySide, byArea);
}

/** CSS px → PDF pt factor for a page: 0.75, or smaller so the longest side stays within PDF_MAX_PT. */
export function pdfPointsPerPx(scene: { width: number; height: number }): number {
  return Math.min(CSS_PX_TO_PT, PDF_MAX_PT / Math.max(scene.width, scene.height));
}
