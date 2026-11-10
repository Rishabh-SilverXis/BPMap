import React from 'react';
import { FlowchartData } from '../types';
import { X } from 'lucide-react';

interface DataVerificationProps {
  data: FlowchartData;
  onClose: () => void;
  onRegenerate: (newData: FlowchartData) => void;
}

export function DataVerification({ data, onClose, onRegenerate }: DataVerificationProps) {
  const [editedData, setEditedData] = React.useState<FlowchartData>(data);

  const handleStepChange = (index: number, field: keyof FlowchartData['steps'][0], value: string) => {
    const newSteps = [...editedData.steps];
    newSteps[index] = { ...newSteps[index], [field]: value };
    setEditedData({ ...editedData, steps: newSteps });
  };

  const handleAddRow = () => {
    setEditedData({
      ...editedData,
      steps: [
        ...editedData.steps,
        {
          step: '',
          order: '',
          condition: '',
          type: 'Action',
          specify: '',
          group: '',
          dueDate: ''
        }
      ]
    });
  };

  const handleDeleteRow = (index: number) => {
    const newSteps = [...editedData.steps];
    newSteps.splice(index, 1);
    setEditedData({ ...editedData, steps: newSteps });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-bold text-primary">Verify Extracted Data</h2>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-4 overflow-auto flex-1">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Process Title</label>
            <input 
              type="text" 
              value={editedData.title} 
              onChange={(e) => setEditedData({...editedData, title: e.target.value})}
              className="w-full p-2 border rounded-md"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead className="text-xs uppercase bg-muted text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 border">Step</th>
                  <th className="px-4 py-3 border">Order</th>
                  <th className="px-4 py-3 border bg-blue-50">If (Condition)</th>
                  <th className="px-4 py-3 border bg-green-50">Type</th>
                  <th className="px-4 py-3 border">Specify</th>
                  <th className="px-4 py-3 border bg-indigo-50">Group (Swimlane)</th>
                  <th className="px-4 py-3 border">Due Date</th>
                  <th className="px-4 py-3 border w-10"></th>
                </tr>
              </thead>
              <tbody>
                {editedData.steps.map((step, index) => (
                  <tr key={`step-${index}`} className="border-b hover:bg-gray-50">
                    <td className="px-2 py-2 border">
                      <input type="text" value={step.step} onChange={(e) => handleStepChange(index, 'step', e.target.value)} className="w-full p-1 border-transparent hover:border-gray-300 focus:border-primary rounded" />
                    </td>
                    <td className="px-2 py-2 border">
                      <input type="text" value={step.order || ''} onChange={(e) => handleStepChange(index, 'order', e.target.value)} className="w-full p-1 border-transparent hover:border-gray-300 focus:border-primary rounded" />
                    </td>
                    <td className="px-2 py-2 border bg-blue-50/50">
                      <input type="text" value={step.condition || ''} onChange={(e) => handleStepChange(index, 'condition', e.target.value)} className="w-full p-1 border-transparent hover:border-gray-300 focus:border-primary rounded bg-transparent" />
                    </td>
                    <td className="px-2 py-2 border bg-green-50/50">
                      <select value={step.type} onChange={(e) => handleStepChange(index, 'type', e.target.value)} className="w-full p-1 border-transparent hover:border-gray-300 focus:border-primary rounded bg-transparent">
                        <option value="Initiation">Initiation</option>
                        <option value="Approval">Approval</option>
                        <option value="Action">Action</option>
                        <option value="End">End</option>
                      </select>
                    </td>
                    <td className="px-2 py-2 border">
                      <input type="text" value={step.specify || ''} onChange={(e) => handleStepChange(index, 'specify', e.target.value)} className="w-full p-1 border-transparent hover:border-gray-300 focus:border-primary rounded" />
                    </td>
                    <td className="px-2 py-2 border bg-indigo-50/50">
                      <input type="text" value={step.group || ''} onChange={(e) => handleStepChange(index, 'group', e.target.value)} className="w-full p-1 border-transparent hover:border-gray-300 focus:border-primary rounded bg-transparent" />
                    </td>
                    <td className="px-2 py-2 border">
                      <input type="text" value={step.dueDate || ''} onChange={(e) => handleStepChange(index, 'dueDate', e.target.value)} className="w-full p-1 border-transparent hover:border-gray-300 focus:border-primary rounded" />
                    </td>
                    <td className="px-2 py-2 border text-center">
                      <button 
                        onClick={() => handleDeleteRow(index)}
                        className="p-1 text-red-500 hover:bg-red-50 rounded"
                        title="Delete Row"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="mt-4">
            <button 
              onClick={handleAddRow}
              className="px-4 py-2 bg-blue-50 text-blue-600 border border-blue-200 rounded-md hover:bg-blue-100 font-medium text-sm transition-colors"
            >
              + Add Row
            </button>
          </div>
        </div>
        
        <div className="p-4 border-t bg-gray-50 flex justify-end space-x-3">
          <button onClick={onClose} className="px-4 py-2 border rounded-md hover:bg-gray-100 font-medium text-sm">
            Cancel
          </button>
          <button onClick={() => onRegenerate(editedData)} className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 font-medium text-sm">
            Regenerate Flowchart
          </button>
        </div>
      </div>
    </div>
  );
}
