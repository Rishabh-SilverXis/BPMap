/**
 * Scene → draw.io (diagrams.net) XML, EXP-04. Every shape is an editable cell: rectangles,
 * diamonds and circles become vertices, lines become edges with waypoints, text becomes text
 * cells. Open in draw.io, then File → Export as → VSDX for Visio (DEC-045).
 * All values are XML-escaped; `html=0` so imported text is never interpreted as HTML.
 */
import type { Scene } from '@bpmap/scene';
import { estimateTextWidth, flatten } from './flatten.ts';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '&#10;');
const n = (v: number) => String(Math.round(v * 10) / 10);
const dash = (d?: number[]) => (d?.length ? `dashed=1;dashPattern=${d.join(' ')};` : '');

export function toDrawio(scenes: { name: string; scene: Scene }[]): string {
  const pages = scenes.map(({ name, scene }, pi) => {
    let id = 2;
    const cells: string[] = [];
    // page background so exported images keep the scene's white surface
    cells.push(`<mxCell id="${pi}-bg" value="" style="rounded=0;fillColor=${scene.background};strokeColor=none;" vertex="1" parent="1"><mxGeometry x="0" y="0" width="${n(scene.width)}" height="${n(scene.height)}" as="geometry"/></mxCell>`);
    for (const p of flatten(scene)) {
      const cid = `${pi}-${id++}`;
      if (p.t === 'rect') {
        const style = `rounded=${p.r ? 1 : 0};absoluteArcSize=1;arcSize=${n((p.r ?? 0) * 2)};fillColor=${p.fill};strokeColor=${p.stroke ?? 'none'};strokeWidth=${n(p.strokeWidth ?? 1)};${dash(p.dash)}`;
        cells.push(`<mxCell id="${cid}" value="" style="${style}" vertex="1" parent="1"><mxGeometry x="${n(p.x)}" y="${n(p.y)}" width="${n(p.w)}" height="${n(p.h)}" as="geometry"/></mxCell>`);
      } else if (p.t === 'circle') {
        cells.push(`<mxCell id="${cid}" value="" style="ellipse;fillColor=${p.fill};strokeColor=${p.stroke ?? 'none'};strokeWidth=${n(p.strokeWidth ?? 1)};" vertex="1" parent="1"><mxGeometry x="${n(p.cx - p.r)}" y="${n(p.cy - p.r)}" width="${n(2 * p.r)}" height="${n(2 * p.r)}" as="geometry"/></mxCell>`);
      } else if (p.t === 'poly') {
        const xs = p.points.map((q) => q[0]);
        const ys = p.points.map((q) => q[1]);
        const [x0, y0] = [Math.min(...xs), Math.min(...ys)];
        cells.push(`<mxCell id="${cid}" value="" style="rhombus;fillColor=${p.fill};strokeColor=${p.stroke ?? 'none'};strokeWidth=${n(p.strokeWidth ?? 1)};" vertex="1" parent="1"><mxGeometry x="${n(x0)}" y="${n(y0)}" width="${n(Math.max(...xs) - x0)}" height="${n(Math.max(...ys) - y0)}" as="geometry"/></mxCell>`);
      } else if (p.t === 'text') {
        const w = estimateTextWidth(p.text, p.size, p.weight) + 6;
        const h = p.size * 1.35;
        const x = p.anchor === 'middle' ? p.x - w / 2 : p.anchor === 'end' ? p.x - w : p.x;
        const align = p.anchor === 'middle' ? 'center' : p.anchor === 'end' ? 'right' : 'left';
        const style = `text;html=0;align=${align};verticalAlign=bottom;spacing=0;fontSize=${n(p.size)};fontStyle=${p.weight >= 600 ? 1 : 0};fontColor=${p.fill};${p.mono ? 'fontFamily=Courier New;' : 'fontFamily=Helvetica;'}`;
        cells.push(`<mxCell id="${cid}" value="${esc(p.text)}" style="${style}" vertex="1" parent="1"><mxGeometry x="${n(x)}" y="${n(p.y - h + p.size * 0.25)}" width="${n(w)}" height="${n(h)}" as="geometry"/></mxCell>`);
      } else {
        const [first, ...rest] = p.points;
        const last = rest.pop() ?? first!;
        const style = `edgeStyle=none;html=0;rounded=0;endArrow=${p.arrow ? 'block;endFill=1' : 'none'};startArrow=none;strokeColor=${p.stroke};strokeWidth=${n(p.width)};${dash(p.dash)}`;
        const pts = rest.length ? `<Array as="points">${rest.map(([x, y]) => `<mxPoint x="${n(x)}" y="${n(y)}"/>`).join('')}</Array>` : '';
        cells.push(`<mxCell id="${cid}" value="" style="${style}" edge="1" parent="1"><mxGeometry relative="1" as="geometry"><mxPoint x="${n(first![0])}" y="${n(first![1])}" as="sourcePoint"/><mxPoint x="${n(last[0])}" y="${n(last[1])}" as="targetPoint"/>${pts}</mxGeometry></mxCell>`);
      }
    }
    return `<diagram id="page-${pi}" name="${esc(name)}"><mxGraphModel dx="0" dy="0" grid="0" gridSize="10" guides="1" tooltips="1" connect="0" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${n(scene.width)}" pageHeight="${n(scene.height)}" math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells.join('')}</root></mxGraphModel></diagram>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<mxfile host="BPMap" agent="BPMap" version="24.0.0" type="device">${pages.join('')}</mxfile>\n`;
}
