/**
 * Renders scene items as React SVG (the same display list the SVG/PNG exporters serialise).
 * Used as the canvas background inside React Flow's ViewportPortal (DEC-014).
 */
import { memo } from 'react';
import type { Scene, SceneItem, SceneRole } from '@bpmap/scene';

export function Item({ it }: { it: SceneItem }) {
  switch (it.t) {
    case 'rect':
      return <rect x={it.x} y={it.y} width={it.w} height={it.h} rx={it.r} fill={it.fill} stroke={it.stroke} strokeWidth={it.strokeWidth} strokeDasharray={it.dash?.join(' ')} />;
    case 'poly':
      return <polygon points={it.points.map(([x, y]) => `${x},${y}`).join(' ')} fill={it.fill} stroke={it.stroke} strokeWidth={it.strokeWidth} />;
    case 'circle':
      return <circle cx={it.cx} cy={it.cy} r={it.r} fill={it.fill} stroke={it.stroke} strokeWidth={it.strokeWidth} />;
    case 'path':
      return (
        <path
          d={`M${it.points.map(([x, y]) => `${x},${y}`).join(' L')}`}
          fill="none"
          stroke={it.stroke}
          strokeWidth={it.width}
          strokeLinejoin="round"
          strokeDasharray={it.dash?.join(' ')}
          markerEnd={it.arrow ? 'url(#bpm-canvas-arrow)' : undefined}
        />
      );
    case 'text':
      return (
        <text
          x={it.x}
          y={it.y}
          fontSize={it.size}
          fontWeight={it.weight}
          fill={it.fill}
          textAnchor={it.anchor ?? 'start'}
          letterSpacing={it.letterSpacing}
          fontFamily={it.mono ? 'SFMono-Regular, Menlo, Consolas, monospace' : undefined}
        >
          {it.text}
        </text>
      );
    case 'group':
      return (
        <g data-role={it.role}>
          {it.children.map((c, i) => (
            <Item key={i} it={c} />
          ))}
        </g>
      );
  }
}

export const SceneSvg = memo(function SceneSvg({ scene, skip = [] }: { scene: Scene; skip?: SceneRole[] }) {
  const arrow = scene.items.find((i) => i.t === 'group' && i.role === 'edges');
  const arrowColor = arrow && arrow.t === 'group' && arrow.children[0]?.t === 'path' ? arrow.children[0].stroke : '#64748B';
  return (
    <svg
      width={scene.width}
      height={scene.height}
      style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }}
      fontFamily="'Inter Variable', Inter, -apple-system, 'Segoe UI', Roboto, sans-serif"
      aria-hidden="true"
    >
      <defs>
        <marker id="bpm-canvas-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill={arrowColor} />
        </marker>
      </defs>
      <rect width={scene.width} height={scene.height} rx={12} fill={scene.background} />
      {scene.items
        .filter((i) => !(i.t === 'group' && skip.includes(i.role)))
        .map((it, i) => (
          <Item key={i} it={it} />
        ))}
    </svg>
  );
});
