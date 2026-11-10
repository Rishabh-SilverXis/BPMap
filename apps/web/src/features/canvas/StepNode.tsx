/**
 * Interactive step box (Design System §10.2). Visual rules mirror the scene's step group so the
 * viewer and the exports look the same: kind tag, ≤ 2-line title, condition badges on the top
 * edge, note badge bottom-left, completion check bottom-right, dashed amber outline if conditional.
 * Rendered as a focusable button by DiagramViewer (no canvas library, DEC-042).
 */
import { memo, type CSSProperties } from 'react';
import clsx from 'clsx';
import type { Step } from '@bpmap/model';
import { nodeStyleOf, stepKindTag, stepTitle } from '@bpmap/scene';
import type { NodeTokens } from '@bpmap/design-tokens';

export type StepNodeData = { step: Step; openConditionIds: string[]; label?: string; note?: string; meta?: string[]; tokens: NodeTokens; surface: string };

interface Props {
  id: string;
  data: StepNodeData;
  style: CSSProperties; // absolute position + size in diagram coordinates
  selected: boolean;
  ariaLabel: string;
  onSelect: (id: string) => void;
}

export const StepNode = memo(function StepNode({ id, data, style, selected, ariaLabel, onSelect }: Props) {
  const { step, tokens: tk } = data;
  const t = tk[nodeStyleOf(step.kind)];
  const open = data.openConditionIds;
  const conditional = open.length > 0; // unresolved in the current scenario (DEC-034)
  const ids = open.length > 3 ? [...open.slice(0, 2), `+${open.length - 2}`] : open;
  return (
    <button
      type="button"
      data-testid="step"
      data-step-id={id}
      aria-label={ariaLabel}
      aria-pressed={selected}
      onClick={() => onSelect(id)}
      className={clsx('bpm-step absolute rounded-[6px] px-[10px] py-[9px] text-left transition-shadow hover:shadow-[var(--shadow-e2)] focus-visible:outline-none', selected && 'is-selected')}
      style={{
        ...style,
        background: t.bg,
        color: t.text,
        border: conditional ? `1.75px dashed ${tk.conditionalBorder}` : `1.5px solid ${t.border}`,
      }}
    >
      <span className="block truncate text-[10px] font-bold uppercase leading-3 tracking-[0.06em]" style={{ color: t.meta }}>
        {stepKindTag(step)}
      </span>
      <span className="mt-[7px] line-clamp-2 block text-[13px] font-semibold leading-[17px]" title={stepTitle(step, data.label)}>
        {stepTitle(step, data.label)}
      </span>
      {data.meta && data.meta.length > 0 && (
        <span className="mt-[6px] flex flex-col text-[11px] leading-[14px]" style={{ color: t.meta }}>
          {data.meta.map((m) => (
            <span key={m} className="truncate" title={m}>
              {m}
            </span>
          ))}
        </span>
      )}
      {ids.length > 0 && (
        <span className="absolute -top-2 right-[6px] flex gap-1" aria-hidden="true">
          {ids.map((c) => (
            <span key={c} className="rounded-full px-[5px] font-mono text-[10px] font-bold leading-[14px]" style={{ background: tk.conditionBadge.bg, color: tk.conditionBadge.text, border: `1px solid ${tk.conditionalBorder}` }}>
              {c}
            </span>
          ))}
        </span>
      )}
      {data.note && (
        <span className="absolute -bottom-2 -left-[6px] grid h-4 w-4 place-items-center rounded-full text-[10px] font-bold" style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)', boxShadow: `0 0 0 1.5px ${data.surface}` }} title={data.note}>
          N
        </span>
      )}
      {step.complete && (
        <span className="absolute -bottom-2 -right-2 grid h-4 w-4 place-items-center rounded-full text-[10px] font-bold text-white" style={{ background: tk.completion, boxShadow: `0 0 0 1.5px ${data.surface}` }} title="Process is complete after this step">
          ✓
        </span>
      )}
    </button>
  );
});
