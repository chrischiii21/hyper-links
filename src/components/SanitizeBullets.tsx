import React, { useState, useRef } from 'react';
import {
  Clipboard,
  List,
  CheckCircle,
  Loader2,
  Wand2,
  Info,
  Trash2
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { motion, AnimatePresence } from 'framer-motion';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function SanitizeBullets() {
  const [inputText, setInputText] = useState('');
  const [outputHtml, setOutputHtml] = useState('');
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');

  const [toastMessage, setToastMessage] = useState<{title: string, type: 'success'|'info'|'error'} | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = (title: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToastMessage({ title, type });
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  const cleanBullets = () => {
    // If there are semicolons or bullets and few/no newlines, split by separator
    let rawItems: string[] = [];
    const hasSemicolons = inputText.includes(';');
    const hasBullets = (inputText.match(/[•]/g) || []).length > 1;
    const hasNewlines = inputText.includes('\n');
    const isSingleLine = !hasNewlines || inputText.split('\n').filter(l => l.trim()).length <= 1;

    if (hasSemicolons && isSingleLine) {
      rawItems = inputText.split(';');
    } else if (hasBullets && isSingleLine) {
      rawItems = inputText.split(/[•]/);
    } else {
      rawItems = inputText.split('\n');
    }

    let cleanHTML = '<div class="prose-premium"><ul>';
    let itemCount = 0;

    rawItems.forEach(item => {
      // Strip leading bullets (•, -, etc.) and all following whitespace
      let cleanedLine = item.replace(/^[•\-\s\t*]+/, '').trim();

      if (cleanedLine) {
        // Capitalize the first letter
        cleanedLine = cleanedLine.charAt(0).toUpperCase() + cleanedLine.slice(1);

        // Wrap the label (e.g., "Company Overview:") in <strong> tags
        let formattedLine = cleanedLine.replace(/^(.*?:\s)/, '<strong>$1</strong>');

        // Ensure "Company Overview:" is renamed to "Value Proposition:"
        formattedLine = formattedLine.replace(/<strong>Company Overview:/i, '<strong>Value Proposition:');

        cleanHTML += `<li>${formattedLine}</li>`;
        itemCount++;
      }
    });

    cleanHTML += '</ul></div>';

    if (itemCount === 0) {
      setOutputHtml('');
      showToast('No bullet points were found to sanitize.', 'error');
      return;
    }

    setOutputHtml(cleanHTML);
    showToast('Bullets cleaned successfully!', 'success');
  };

  const copyRichText = async () => {
    if (!outputHtml) return;

    try {
      const plainText = outputHtml.replace(/<[^>]+>/g, '');

      const blobHtml = new Blob([outputHtml], { type: 'text/html' });
      const blobText = new Blob([plainText], { type: 'text/plain' });

      const clipboardItem = new ClipboardItem({
        'text/html': blobHtml,
        'text/plain': blobText
      });

      await navigator.clipboard.write([clipboardItem]);
      setCopyStatus('copied');
      showToast('Copied to clipboard!', 'success');
      setTimeout(() => setCopyStatus('idle'), 2000);
    } catch (err) {
      console.error('Failed to copy: ', err);
      try {
          await navigator.clipboard.writeText(outputHtml);
          setCopyStatus('copied');
          showToast('Copied to clipboard!', 'success');
          setTimeout(() => setCopyStatus('idle'), 2000);
      } catch (e) {
          showToast('Failed to copy to clipboard', 'error');
      }
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 space-y-12">
      {/* Header */}
      <div className="text-center space-y-4">
        <h1 className="text-5xl font-black tracking-tighter text-slate-900 leading-tight">
          Sanitize <span className="text-indigo-600">Bullets</span>
        </h1>
        <p className="text-slate-500 font-medium max-w-lg mx-auto leading-relaxed">
          Clean up messy bullet points - strips stray markers, capitalizes each line, and bolds any "Label:" prefix.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
        {/* Input Panel */}
        <section className="bg-white rounded-[2.5rem] shadow-premium border border-slate-200 p-8 space-y-8 transition-all duration-500 hover:border-indigo-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 shadow-inner">
                <Info className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-800 tracking-tight">Source Data</h2>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-0.5">Input Material</p>
              </div>
            </div>
            <button
              onClick={() => setInputText('')}
              className="p-3 text-slate-300 hover:text-rose-500 transition-all rounded-xl hover:bg-rose-50 active:scale-95"
              title="Clear Input"
            >
              <Trash2 className="w-6 h-6" />
            </button>
          </div>

          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-blue-500 rounded-3xl blur opacity-0 group-focus-within:opacity-10 transition duration-500"></div>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Paste messy bullet points or lines of text here..."
              className="relative w-full h-[420px] p-8 rounded-[2rem] bg-slate-50 border-2 border-transparent focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5 outline-none transition-all resize-none font-medium text-slate-600 leading-relaxed placeholder:text-slate-300"
            />
          </div>

          <button
            onClick={cleanBullets}
            disabled={!inputText}
            className="w-full flex items-center justify-center gap-3 bg-slate-900 hover:bg-black disabled:opacity-50 disabled:active:scale-100 text-white py-4 px-6 rounded-2xl font-bold transition-all shadow-xl shadow-slate-200 premium-button"
          >
            <List className="w-5 h-5" />
            <span className="text-sm tracking-tight">Sanitize Bullets</span>
          </button>
        </section>

        {/* Output Panel */}
        <section className="space-y-8">
          <div className="bg-white rounded-[2.5rem] shadow-premium border border-slate-200 p-8 min-h-[560px] flex flex-col relative overflow-hidden">
            <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/5 rounded-full blur-[120px] -mr-48 -mt-48 pointer-events-none"></div>
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-[100px] -ml-32 -mb-32 pointer-events-none"></div>

            <div className="flex items-center justify-between mb-8 relative z-10">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 border border-indigo-100 shadow-inner">
                  <Wand2 className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-800 tracking-tight">Refined Results</h2>
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Live Engine</p>
                  </div>
                </div>
              </div>

              {outputHtml && (
                <button
                  onClick={copyRichText}
                  className={cn(
                    "flex items-center gap-2.5 py-3 px-6 rounded-xl font-bold transition-all premium-button",
                    copyStatus === 'copied'
                      ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"
                      : "bg-slate-900 text-white hover:bg-black shadow-xl"
                  )}
                >
                  {copyStatus === 'copied' ? (
                    <>
                      <CheckCircle className="w-5 h-5" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Clipboard className="w-5 h-5" />
                      Copy Result
                    </>
                  )}
                </button>
              )}
            </div>

            <div className="flex-1 overflow-auto rounded-[2rem] bg-slate-50 border border-slate-100 p-8 relative z-10 custom-scrollbar">
              {outputHtml ? (
                <div
                  dangerouslySetInnerHTML={{ __html: outputHtml }}
                  className="prose-premium text-slate-600 leading-relaxed"
                />
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-6 text-center px-8">
                  <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center border border-slate-100 shadow-sm animate-float">
                    <List className="w-12 h-12 opacity-20" />
                  </div>
                  <div>
                    <h4 className="text-slate-400 font-bold mb-2">Awaiting Intelligence</h4>
                    <p className="text-sm font-medium opacity-60">Your sanitized bullets will appear here in a clean, professional format.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

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
              {toastMessage.type === 'success' ? <CheckCircle className="w-5 h-5 text-white" /> :
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
