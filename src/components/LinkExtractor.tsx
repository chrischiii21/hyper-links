import React, { useState, useRef } from 'react';
import {
  Clipboard,
  Link,
  CheckCircle,
  Loader2,
  ExternalLink,
  Info
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { motion, AnimatePresence } from 'framer-motion';
import { extractLinks } from '../lib/linkUtils';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface LinkData {
  publisher: string;
  year?: string;
  url: string;
  suffix?: string;
  title?: string;
  h1?: string;
  description?: string;
  loading?: boolean;
}

export default function LinkExtractor() {
  const [inputText, setInputText] = useState('');
  const [outputHtml, setOutputHtml] = useState('');
  const [links, setLinks] = useState<LinkData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
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

  const fetchTitle = async (url: string) => {
    try {
      const res = await fetch(`/api/get-title?url=${encodeURIComponent(url)}`);
      const data = await res.json();
      return {
        title: data.title || '',
        h1: data.h1 || '',
        description: data.description || ''
      };
    } catch (err) {
      return { title: url, h1: '', description: '' };
    }
  };

  const processLinks = async () => {
    try {
      setIsLoading(true);
      setOutputHtml('');
      showToast('Processing links...', 'info');
      const extracted = extractLinks(inputText);

      if (extracted.length === 0) {
        setLinks([]);
        showToast('No links were found in that text.', 'error');
        return;
      }

      // Set initial links with loading state
      setLinks(extracted.map(link => ({ ...link, loading: true })));

      const processedLinks = await Promise.all(
        extracted.map(async (link) => {
          const metadata = await fetchTitle(link.url);
          return { ...link, ...metadata, loading: false };
        })
      );

      setLinks(processedLinks);

      // Generate Rich HTML for links
      const heading = processedLinks.length === 1 ? 'Source' : 'Sources';
      let html = `<div class="prose-premium"><h2>${heading}</h2><ul>`;

      processedLinks.forEach(link => {
        const linkText = link.publisher || 'Source';
        html += `<li><a href="${link.url}">${linkText}</a></li>`;
      });
      html += '</ul></div>';

      setOutputHtml(html);
      showToast('Links processed successfully!', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to process links', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const copyRichText = async () => {
    if (!outputHtml) return;

    try {
      // Create a plain text version for fallback
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
      // Fallback for browsers that don't support ClipboardItem fully
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
          Link <span className="text-indigo-600">Extractor</span>
        </h1>
        <p className="text-slate-500 font-medium max-w-lg mx-auto leading-relaxed">
          Backup tool: paste raw text copied from the platform to catch any links that didn't get auto-hyperlinked, then copy the parsed result back in.
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
          </div>

          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-blue-500 rounded-3xl blur opacity-0 group-focus-within:opacity-10 transition duration-500"></div>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Paste text containing one or more links here..."
              className="relative w-full h-[420px] p-8 rounded-[2rem] bg-slate-50 border-2 border-transparent focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5 outline-none transition-all resize-none font-medium text-slate-600 leading-relaxed placeholder:text-slate-300"
            />
          </div>

          <button
            onClick={processLinks}
            disabled={!inputText || isLoading}
            className="w-full flex items-center justify-center gap-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:active:scale-100 text-white py-4 px-6 rounded-2xl font-bold transition-all shadow-xl shadow-indigo-100 premium-button"
          >
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Link className="w-5 h-5" />}
            <span className="text-sm tracking-tight">Extract Links</span>
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
                  <Link className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-800 tracking-tight">Parsed Links</h2>
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
                    <ExternalLink className="w-12 h-12 opacity-20" />
                  </div>
                  <div>
                    <h4 className="text-slate-400 font-bold mb-2">Awaiting Intelligence</h4>
                    <p className="text-sm font-medium opacity-60">Your parsed links will appear here in a clean, professional format.</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Links Status */}
          <AnimatePresence>
            {links.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="bg-white rounded-[2rem] border border-slate-200 p-8 shadow-premium overflow-hidden relative"
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full blur-3xl -mr-16 -mt-16"></div>
                <div className="relative z-10 flex items-center justify-between mb-6">
                  <h3 className="text-sm font-black text-slate-400 uppercase tracking-[0.2em]">Detected Citations ({links.length})</h3>
                  <div className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-[10px] font-bold rounded uppercase tracking-tighter">Verified</div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 relative z-10">
                  {links.map((link, i) => (
                    <div key={i} className="flex flex-col gap-1 p-4 bg-slate-50 border border-slate-100 rounded-2xl transition-all hover:bg-white hover:border-indigo-100 group">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-black text-indigo-600 uppercase tracking-wider truncate max-w-[140px]">
                          {link.publisher}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400">{link.year}</span>
                      </div>
                      {link.loading ? (
                        <div className="flex items-center gap-2 mt-1">
                          <Loader2 className="w-3 h-3 animate-spin text-slate-300" />
                          <div className="h-2 w-24 bg-slate-200 rounded-full animate-pulse" />
                        </div>
                      ) : (
                        <span className="text-xs font-semibold text-slate-700 truncate group-hover:text-slate-900 transition-colors">
                          {link.h1 || link.title || 'Source Validated'}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
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
