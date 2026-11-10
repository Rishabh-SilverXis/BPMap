/** Flatten a scene into drawing primitives in paint order (groups only carry semantics). */
import type { Scene, SceneItem } from '@bpmap/scene';

export type Primitive = Exclude<SceneItem, { t: 'group' }>;

export function flatten(scene: Scene): Primitive[] {
  const out: Primitive[] = [];
  const walk = (items: SceneItem[]) => {
    for (const it of items) (it.t === 'group' ? walk(it.children) : out.push(it));
  };
  walk(scene.items);
  return out;
}

/** Same width estimate the scene uses for wrapping (DOM-free). */
export const estimateTextWidth = (s: string, size: number, weight: number) => s.length * size * (weight >= 600 ? 0.58 : 0.54);
