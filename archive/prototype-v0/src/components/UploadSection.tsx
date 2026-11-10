import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, Image as ImageIcon, FileText, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';

interface UploadSectionProps {
  onUpload: (base64: string, mimeType: string) => void;
  onLoadExample: () => void;
  isLoading: boolean;
}

export function UploadSection({ onUpload, onLoadExample, isLoading }: UploadSectionProps) {
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setError(null);
    const file = acceptedFiles[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setError('File is too large. Maximum size is 10MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Extract base64 and mime type
      const match = result.match(/^data:(image\/[a-zA-Z+.-]+|application\/pdf);base64,(.+)$/);
      if (match) {
        onUpload(match[2], match[1]);
      } else {
        setError('Invalid file format.');
      }
    };
    reader.onerror = () => {
      setError('Failed to read file.');
    };
    reader.readAsDataURL(file);
  }, [onUpload]);

  const dropzoneOptions: any = {
    onDrop,
    accept: {
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'application/pdf': ['.pdf'],
    },
    maxFiles: 1,
    disabled: isLoading,
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone(dropzoneOptions);

  return (
    <div className="w-full max-w-3xl mx-auto p-2">
      <div
        {...getRootProps()}
        className={cn(
          "border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors duration-200",
          isDragActive ? "border-accent bg-accent/5" : "border-border hover:border-accent/50 hover:bg-muted/50",
          isLoading && "opacity-50 cursor-not-allowed"
        )}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center justify-center space-y-4">
          {isLoading ? (
            <Loader2 className="w-12 h-12 text-accent animate-spin" />
          ) : (
            <Upload className="w-12 h-12 text-muted-foreground" />
          )}
          <div className="space-y-1">
            <p className="text-lg font-medium">
              {isLoading ? "Analyzing table structure..." : isDragActive ? "Drop the screenshot here" : "Drag & drop your screenshot here"}
            </p>
            <p className="text-sm text-muted-foreground">
              or click to browse files (PNG, JPG, PDF up to 10MB)
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-4 p-4 bg-destructive/10 text-destructive rounded-lg text-sm text-center">
          {error}
        </div>
      )}

      <div className="mt-8">
        <p className="text-sm font-medium text-muted-foreground mb-4 text-center">Or try with an example</p>
        <div className="flex justify-center">
          <button
            disabled={isLoading}
            className="flex items-center space-x-2 px-4 py-2 border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
            onClick={onLoadExample}
          >
            <ImageIcon className="w-4 h-4" />
            <span>Try Example Table</span>
          </button>
        </div>
      </div>
    </div>
  );
}
