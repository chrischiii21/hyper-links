import React, { useState, useRef } from 'react';
import { Upload, Clipboard, Check, FileText, Loader2, Terminal, LayoutGrid, Trash2, CheckCircle, Wand2, Plus, ChevronDown, ChevronUp } from 'lucide-react';
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
  const [mode, setMode] = useState<'upload' | 'paste'>('upload');
  const [pastedText, setPastedText] = useState('');
  const [showInput, setShowInput] = useState(true);
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
      setShowInput(false);
      showToast('Document extracted successfully!', 'success');
    } catch (err: any) {
      setError(err.message);
      showToast('Extraction failed!', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handlePasteSubmit = async () => {
    if (!pastedText.trim()) {
      showToast('Please paste some text first', 'error');
      return;
    }

    setLoading(true);
    setError(null);
    setSections([]);
    showToast('Processing pasted report...', 'info');

    try {
      const response = await fetch('/api/extract-paste', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: pastedText }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to process pasted text');
      }

      const data = await response.json();
      setSections(data);
      setShowInput(false);
      showToast('Report processed successfully!', 'success');
      setPastedText(''); // Clear on success
    } catch (err: any) {
      setError(err.message);
      showToast('Processing failed!', 'error');
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
      // Use a temporary div to analyze the HTML structure robustly
      const analysisDiv = document.createElement('div');
      analysisDiv.innerHTML = htmlBody;
      
      // Find the first child element that actually contains visible text
      let firstTextElement = null;
      for (const child of Array.from(analysisDiv.children)) {
        if (child.textContent && child.textContent.trim().length > 0) {
          firstTextElement = child;
          break;
        }
      }

      // If the first visible element is already a heading, avoid duplicating the title
      const hasTopHeading = firstTextElement && /^H[1-4]$/i.test(firstTextElement.tagName);

      // Create rich HTML content. Only inject the main section title if there's no heading at the top.
      const fullHtml = hasTopHeading 
        ? htmlBody 
        : `<h2 style="font-weight: 300;"><span style="font-weight: 300;">${title}</span></h2>\n${htmlBody}`;
      
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
        // Fallback logic requires the same top-heading check
        const analysisDiv = document.createElement('div');
        analysisDiv.innerHTML = htmlBody;
        let firstTextElement = null;
        for (const child of Array.from(analysisDiv.children)) {
          if (child.textContent && child.textContent.trim().length > 0) {
            firstTextElement = child;
            break;
          }
        }
        const hasTopHeading = firstTextElement && /^H[1-4]$/i.test(firstTextElement.tagName);
        const fullHtml = hasTopHeading 
          ? htmlBody 
          : `<h2 style="font-weight: 300;"><span style="font-weight: 300;">${title}</span></h2>\n${htmlBody}`;

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = fullHtml;
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
    <div className="max-w-4xl mx-auto px-4 space-y-8">
      {/* Control Center Header */}
      <header className="mb-10 flex flex-col items-center text-center">
        <h2 className="text-3xl font-black text-slate-900 tracking-tight mb-4">Report Processor</h2>
        <div className="bg-slate-100 p-1.5 rounded-[1.5rem] flex items-center gap-1 border border-slate-200">
          <button
            onClick={() => setMode('upload')}
            className={cn(
              "flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-300",
              mode === 'upload' ? "bg-white text-indigo-600 shadow-md" : "text-slate-500 hover:text-slate-800"
            )}
          >
            <Upload className="w-4 h-4" />
            File Ingestion
          </button>
          <button
            onClick={() => setMode('paste')}
            className={cn(
              "flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 relative",
              mode === 'paste' ? "bg-white text-indigo-600 shadow-md" : "text-slate-500 hover:text-slate-800"
            )}
          >
            <Clipboard className="w-4 h-4" />
            Clipboard Data
            <span className="absolute -top-2 -right-2 px-2 py-0.5 bg-indigo-100 text-[10px] text-indigo-700 rounded-full border border-indigo-200 font-black tracking-tighter shadow-sm">
              LAB
            </span>
          </button>
        </div>
      </header>

      {/* Primary Workspace */}
      <div className="space-y-8">
        {!showInput && sections.length > 0 ? (
          <div className="flex justify-center">
            <button
              onClick={() => setShowInput(true)}
              className="flex items-center gap-3 px-8 py-4 bg-white border-2 border-indigo-100 text-indigo-600 rounded-[2rem] font-bold shadow-premium hover:bg-indigo-50 transition-all group animate-in fade-in zoom-in duration-500"
            >
              <div className="w-8 h-8 bg-indigo-600 text-white rounded-xl flex items-center justify-center transition-transform group-hover:rotate-90">
                <Plus className="w-5 h-5" />
              </div>
              <span className="tracking-tight">Ingest New Report</span>
            </button>
          </div>
        ) : (
          <div className="relative">
            {sections.length > 0 && (
              <button
                onClick={() => setShowInput(false)}
                className="absolute -top-4 right-8 z-20 flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest rounded-full shadow-xl hover:bg-indigo-600 transition-all active:scale-95"
              >
                <ChevronUp className="w-3 h-3" />
                Hide Ingestion Hub
              </button>
            )}
            {mode === 'upload' ? (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "relative group cursor-pointer border-3 border-dashed border-slate-200 rounded-[3rem] p-16 transition-all duration-500",
              "hover:border-indigo-500 hover:bg-indigo-50/30 hover:shadow-2xl hover:shadow-indigo-500/5",
              loading && "opacity-50 pointer-events-none"
            )}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent rounded-[3rem] opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => {
                if (e.target.files?.[0]) {
                  handleFileUpload(e.target.files[0]);
                  e.target.value = '';
                }
              }}
              className="hidden"
              accept=".txt,.doc,.docx,.md,.pdf"
            />
            <div className="flex flex-col items-center justify-center space-y-6 text-center relative z-10">
              <div className={cn(
                "w-24 h-24 rounded-[2rem] flex items-center justify-center transition-all duration-500 group-hover:rotate-6",
                loading ? "bg-indigo-600 shadow-indigo-200 shadow-2xl" : "bg-slate-100 text-slate-400 group-hover:bg-indigo-600 group-hover:text-white group-hover:shadow-indigo-200 group-hover:shadow-2xl"
              )}>
                {loading ? (
                  <Loader2 className="w-10 h-10 text-white animate-spin" />
                ) : (
                  <Upload className="w-10 h-10 transition-transform group-hover:scale-110" />
                )}
              </div>
              <div className="space-y-2">
                <p className="text-2xl font-black text-slate-900 tracking-tight">
                  {loading ? 'Synthesizing...' : 'Ingest Report'}
                </p>
                <p className="text-slate-500 font-medium">Drop DOCX, PDF, or TXT to begin parsing</p>
              </div>
              
              {!loading && (
                <div className="pt-4">
                  <span className="px-5 py-2 bg-white border border-slate-200 rounded-full text-xs font-bold text-slate-400 shadow-sm group-hover:text-indigo-600 group-hover:border-indigo-200 transition-colors">
                    Click to browse local files
                  </span>
                </div>
              )}
            </div>
          </div>
      ) : (
          <div className="bg-white rounded-[2.5rem] border border-slate-200 p-10 shadow-premium space-y-6">
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center">
                  <Clipboard className="w-4 h-4" />
                </div>
                <label className="text-lg font-bold text-slate-800 tracking-tight">Paste Protocol</label>
              </div>
              <button 
                onClick={() => setPastedText('')}
                className="text-xs font-bold text-slate-400 hover:text-rose-500 uppercase tracking-widest transition-colors"
              >
                Reset
              </button>
            </div>
            <textarea
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              placeholder="Paste your raw research content here for automated segmentation..."
              className="w-full h-80 p-8 rounded-[2rem] bg-slate-50 border-2 border-transparent focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5 outline-none transition-all resize-none font-medium text-slate-600 leading-relaxed placeholder:text-slate-300"
            />
            <button
              onClick={handlePasteSubmit}
              disabled={loading || !pastedText.trim()}
              className="w-full py-5 bg-indigo-600 text-white font-black rounded-2xl shadow-xl shadow-indigo-100 hover:bg-indigo-700 disabled:opacity-50 transition-all flex items-center justify-center gap-3 premium-button"
            >
              {loading ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                  Initialize Segmentation
                </div>
              )}
            </button>
          </div>
        )}
        </div>
        )}

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm"
        >
          {error}
        </motion.div>
      )}

        {/* Output Section */}
        {sections.length > 0 && (
          <div className="pt-12 space-y-10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-indigo-100">
                  <LayoutGrid className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight">Segmented Output</h3>
                  <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-0.5">{sections.length} Components Identified</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-12">
              {sections.map((section) => (
                <section key={section.id} className="space-y-6">
                  <div className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black text-xs shadow-lg shadow-indigo-100">
                        {section.id}
                      </div>
                      <h3 className="text-xl font-bold text-slate-900 tracking-tight">{section.title}</h3>
                    </div>
                    <button
                      onClick={() => handleCopy(section.id, section.title, section.body)}
                      className={cn(
                        "flex items-center gap-2 py-2.5 px-6 rounded-xl font-bold transition-all premium-button",
                        copiedId === section.id 
                          ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" 
                          : "bg-white text-slate-900 border border-slate-200 hover:bg-slate-50 shadow-sm"
                      )}
                    >
                      {copiedId === section.id ? (
                        <>
                          <Check className="w-4 h-4" />
                          Copied!
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
                    className="prose-premium max-w-none bg-white p-10 rounded-[2.5rem] border border-slate-200 shadow-premium group transition-all duration-500 hover:border-indigo-100"
                    dangerouslySetInnerHTML={{ __html: section.body }}
                  />
                </section>
              ))}
            </div>
            
            <div className="text-center py-10">
              <button 
                onClick={() => {
                  setSections([]);
                  setShowInput(true);
                }}
                className="text-sm font-bold text-slate-400 hover:text-rose-500 uppercase tracking-widest transition-colors flex items-center gap-2 mx-auto"
              >
                <Trash2 className="w-4 h-4" />
                Clear All Segments
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Empty State */}
      {!loading && sections.length === 0 && !error && (
        <div className="text-center py-24 text-slate-300">
          <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6 border border-slate-100">
            <FileText className="w-10 h-10 opacity-20" />
          </div>
          <p className="font-bold text-slate-400">No segments extracted yet.</p>
          <p className="text-sm">Initiate ingestion to begin analysis.</p>
        </div>
      )}

      {/* Global Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            className={cn(
              "fixed bottom-10 right-10 px-8 py-4 rounded-[2rem] shadow-2xl flex items-center gap-4 z-[200] border border-white/10 backdrop-blur-xl",
              toastMessage.type === 'success' ? 'bg-slate-900/95 text-white' : 
              toastMessage.type === 'error' ? 'bg-rose-600 text-white' :
              'bg-indigo-600 text-white'
            )}
          >
            <div className={cn(
              "rounded-xl p-2 shadow-inner",
              toastMessage.type === 'success' ? 'bg-emerald-500' :
              toastMessage.type === 'error' ? 'bg-rose-500' :
              'bg-white/20'
            )}>
              {toastMessage.type === 'success' ? <Check className="w-5 h-5 text-white" /> : 
               toastMessage.type === 'error' ? <span className="w-5 h-5 text-white font-black flex items-center justify-center">!</span> :
               <Loader2 className="w-5 h-5 text-white animate-spin" />}
            </div>
            <div>
              <p className="text-[10px] font-black text-white/40 uppercase tracking-widest leading-none mb-1">System Message</p>
              <span className="text-sm font-bold tracking-tight">{toastMessage.title}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
