/**
 * Canvas (Architecture §15). Background = export scene minus step groups (ViewportPortal);
 * foreground = one interactive React Flow node per step at the same coordinates (DEC-014).
 * Nodes are derived, never stored: selection lives in the app store.
 */
import { useCallback, useMemo } from 'react';
import { ControlButton, Controls, MiniMap, ReactFlow, ViewportPortal, useReactFlow, type NodeChange } from '@xyflow/react';
import { Maximize } from 'lucide-react';
import { EXPORT_DIAGRAM_OFFSET, clampMeta, stepMetaLines, stepTitle } from '@bpmap/scene';
import { KIND_LABEL } from '@bpmap/model';
import { nodeTokens, semantic, type Theme } from '@bpmap/design-tokens';
import type { Diagram } from '../../app/derive.ts';
import { useStore } from '../../store/store.ts';
import { SceneSvg } from './SceneSvg.tsx';
import { StepNode, type StepFlowNode } from './StepNode.tsx';

const nodeTypes = { step: StepNode };

export function DiagramCanvas({ diagram, theme }: { diagram: Diagram; theme: Theme }) {
  const selected = useStore((s) => s.selectedStepId);
  const select = useStore((s) => s.select);
  const tokens = useMemo(() => nodeTokens(theme), [theme]);
  const surface = semantic[theme].surface;
  const { fitBounds } = useReactFlow();
  // Fit the whole export scene (title, lanes, legend, conditions), not just the step nodes.
  const fitScene = useCallback(
    (duration = 0) => void fitBounds({ x: 0, y: 0, width: diagram.scene.width, height: diagram.scene.height }, { padding: 0.03, duration }),
    [fitBounds, diagram.scene.width, diagram.scene.height],
  );

  // Executive view is stage cards drawn entirely by the scene; no interactive step nodes (DEC-035).
  const nodes = useMemo<StepFlowNode[]>(
    () =>
      diagram.view === 'executive' ? [] : diagram.layout.nodes.map((n) => {
        const gs = diagram.graph.steps[n.id]!;
        const step = gs.step;
        const conds = gs.openConditionIds.length ? `, runs only if ${gs.openConditionIds.join(' and ')}` : '';
        return {
          id: n.id,
          type: 'step',
          position: { x: n.x + EXPORT_DIAGRAM_OFFSET.x, y: n.y + EXPORT_DIAGRAM_OFFSET.y },
          width: n.width,
          height: n.height,
          selected: n.id === selected,
          draggable: false,
          connectable: false,
          ariaLabel: `${KIND_LABEL[step.kind]}, step ${step.order}, ${step.groups[0] ?? 'system'}: ${stepTitle(step, diagram.overlay.labels[n.id])}${conds}`,
          data: {
            step,
            openConditionIds: gs.openConditionIds,
            label: diagram.overlay.labels[n.id],
            note: diagram.overlay.notes[n.id],
            ...(diagram.view === 'configurator' ? { meta: clampMeta(stepMetaLines(step, diagram.def)) } : {}),
            tokens,
            surface,
          },
        };
      }),
    [diagram, selected, tokens, surface],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange<StepFlowNode>[]) => {
      for (const c of changes) {
        if (c.type !== 'select') continue;
        if (c.selected) select(c.id);
        else if (useStore.getState().selectedStepId === c.id) select(null);
      }
    },
    [select],
  );

  return (
    <ReactFlow
      key={`${diagram.def.id}|${diagram.view}`}
      nodes={nodes}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onPaneClick={() => select(null)}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      onInit={() => fitScene()}
      minZoom={0.1}
      maxZoom={2.5}
      colorMode={theme}
      proOptions={{ hideAttribution: true }}
      aria-label={`Diagram of ${diagram.def.process}`}
    >
      <ViewportPortal>
        <SceneSvg scene={diagram.scene} skip={['step']} />
      </ViewportPortal>
      <Controls showInteractive={false} showFitView={false} position="bottom-left">
        <ControlButton onClick={() => fitScene(320)} aria-label="Fit the whole diagram" title="Fit the whole diagram">
          <Maximize />
        </ControlButton>
      </Controls>
      <MiniMap pannable zoomable position="bottom-right" nodeColor={(n) => ((n as StepFlowNode).data.openConditionIds.length ? tokens.conditionalBorder : tokens.approval.bg)} />
    </ReactFlow>
  );
}
