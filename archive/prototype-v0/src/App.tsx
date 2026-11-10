import React, { useState } from 'react';
import { UploadSection } from './components/UploadSection';
import { FlowchartEditor } from './components/FlowchartEditor';
import { DataVerification } from './components/DataVerification';
import { analyzeTableImage } from './lib/gemini';
import { FlowchartData } from './types';
import { FileText, Settings, Download, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { Toaster, toast } from 'sonner';

const MOCK_DATA: FlowchartData = {
  title: "Create Journal Process Overview",
  swimlanes: ["Accountant", "Accounting Manager", "Controller", "Initiator"],
  steps: [
    {
      id: "step-a",
      step: "Accounting Journal Event step a",
      order: "a",
      condition: "",
      type: "Initiation",
      specify: "Create Journal and provide ledger, date and journal source",
      optional: "No",
      group: "Accountant",
      additionalInfo: "",
      dueDate: ""
    },
    {
      id: "step-a1",
      step: "Accounting Journal Event step a1",
      order: "a1",
      condition: "Accounting Journal Contains Control Account?",
      type: "Approval",
      specify: "",
      optional: "No",
      group: "Accounting Manager",
      additionalInfo: "Restriction: Initiator, Approvers",
      dueDate: "2 Days"
    },
    {
      id: "step-c",
      step: "Accounting Journal Event step c",
      order: "c",
      condition: "Journal Amount >= Threshold?",
      type: "Approval",
      specify: "",
      optional: "No",
      group: "Controller",
      additionalInfo: "Restriction: Initiator, Approvers",
      dueDate: "2 Days"
    },
    {
      id: "step-d",
      step: "Accounting Journal Event step d",
      order: "d",
      condition: "Only trigger intercompany events for intercompany journals?",
      type: "Action",
      specify: "Initiate Accounting Journal Intercompany Event",
      optional: "No",
      group: "Initiator",
      additionalInfo: "",
      dueDate: "1 Day"
    },
    {
      id: "step-end",
      step: "End",
      order: "e",
      condition: "",
      type: "End",
      specify: "",
      optional: "No",
      group: "Initiator",
      additionalInfo: "",
      dueDate: ""
    }
  ]
};

export default function App() {
  const [isLoading, setIsLoading] = useState(false);
  const [flowchartData, setFlowchartData] = useState<FlowchartData | null>(null);
  const [showDataVerification, setShowDataVerification] = useState(false);
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [isSourcePanelOpen, setIsSourcePanelOpen] = useState(true);
  const [panelWidth, setPanelWidth] = useState(300);
  const [isResizing, setIsResizing] = useState(false);

  const startResizing = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = React.useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = React.useCallback(
    (e: MouseEvent) => {
      if (isResizing) {
        const newWidth = e.clientX;
        if (newWidth > 200 && newWidth < window.innerWidth * 0.8) {
          setPanelWidth(newWidth);
        }
      }
    },
    [isResizing]
  );

  React.useEffect(() => {
    window.addEventListener('mousemove', resize);
    window.addEventListener('mouseup', stopResizing);
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [resize, stopResizing]);

  const handleUpload = async (base64: string, mimeType: string) => {
    setIsLoading(true);
    setOriginalImage(`data:${mimeType};base64,${base64}`);
    try {
      const data = await analyzeTableImage(base64, mimeType);
      setFlowchartData(data);
    } catch (err: any) {
      console.error("Analysis Error:", err);
      toast.error(`Failed to analyze the image: ${err.message || 'Unknown error'}. Please try again with a clearer screenshot.`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadExample = () => {
    setOriginalImage(null);
    setFlowchartData(MOCK_DATA);
  };

  const handleRegenerate = (newData: FlowchartData) => {
    // Re-extract swimlanes based on updated groups
    const uniqueGroups = Array.from(new Set(newData.steps.map(s => s.group).filter(Boolean)));
    setFlowchartData({
      ...newData,
      swimlanes: uniqueGroups,
    });
    setShowDataVerification(false);
  };

  return (
    <div className="h-screen bg-background flex flex-col font-sans">
      <Toaster position="top-center" richColors />
      <header className="bg-white border-b border-border px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center space-x-3">
          {/* 
            LOCAL SETUP INSTRUCTIONS:
            1. Create a folder named 'public' in the root of your VS Code project (if it doesn't exist).
            2. Place your logo file named 'workday-logo.png' inside that 'public' folder.
            3. The image will now correctly load both in development and after running 'npm run build'.
          */}
          <img 
            src="./workday-logo.png" 
            alt="Workday Logo" 
            className="h-8 w-auto object-contain"
            onError={(e) => {
              // This fallback ensures the preview doesn't show a broken image icon
              // before you add your local file.
              (e.target as HTMLImageElement).src = 'https://logos-world.net/wp-content/uploads/2021/03/Workday-Logo.png';
            }}
          />
          <div className="h-6 w-px bg-gray-300 mx-1"></div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">Flowchart AI</h1>
        </div>
        
        {flowchartData && (
          <div className="flex items-center space-x-3">
            <button 
              onClick={() => setFlowchartData(null)}
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              New Upload
            </button>
            <button 
              onClick={() => setShowDataVerification(true)}
              className="flex items-center space-x-2 px-3 py-1.5 border border-border rounded-md text-sm font-medium hover:bg-muted transition-colors"
            >
              <Settings className="w-4 h-4" />
              <span>Edit Data</span>
            </button>
          </div>
        )}
      </header>

      <main className="flex-1 flex flex-col relative overflow-hidden min-h-0">
        {!flowchartData ? (
          <div className="flex-1 flex flex-col overflow-auto bg-[#002b54]">
            {/* Hero Top Section - Workday Gradient */}
            <div className="w-full bg-gradient-to-b from-[#fde4c3] to-[#fdbb5d] pt-20 pb-32 px-6 flex flex-col items-center justify-center text-center">
              <h1 className="text-4xl md:text-6xl font-extrabold text-[#002b54] max-w-4xl tracking-tight mb-6 leading-tight">
                Turn Process Tables into Interactive Flowcharts. Instantly.
              </h1>
              <p className="text-lg md:text-xl text-[#002b54]/90 max-w-2xl font-medium">
                Upload a screenshot of your Workday Business Process steps, and our AI will automatically generate a professional, fully editable swimlane flowchart.
              </p>
            </div>

            {/* Upload Section Container */}
            <div className="w-full flex-1 flex flex-col items-center px-6 -mt-16 relative z-10 pb-12">
              <div className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl p-8 border border-gray-100">
                <UploadSection onUpload={handleUpload} onLoadExample={handleLoadExample} isLoading={isLoading} />
              </div>
              
              <div className="mt-auto pt-16 text-center text-white/70 text-sm font-medium">
                <p>This site is built by Rishabh using AI to solve your problem.</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col md:flex-row h-full overflow-hidden min-h-0">
            {/* Left Panel - Original Image (Optional/Collapsible in real app) */}
            {isSourcePanelOpen ? (
              <div 
                className="relative border-r border-border bg-gray-50 flex flex-col overflow-hidden hidden md:flex min-h-0 transition-all duration-300"
                style={{ width: `${panelWidth}px`, flexShrink: 0 }}
              >
                <div className="p-4 flex flex-col h-full">
                  <div className="flex justify-between items-center mb-3 shrink-0">
                    <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Original Source</h3>
                    <button 
                      onClick={() => setIsSourcePanelOpen(false)} 
                      className="p-1 hover:bg-gray-200 rounded text-gray-500 transition-colors"
                      title="Collapse Panel"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex-1 overflow-auto border border-gray-200 rounded-lg bg-white p-2 flex items-center justify-center text-center text-muted-foreground text-sm min-h-0">
                    {originalImage ? (
                      <img src={originalImage} alt="Original Table" className="w-full h-auto object-contain" />
                    ) : (
                      <p>Using Example Data</p>
                    )}
                  </div>
                  <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-lg shrink-0">
                    <p className="text-xs text-blue-800">
                      <strong>Tip:</strong> If the flowchart looks incorrect, click "Edit Data" in the top right to fix OCR extraction errors.
                    </p>
                  </div>
                </div>
                {/* Resizer Handle */}
                <div
                  className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-blue-400 active:bg-blue-500 transition-colors z-10"
                  onMouseDown={startResizing}
                />
              </div>
            ) : (
              <div className="hidden md:flex flex-col border-r border-border bg-gray-50 p-2 items-center min-h-0 w-12 transition-all duration-300">
                <button 
                  onClick={() => setIsSourcePanelOpen(true)} 
                  className="p-2 hover:bg-gray-200 rounded text-gray-500 mb-4 transition-colors" 
                  title="Show Original Source"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <div 
                  className="text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap" 
                  style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                >
                  Original Source
                </div>
              </div>
            )}

            {/* Right Panel - Flowchart Editor */}
            <div className="flex-1 relative">
              <div className="absolute inset-0">
                <FlowchartEditor 
                  data={flowchartData} 
                  onEditData={() => setShowDataVerification(true)} 
                />
              </div>
            </div>
          </div>
        )}
      </main>

      {showDataVerification && flowchartData && (
        <DataVerification 
          data={flowchartData} 
          onClose={() => setShowDataVerification(false)}
          onRegenerate={handleRegenerate}
        />
      )}
    </div>
  );
}
