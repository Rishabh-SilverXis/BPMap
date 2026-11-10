import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { cn } from '../lib/utils';

interface NodeProps {
  data: {
    label: string;
    condition?: string;
    dueDate?: string;
  };
}

export const StartNode = memo(({ data }: NodeProps) => {
  return (
    <div className="flex items-center justify-center w-16 h-16 bg-success text-white rounded-full border-2 border-success shadow-md">
      <Handle type="target" position={Position.Left} id="left" className="w-2 h-2 bg-gray-800" />
      <Handle type="target" position={Position.Bottom} id="bottom" className="w-2 h-2 bg-gray-800" />
      <div className="font-bold text-sm">{data.label || 'Start'}</div>
      <Handle type="source" position={Position.Right} id="right" className="w-2 h-2 bg-gray-800" />
    </div>
  );
});

export const EndNode = memo(({ data }: NodeProps) => {
  return (
    <div className="flex items-center justify-center w-16 h-16 bg-danger text-white rounded-full border-2 border-danger shadow-md">
      <Handle type="target" position={Position.Left} id="left" className="w-2 h-2 bg-gray-800" />
      <Handle type="target" position={Position.Bottom} id="bottom" className="w-2 h-2 bg-gray-800" />
      <div className="font-bold text-sm">{data.label || 'End'}</div>
    </div>
  );
});

export const ApprovalNode = memo(({ data }: NodeProps) => {
  return (
    <div className="relative flex flex-col items-center justify-center min-w-[120px] px-4 py-3 bg-blue-100 border border-blue-300 rounded shadow-sm">
      <Handle type="target" position={Position.Left} id="left" className="w-2 h-2 bg-gray-800" />
      <Handle type="target" position={Position.Bottom} id="bottom" className="w-2 h-2 bg-gray-800" />
      <div className="text-sm font-medium text-gray-800 text-center">{data.label || 'Approval'}</div>
      {data.dueDate && (
        <div className="absolute -top-6 text-xs text-gray-500 whitespace-nowrap">{data.dueDate}</div>
      )}
      <Handle type="source" position={Position.Right} id="right" className="w-2 h-2 bg-gray-800" />
    </div>
  );
});

export const ActionNode = memo(({ data }: NodeProps) => {
  return (
    <div className="relative flex flex-col items-center justify-center min-w-[150px] max-w-[200px] px-4 py-3 bg-white border border-gray-400 rounded shadow-sm">
      <Handle type="target" position={Position.Left} id="left" className="w-2 h-2 bg-gray-800" />
      <Handle type="target" position={Position.Bottom} id="bottom" className="w-2 h-2 bg-gray-800" />
      <div className="text-sm text-gray-800 text-center break-words">{data.label}</div>
      {data.dueDate && (
        <div className="absolute -top-6 text-xs text-gray-500 whitespace-nowrap">{data.dueDate}</div>
      )}
      <Handle type="source" position={Position.Right} id="right" className="w-2 h-2 bg-gray-800" />
    </div>
  );
});

export const DecisionNode = memo(({ data }: NodeProps) => {
  return (
    <div className="relative flex flex-col items-center justify-center">
      <Handle type="target" position={Position.Left} id="left" className="w-2 h-2 bg-gray-800" />
      <Handle type="target" position={Position.Bottom} id="bottom-target" className="w-2 h-2 bg-gray-800" />
      <div className="w-16 h-16 bg-accent text-white flex items-center justify-center shadow-md" style={{ transform: 'rotate(45deg)' }}>
        <div className="font-bold text-sm" style={{ transform: 'rotate(-45deg)' }}>{data.label || 'if'}</div>
      </div>
      {data.condition && (
        <div className="absolute top-20 text-xs text-gray-700 text-center w-32 break-words">{data.condition}</div>
      )}
      <Handle type="source" position={Position.Right} id="right" className="w-2 h-2 bg-gray-800" />
      <Handle type="source" position={Position.Bottom} id="bottom" className="w-2 h-2 bg-gray-800" />
      <Handle type="source" position={Position.Top} id="top" className="w-2 h-2 bg-gray-800" />
    </div>
  );
});

export const InfoNode = memo(({ data }: NodeProps) => {
  return (
    <div className="flex flex-col items-center justify-center min-w-[150px] max-w-[250px] px-3 py-2 bg-blue-50 border-2 border-dashed border-gray-400 rounded shadow-sm">
      <div className="text-xs text-gray-700 text-center break-words">{data.label}</div>
      <Handle type="source" position={Position.Bottom} className="w-1 h-1 bg-transparent border-none" />
    </div>
  );
});

export const SwimlaneNode = memo(({ data }: NodeProps) => {
  return (
    <div className="w-full h-full flex bg-slate-50 border border-slate-200 rounded-sm overflow-hidden">
      <div className="w-[120px] h-full bg-primary flex items-center justify-center text-white font-bold shrink-0">
        <div className="transform -rotate-90 whitespace-nowrap">{data.label}</div>
      </div>
      <div className="flex-1 h-full"></div>
    </div>
  );
});
