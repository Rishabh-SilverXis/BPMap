/**
 * Vector PDF export (EXP-02), loaded on demand: jspdf + svg2pdf.js render the SAME scene SVG as the
 * SVG export, one page per scene, sized to the diagram (text stays selectable, zoom stays sharp).
 *
 * The built-in PDF fonts only cover Latin-1 (WinAnsi). Common symbols are mapped and anything else
 * becomes "?" rather than garbled glyphs (DEC-046; embedding a Unicode font is a follow-up).
 */
import { toSvg, type Scene, type SceneItem } from '@bpmap/scene';

const MAP: Record<string, string> = { '✓': '', '✔': '', '≥': '>=', '≤': '<=', '≠': '!=', '–': '-', '—': '-', '‘': "'", '’': "'", '“': '"', '”': '"', '→': '->', '•': '·' };
export const toWinAnsi = (s: string) =>
  [...s]
    .map((ch) => (ch in MAP ? MAP[ch]! : ch.charCodeAt(0) <= 0xff || ch === '…' ? ch : '?'))
    .join('')
    .trimStart();

function sanitize(items: SceneItem[]): SceneItem[] {
  return items.map((it): SceneItem => (it.t === 'text' ? { ...it, text: toWinAnsi(it.text) } : it.t === 'group' ? { ...it, children: sanitize(it.children) } : it));
}

export async function pdfBlob(pages: { title: string; scene: Scene }[]): Promise<Blob> {
  const [{ jsPDF }, { svg2pdf }] = await Promise.all([import('jspdf'), import('svg2pdf.js')]);
  const PT = 0.75; // CSS px → PDF points
  const first = pages[0]!.scene;
  const doc = new jsPDF({ unit: 'pt', format: [first.width * PT, first.height * PT], orientation: first.width >= first.height ? 'landscape' : 'portrait', compress: true });
  doc.setProperties({ title: pages.map((p) => p.title).join(' · '), creator: 'BPMap (independent; not affiliated with Workday, Inc.)' });
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:hidden';
  document.body.appendChild(host);
  try {
    for (const [i, page] of pages.entries()) {
      const scene = { ...page.scene, items: sanitize(page.scene.items) };
      if (i > 0) doc.addPage([scene.width * PT, scene.height * PT], scene.width >= scene.height ? 'landscape' : 'portrait');
      host.innerHTML = '';
      const svg = new DOMParser().parseFromString(toSvg(scene, page.title), 'image/svg+xml').documentElement as unknown as SVGSVGElement;
      host.appendChild(svg);
      await svg2pdf(svg, doc, { x: 0, y: 0, width: scene.width * PT, height: scene.height * PT });
    }
    return doc.output('blob');
  } finally {
    host.remove();
  }
}
