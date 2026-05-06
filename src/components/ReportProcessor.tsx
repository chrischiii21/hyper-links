import React, { useState, useRef } from 'react';
import { Upload, Clipboard, Check, FileText, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Section {
  id: number;
  title: string;
  body: string;
}

export default function ReportProcessor() {
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [toastMessage, setToastMessage] = useState<{title: string, type: 'success'|'info'|'error'} | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout>();

  const showToast = (title: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToastMessage({ title, type });
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  const handleFileUpload = async (file: File) => {
    setLoading(true);
    setError(null);
    setSections([]);
    showToast('Uploading and processing document...', 'info');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/extract', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to extract sections');
      }

      const data = await response.json();
      setSections(data);
      showToast('Document extracted successfully!', 'success');
    } catch (err: any) {
      setError(err.message);
      showToast('Extraction failed!', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  const handleCopy = async (id: number, title: string, htmlBody: string) => {
    try {
      // Create rich HTML content including the title, ensuring it is not bold
      const fullHtml = `<h2 style="font-weight: 300;"><span style="font-weight: 300;">${title}</span></h2>\n${htmlBody}`;
      
      // Create a plain text fallback
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = fullHtml;
      const plainText = tempDiv.innerText || tempDiv.textContent || '';
      
      const blobHtml = new Blob([fullHtml], { type: 'text/html' });
      const blobText = new Blob([plainText], { type: 'text/plain' });
      
      const clipboardItem = new ClipboardItem({ 
        'text/html': blobHtml,
        'text/plain': blobText
      });
      
      await navigator.clipboard.write([clipboardItem]);
      setCopiedId(id);
      showToast('Section copied to clipboard!', 'success');
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy rich text, falling back to plain text:', err);
      try {
        // Fallback for older browsers
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = `<h2 style="font-weight: 300;"><span style="font-weight: 300;">${title}</span></h2>\n${htmlBody}`;
        await navigator.clipboard.writeText(tempDiv.innerText);
        setCopiedId(id);
        showToast('Section copied to clipboard!', 'success');
        setTimeout(() => setCopiedId(null), 2000);
      } catch (fallbackErr) {
        console.error('Fallback copy also failed:', fallbackErr);
        showToast('Failed to copy section', 'error');
      }
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <header className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Research Report Pipeline</h1>
        <p className="text-slate-500">Upload a report to extract sections I through X</p>
      </header>

      {/* Upload Zone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          "relative group cursor-pointer border-2 border-dashed border-slate-300 rounded-2xl p-12 transition-all duration-200",
          "hover:border-blue-500 hover:bg-blue-50/50",
          loading && "opacity-50 pointer-events-none"
        )}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={(e) => {
            if (e.target.files?.[0]) {
              handleFileUpload(e.target.files[0]);
              e.target.value = ''; // Reset input to allow uploading same file again
            }
          }}
          className="hidden"
          accept=".txt,.doc,.docx,.md"
        />
        <div className="flex flex-col items-center justify-center space-y-4 text-center">
          <div className="p-4 bg-slate-100 rounded-full group-hover:bg-blue-100 transition-colors">
            {loading ? (
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            ) : (
              <Upload className="w-8 h-8 text-slate-600 group-hover:text-blue-600" />
            )}
          </div>
          <div>
            <p className="text-lg font-medium text-slate-900">
              {loading ? 'Processing Report...' : 'Drop your research report here'}
            </p>
            <p className="text-sm text-slate-500">or click to browse files</p>
          </div>
        </div>
      </div>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm"
        >
          {error}
        </motion.div>
      )}

      {/* Sections List */}
      <div className="space-y-12">
        {sections.map((section) => (
          <section key={section.id} className="relative group">
            <div className="sticky top-4 z-10 flex items-center justify-between bg-white/80 backdrop-blur-md p-4 rounded-xl border border-slate-200 shadow-sm mb-4">
              <h2 className="text-xl font-light text-slate-800">{section.title}</h2>
              <button
                onClick={() => handleCopy(section.id, section.title, section.body)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                  copiedId === section.id
                    ? "bg-green-600 text-white"
                    : "bg-slate-900 text-white hover:bg-slate-800"
                )}
              >
                {copiedId === section.id ? (
                  <>
                    <Check className="w-4 h-4" />
                    Copied
                  </>
                ) : (
                  <>
                    <Clipboard className="w-4 h-4" />
                    Copy Section
                  </>
                )}
              </button>
            </div>
            
            <div 
              className="prose prose-slate max-w-none bg-white p-8 rounded-2xl border border-slate-200 shadow-sm"
              dangerouslySetInnerHTML={{ __html: section.body }}
            />
          </section>
        ))}
      </div>

      {/* Empty State */}
      {!loading && sections.length === 0 && !error && (
        <div className="text-center py-20 text-slate-400">
          <FileText className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p>No sections extracted yet. Upload a report to begin.</p>
        </div>
      )}

      {/* Global Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.95 }}
            className={cn(
              "fixed bottom-8 right-8 px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 z-50",
              toastMessage.type === 'success' ? 'bg-slate-900 text-white' : 
              toastMessage.type === 'error' ? 'bg-red-600 text-white' :
              'bg-blue-600 text-white'
            )}
          >
            <div className={cn(
              "rounded-full p-1",
              toastMessage.type === 'success' ? 'bg-green-500' :
              toastMessage.type === 'error' ? 'bg-red-500' :
              'bg-blue-500'
            )}>
              {toastMessage.type === 'success' ? <Check className="w-4 h-4 text-white" /> : 
               toastMessage.type === 'error' ? <span className="w-4 h-4 text-white font-bold flex items-center justify-center" style={{fontSize: '10px'}}>!</span> :
               <Loader2 className="w-4 h-4 text-white animate-spin" />}
            </div>
            <span className="text-sm font-medium">{toastMessage.title}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
