import React, { useMemo, useRef, useCallback, useState } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  MarkerType,
  Panel,
  useReactFlow,
  ReactFlowProvider,
  ReactFlowInstance,
  OnSelectionChangeParams,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { FlowchartData } from '../types';
import { StartNode, EndNode, ApprovalNode, ActionNode, DecisionNode, InfoNode, SwimlaneNode } from './CustomNodes';
import { toPng } from 'html-to-image';
import { Trash2, Undo2 } from 'lucide-react';

const nodeTypes = {
  start: StartNode,
  end: EndNode,
  approval: ApprovalNode,
  action: ActionNode,
  decision: DecisionNode,
  info: InfoNode,
  swimlane: SwimlaneNode,
};

interface FlowchartEditorProps {
  data: FlowchartData;
  onEditData: () => void;
}

function FlowchartEditorContent({ data, onEditData }: FlowchartEditorProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { getNodes } = useReactFlow();

  // Convert FlowchartData to React Flow nodes and edges
  const { initialNodes, initialEdges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    const X_START = 200;
    const Y_START = 100;
    const X_SPACING = 300;
    const SWIMLANE_HEIGHT = 200;

    // Calculate dynamic width based on the number of steps and decisions
    let totalStepsWidth = X_START;
    data.steps?.forEach(step => {
      if (step.condition) totalStepsWidth += X_SPACING;
      totalStepsWidth += X_SPACING;
    });
    const SWIMLANE_WIDTH = Math.max(1500, totalStepsWidth + 200);

    // 1. Create Swimlane Backgrounds
    data.swimlanes?.forEach((lane, index) => {
      nodes.push({
        id: `swimlane-${index}`,
        type: 'swimlane',
        position: { x: 0, y: index * SWIMLANE_HEIGHT },
        data: { label: lane },
        style: {
          width: SWIMLANE_WIDTH,
          height: SWIMLANE_HEIGHT,
          zIndex: -1,
        },
        draggable: false,
        selectable: false,
      });
    });

    // 2. Map steps to nodes
    let currentX = X_START;

    data.steps.forEach((step, index) => {
      const stepId = `node-${index}`;
      const prevStepId = index > 0 ? `node-${index - 1}` : null;

      const laneIndex = data.swimlanes.indexOf(step.group);
      const yPos = laneIndex !== -1 ? laneIndex * SWIMLANE_HEIGHT + (SWIMLANE_HEIGHT / 2) - 30 : Y_START;

      let nodeType = 'action';
      if (step.type.toLowerCase().includes('initiation') || step.step.toLowerCase().includes('initiation')) {
        nodeType = 'start';
      } else if (step.type.toLowerCase().includes('approval')) {
        nodeType = 'approval';
      } else if (step.type.toLowerCase().includes('end')) {
        nodeType = 'end';
      }

      // If there is a condition, we need a decision node BEFORE this step
      if (step.condition) {
        const decisionId = `decision-${index}`;
        const decisionNode: Node = {
          id: decisionId,
          type: 'decision',
          position: { x: currentX, y: yPos },
          data: { label: 'if', condition: step.condition },
          zIndex: 10,
        };
        nodes.push(decisionNode);
        currentX += X_SPACING;

        // Connect previous node to decision
        if (prevStepId) {
          edges.push({
            id: `e-${prevStepId}-${decisionId}`,
            source: prevStepId,
            target: decisionId,
            type: 'smoothstep',
            style: { stroke: '#b1b1b7', strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#b1b1b7' },
          });
        }

        // Connect decision to current step (Yes)
        edges.push({
          id: `e-${decisionId}-${stepId}`,
          source: decisionId,
          target: stepId,
          sourceHandle: 'right',
          label: 'Yes',
          type: 'smoothstep',
          style: { stroke: '#b1b1b7', strokeWidth: 2 },
          labelStyle: { fill: '#333', fontWeight: 600, fontSize: 12 },
          labelBgStyle: { fill: '#ffffff', fillOpacity: 1 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#b1b1b7' },
        });

        // Find the initiation step to revert to on "No"
        const initiationStepIndex = data.steps.findIndex(s => 
          s.type.toLowerCase().includes('initiation') || 
          s.step.toLowerCase().includes('initiation')
        );
        const targetNoId = initiationStepIndex !== -1 ? `node-${initiationStepIndex}` : 'node-0';

        // Connect decision to initiation step (No)
        edges.push({
          id: `e-${decisionId}-${targetNoId}-no`,
          source: decisionId,
          target: targetNoId,
          sourceHandle: 'bottom',
          targetHandle: 'bottom',
          label: 'No',
          type: 'smoothstep',
          style: { stroke: '#b1b1b7', strokeWidth: 2 },
          labelStyle: { fill: '#333', fontWeight: 600, fontSize: 12 },
          labelBgStyle: { fill: '#ffffff', fillOpacity: 1 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#b1b1b7' },
        });
      }

      const node: Node = {
        id: stepId,
        type: nodeType,
        position: { x: currentX, y: yPos },
        data: {
          label: step.type === 'Action' ? step.specify || step.step : step.type,
          dueDate: step.dueDate,
        },
        zIndex: 10,
      };
      nodes.push(node);

      // Connect to previous if no decision was added and it's not the first
      if (prevStepId && !step.condition) {
        edges.push({
          id: `e-${prevStepId}-${stepId}`,
          source: prevStepId,
          target: stepId,
          type: 'smoothstep',
          style: { stroke: '#b1b1b7', strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#b1b1b7' },
        });
      }

      // Add info node if additional info exists
      if (step.additionalInfo) {
        const infoId = `info-${index}`;
        const infoNode: Node = {
          id: infoId,
          type: 'info',
          position: { x: currentX, y: yPos - 80 },
          data: { label: step.additionalInfo },
          zIndex: 10,
        };
        nodes.push(infoNode);
        // Connect info to step (dashed)
        edges.push({
          id: `e-${infoId}-${stepId}`,
          source: infoId,
          target: stepId,
          type: 'straight',
          style: { stroke: '#b1b1b7', strokeWidth: 2, strokeDasharray: '5,5' },
        });
      }

      currentX += X_SPACING;
    });

    return { initialNodes: nodes, initialEdges: edges };
  }, [data]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [history, setHistory] = useState<{ nodes: Node[]; edges: Edge[] } | null>(null);

  const saveHistory = useCallback(() => {
    setHistory({ nodes: [...nodes], edges: [...edges] });
  }, [nodes, edges]);

  const handleUndo = useCallback(() => {
    if (history) {
      setNodes(history.nodes);
      setEdges(history.edges);
      setHistory(null);
    }
  }, [history, setNodes, setEdges]);

  // Update nodes and edges when data changes
  React.useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => {
      saveHistory();
      const sourceNode = nodes.find(n => n.id === params.source);
      const isDecision = sourceNode?.type === 'decision';
      setEdges((eds) => addEdge({ 
        ...params, 
        type: 'smoothstep', 
        label: isDecision ? 'Yes/No' : '', 
        style: { stroke: '#b1b1b7', strokeWidth: 2 },
        labelStyle: { fill: '#333', fontWeight: 600, fontSize: 12 },
        labelBgStyle: { fill: '#ffffff', fillOpacity: 1 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#b1b1b7' } 
      }, eds));
    },
    [setEdges, nodes, saveHistory],
  );

  const onSelectionChange = useCallback(({ nodes, edges }: OnSelectionChangeParams) => {
    setSelectedNode(nodes.length > 0 ? nodes[0] : null);
    setSelectedEdge(edges.length > 0 ? edges[0] : null);
  }, []);

  const onDragStart = (event: React.DragEvent, nodeType: string, label: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.setData('application/reactflow-label', label);
    event.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      if (!reactFlowInstance) return;

      const type = event.dataTransfer.getData('application/reactflow');
      const label = event.dataTransfer.getData('application/reactflow-label');

      if (typeof type === 'undefined' || !type) {
        return;
      }

      saveHistory();

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode = {
        id: `dndnode_${Date.now()}`,
        type,
        position,
        data: { label: label },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [reactFlowInstance, setNodes, saveHistory],
  );

  const updateNodeLabel = (label: string) => {
    saveHistory();
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === selectedNode?.id) {
          node.data = { ...node.data, label };
        }
        return node;
      })
    );
    setSelectedNode((prev) => prev ? { ...prev, data: { ...prev.data, label } } : null);
  };

  const updateEdgeLabel = (label: string) => {
    saveHistory();
    setEdges((eds) =>
      eds.map((edge) => {
        if (edge.id === selectedEdge?.id) {
          edge.label = label;
        }
        return edge;
      })
    );
    setSelectedEdge((prev) => prev ? { ...prev, label } : null);
  };

  const handleDeleteSelected = () => {
    if (selectedNode || selectedEdge) {
      saveHistory();
    }
    if (selectedNode) {
      setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
      setSelectedNode(null);
    } else if (selectedEdge) {
      setEdges((eds) => eds.filter((e) => e.id !== selectedEdge.id));
      setSelectedEdge(null);
    }
  };

  const handleExport = useCallback(() => {
    if (reactFlowWrapper.current === null) {
      return;
    }

    toPng(reactFlowWrapper.current, { 
      filter: (node) => {
        // Exclude controls, minimap, panels, and toolbar from export
        if (node?.classList?.contains('react-flow__controls') || 
            node?.classList?.contains('react-flow__minimap') ||
            node?.classList?.contains('react-flow__panel') ||
            node?.classList?.contains('export-exclude') ||
            node?.classList?.contains('react-flow__background')) {
          return false;
        }
        return true;
      },
      backgroundColor: '#ffffff',
      pixelRatio: 2
    })
      .then((dataUrl) => {
        const link = document.createElement('a');
        link.download = `${data.title || 'flowchart'}.png`;
        link.href = dataUrl;
        link.click();
      })
      .catch((err) => {
        console.error('Failed to export image', err);
      });
  }, [data.title]);

  if (!data.steps || data.steps.length === 0) {
    return (
      <div style={{ width: '100%', height: '100%' }} className="bg-white flex flex-col items-center justify-center p-6 text-center relative">
        <div className="absolute top-4 left-4 z-10 pointer-events-none">
          <h2 className="text-2xl font-bold text-primary bg-white/80 px-2 py-1 rounded">{data.title || 'Process Overview'}</h2>
        </div>
        <div className="max-w-md p-6 bg-amber-50 border border-amber-200 rounded-lg text-amber-800">
          <h3 className="text-lg font-semibold mb-2">No Steps Extracted</h3>
          <p className="text-sm mb-4">The AI could not detect any process steps in the uploaded image. This might happen if the image is too blurry, or if the table format is not recognized.</p>
          <button onClick={onEditData} className="px-4 py-2 bg-primary text-white rounded-md shadow-sm text-sm font-medium hover:bg-primary/90 transition-colors">
            Manually Add Data
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%' }} className="bg-white relative" ref={reactFlowWrapper}>
      <div className="absolute top-4 left-4 z-10 pointer-events-none">
        <h2 className="text-2xl font-bold text-primary bg-white/80 px-2 py-1 rounded">{data.title || 'Process Overview'}</h2>
      </div>

      {/* Toolbar */}
      {isEditMode && (
        <div className="export-exclude absolute top-20 left-4 z-10 flex flex-col gap-3 bg-white/90 backdrop-blur p-3 rounded-lg shadow-lg border border-gray-200 w-32">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Add Nodes</div>
          
          <div className="p-2 border-2 border-blue-400 bg-blue-50 rounded cursor-grab text-sm text-center font-medium hover:bg-blue-100 transition-colors" onDragStart={(e) => onDragStart(e, 'action', 'Action')} draggable>
            Rectangle
          </div>
          
          <div className="p-2 border-2 border-purple-400 bg-purple-50 cursor-grab text-sm text-center font-medium hover:bg-purple-100 transition-colors" style={{ clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' }} onDragStart={(e) => onDragStart(e, 'decision', 'Decision')} draggable>
            <span className="block py-2">Diamond</span>
          </div>

          <div className="p-2 border-2 border-green-400 bg-green-50 rounded-full cursor-grab text-sm text-center font-medium hover:bg-green-100 transition-colors" onDragStart={(e) => onDragStart(e, 'start', 'Start')} draggable>
            Pill (Start)
          </div>

          <div className="p-2 border-2 border-red-400 bg-red-50 rounded-full cursor-grab text-sm text-center font-medium hover:bg-red-100 transition-colors" onDragStart={(e) => onDragStart(e, 'end', 'End')} draggable>
            Pill (End)
          </div>

          <div className="p-2 border-2 border-gray-400 bg-gray-50 rounded cursor-grab text-sm text-center font-medium hover:bg-gray-100 transition-colors border-dashed" onDragStart={(e) => onDragStart(e, 'info', 'Text')} draggable>
            Text Box
          </div>
        </div>
      )}

      {/* Properties Panel */}
      {isEditMode && (selectedNode || selectedEdge) && (
        <div className="export-exclude absolute top-20 right-4 z-10 bg-white/90 backdrop-blur p-4 rounded-lg shadow-lg border border-gray-200 w-64">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">
              Edit {selectedNode ? 'Node' : 'Edge'}
            </h3>
            <button 
              onClick={handleDeleteSelected}
              className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1 rounded transition-colors"
              title={`Delete ${selectedNode ? 'Node' : 'Edge'}`}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-gray-500">Label Text</label>
            <textarea 
              className="w-full text-sm p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
              rows={3}
              value={selectedNode ? (selectedNode.data.label as string) : (selectedEdge?.label as string || '')}
              onChange={(e) => selectedNode ? updateNodeLabel(e.target.value) : updateEdgeLabel(e.target.value)}
              placeholder="Enter text..."
            />
            {selectedEdge && (
              <div className="flex gap-2 mt-2">
                <button onClick={() => updateEdgeLabel('Yes')} className="flex-1 bg-green-50 text-green-700 border border-green-200 py-1 rounded text-xs font-medium hover:bg-green-100">Yes</button>
                <button onClick={() => updateEdgeLabel('No')} className="flex-1 bg-red-50 text-red-700 border border-red-200 py-1 rounded text-xs font-medium hover:bg-red-100">No</button>
                <button onClick={() => updateEdgeLabel('')} className="flex-1 bg-gray-50 text-gray-700 border border-gray-200 py-1 rounded text-xs font-medium hover:bg-gray-100">Clear</button>
              </div>
            )}
          </div>
        </div>
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onInit={setReactFlowInstance}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeDragStart={saveHistory}
        onNodesDelete={saveHistory}
        onEdgesDelete={saveHistory}
        onSelectionChange={onSelectionChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.1 }}
        attributionPosition="bottom-right"
      >
        <Background color="#ccc" gap={16} />
        <Controls />
        <Panel position="top-right" className="space-x-2 flex items-center">
          {isEditMode && (
            <button 
              onClick={handleUndo} 
              disabled={!history}
              className={`px-3 py-2 border rounded-md shadow-sm text-sm font-medium transition-colors flex items-center gap-1 ${history ? 'bg-white border-border text-gray-700 hover:bg-gray-50' : 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed'}`}
              title="Undo last action"
            >
              <Undo2 className="w-4 h-4" />
              Undo
            </button>
          )}
          <button onClick={() => setIsEditMode(!isEditMode)} className={`px-4 py-2 border rounded-md shadow-sm text-sm font-medium transition-colors ${isEditMode ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100' : 'bg-white border-border text-gray-700 hover:bg-muted'}`}>
            {isEditMode ? 'Done Editing' : 'Edit Flowchart'}
          </button>
          <button onClick={onEditData} className="px-4 py-2 bg-white border border-border rounded-md shadow-sm text-sm font-medium hover:bg-muted transition-colors">
            View Data
          </button>
          <button onClick={handleExport} className="px-4 py-2 bg-primary text-white rounded-md shadow-sm text-sm font-medium hover:bg-primary/90 transition-colors">
            Export PNG
          </button>
        </Panel>
      </ReactFlow>
      <div className="export-exclude absolute bottom-4 left-4 text-xs text-muted-foreground italic z-10 bg-white/80 px-2 py-1 rounded pointer-events-none">
        * If the decision point is 'No,' the process must revert to the initiation point activity
      </div>
    </div>
  );
}

export function FlowchartEditor(props: FlowchartEditorProps) {
  return (
    <div className="w-full h-full">
      <ReactFlowProvider>
        <FlowchartEditorContent {...props} />
      </ReactFlowProvider>
    </div>
  );
}
