/**
 * Interactive step box (Design System §10.2). Visual rules mirror the scene's step group so the
 * canvas and the exports look the same: kind tag, ≤ 2-line title, condition badges on the top
 * edge, note badge bottom-left, completion check bottom-right, dashed amber outline if conditional.
 */
import { memo } from 'react';
import type { Node, NodeProps } from '@xyflow/react';
import type { Step } from '@bpmap/model';
import { nodeStyleOf, stepKindTag, stepTitle } from '@bpmap/scene';
import type { NodeTokens } from '@bpmap/design-tokens';

export type StepNodeData = { step: Step; openConditionIds: string[]; label?: string; note?: string; meta?: string[]; tokens: NodeTokens; surface: string };
export type StepFlowNode = Node<StepNodeData, 'step'>;

export const StepNode = memo(function StepNode({ data, width, height }: NodeProps<StepFlowNode>) {
  const { step, tokens: tk } = data;
  const t = tk[nodeStyleOf(step.kind)];
  const open = data.openConditionIds;
  const conditional = open.length > 0; // unresolved in the current scenario (DEC-034)
  const ids = open.length > 3 ? [...open.slice(0, 2), `+${open.length - 2}`] : open;
  return (
    <div
      className="bpm-step relative rounded-[6px] px-[10px] py-[9px] transition-shadow hover:shadow-[var(--shadow-e2)]"
      style={{
        width,
        height,
        background: t.bg,
        color: t.text,
        border: conditional ? `1.75px dashed ${tk.conditionalBorder}` : `1.5px solid ${t.border}`,
      }}
    >
      <div className="truncate text-[10px] font-bold uppercase leading-3 tracking-[0.06em]" style={{ color: t.meta }}>
        {stepKindTag(step)}
      </div>
      <div className="mt-[7px] line-clamp-2 text-[13px] font-semibold leading-[17px]" title={stepTitle(step, data.label)}>
        {stepTitle(step, data.label)}
      </div>
      {data.meta && data.meta.length > 0 && (
        <ul className="mt-[6px] flex flex-col text-[11px] leading-[14px]" style={{ color: t.meta }}>
          {data.meta.map((m) => (
            <li key={m} className="truncate" title={m}>
              {m}
            </li>
          ))}
        </ul>
      )}
      {ids.length > 0 && (
        <div className="absolute -top-2 right-[6px] flex gap-1" aria-hidden="true">
          {ids.map((id) => (
            <span
              key={id}
              className="rounded-full px-[5px] font-mono text-[10px] font-bold leading-[14px]"
              style={{ background: tk.conditionBadge.bg, color: tk.conditionBadge.text, border: `1px solid ${tk.conditionalBorder}` }}
            >
              {id}
            </span>
          ))}
        </div>
      )}
      {data.note && (
        <span
          className="absolute -bottom-2 -left-[6px] grid h-4 w-4 place-items-center rounded-full text-[10px] font-bold"
          style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)', boxShadow: `0 0 0 1.5px ${data.surface}` }}
          title={data.note}
        >
          N
        </span>
      )}
      {step.complete && (
        <span
          className="absolute -bottom-2 -right-2 grid h-4 w-4 place-items-center rounded-full text-[10px] font-bold text-white"
          style={{ background: tk.completion, boxShadow: `0 0 0 1.5px ${data.surface}` }}
          title="Process is complete after this step"
        >
          ✓
        </span>
      )}
    </div>
  );
});
