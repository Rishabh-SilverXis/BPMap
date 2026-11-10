export interface ProcessStep {
  id: string;
  step: string;
  order: string;
  condition: string; // If column
  type: 'Initiation' | 'Approval' | 'Action' | 'End' | string;
  specify: string;
  optional: string;
  group: string;
  additionalInfo: string;
  dueDate: string;
}

export interface FlowchartData {
  title: string;
  swimlanes: string[];
  steps: ProcessStep[];
}

export interface FlowchartNodeData {
  label: string;
  type: string;
  group: string;
  condition?: string;
  specify?: string;
  additionalInfo?: string;
  dueDate?: string;
}
