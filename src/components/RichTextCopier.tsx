import React, { useState, useRef } from 'react';
import { 
  Clipboard, 
  Link, 
  List, 
  Trash2, 
  CheckCircle, 
  Check,
  Loader2, 
  ExternalLink,
  Info,
  Wand2,
  Share2,
  LayoutGrid
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

export default function RichTextCopier() {
  const [inputText, setInputText] = useState('');
  const [outputHtml, setOutputHtml] = useState('');
  const [links, setLinks] = useState<LinkData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');
  const [showDevNotice, setShowDevNotice] = useState(false);

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

  // Local extractLinks logic has been moved to src/lib/linkUtils.ts

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
        const yearPart = link.year ? `, ${link.year}` : '';
        html += `<li><a href="${link.url}">${linkText}${yearPart}</a></li>`;
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

  const cleanBullets = () => {
    // If there are semicolons or bullets and few/no newlines, split by separator
    let rawItems: string[] = [];
    const hasSemicolons = inputText.includes(';');
    const hasBullets = (inputText.match(/[•\u2022]/g) || []).length > 1;
    const hasNewlines = inputText.includes('\n');
    const isSingleLine = !hasNewlines || inputText.split('\n').filter(l => l.trim()).length <= 1;
    
    if (hasSemicolons && isSingleLine) {
      rawItems = inputText.split(';');
    } else if (hasBullets && isSingleLine) {
      rawItems = inputText.split(/[•\u2022]/);
    } else {
      rawItems = inputText.split('\n');
    }

    let cleanHTML = '<div class="prose-premium"><ul>';
    
    rawItems.forEach(item => {
      // Strip leading bullets (•, -, etc.) and all following whitespace
      let cleanedLine = item.replace(/^[•\-\u2022\s\t*]+/, '').trim();
      
      if (cleanedLine) {
        // Capitalize the first letter
        cleanedLine = cleanedLine.charAt(0).toUpperCase() + cleanedLine.slice(1);
        
        // Wrap the label (e.g., "Company Overview:") in <strong> tags
        let formattedLine = cleanedLine.replace(/^(.*?:\s)/, '<strong>$1</strong>');
        
        // Ensure "Company Overview:" is renamed to "Value Proposition:"
        formattedLine = formattedLine.replace(/<strong>Company Overview:/i, '<strong>Value Proposition:');
        
        cleanHTML += `<li>${formattedLine}</li>`;
      }
    });
    
    cleanHTML += '</ul></div>';
    setOutputHtml(cleanHTML);
    setLinks([]); // Clear links when cleaning bullets
    showToast('Bullets cleaned successfully!', 'success');
  };

  const formatReport = () => {
    setShowDevNotice(true);
    showToast('This feature is currently under development', 'info');
    setTimeout(() => setShowDevNotice(false), 3000);
    return; // Locked for now
    const sections = inputText.split(/\n(?=[IVX]+\. |Sources:)/);
    let fullHtml = '<div class="space-y-12">';

    const groupConfigs = [
      { 
        id: 'executive', 
        label: 'EXECUTIVE SUMMARY & DEDALE TAKE',
        patterns: ['Executive Summary'] 
      },
      { 
        id: 'value', 
        label: 'VALUE PROPOSITION',
        patterns: ['Value Proposition', 'Product Overview', 'Business Model', 'Pricing Structure', 'Prices', 'Contract Length', 'Additional Important Note', 'Sources']
      },
      { 
        id: 'ownership', 
        label: 'OWNERSHIP & KEY MILESTONES',
        patterns: ['Founding Details', 'Company Evolution', 'Strategic Milestones', 'Sources']
      },
      { 
        id: 'customer_profiles', 
        label: 'CUSTOMER PROFILES',
        patterns: ['Customer Geography', 'Customer Size', 'Customer Industry', 'Buying Personas', 'Adoption Trigger', 'Key Purchasing Criteria', 'Sources']
      },
      { 
        id: 'customer_feedback', 
        label: 'CUSTOMER FEEDBACK',
        patterns: ['Customer Level of Satisfaction', 'Customer ROI', 'Offering Strengths', 'Points of Improvement', 'Level of Criticality', 'Level of Stickiness', 'Sources']
      },
      { 
        id: 'competition', 
        label: 'COMPETITIVE LANDSCAPE',
        patterns: ['Competitive Landscape', 'Sources']
      },
      { 
        id: 'leadership', 
        label: 'LEADERSHIP',
        patterns: ['Leadership Summary', 'Leadership Team', 'Team Stability', 'Sources']
      },
      { 
        id: 'sales_gtm', 
        label: 'SALES & GO-TO-MARKET',
        patterns: ['Sales Channels', 'Sales Organization', 'Go-To-Market Strategy', 'Sources']
      },
      { 
        id: 'rd_tech', 
        label: 'R&D & TECH',
        patterns: ['Product Capability', 'R&D Capability', 'R&D Team', 'AI Development', 'Sources']
      },
      { 
        id: 'market', 
        label: 'MARKET CONTEXT',
        patterns: ['Market Definition', 'Market Characteristics', 'Market Trends', 'Sources']
      }
    ];

    const processedGroups: { label: string; html: string }[] = [];

    // Helper to extract content under specific headers
    const getSubSection = (text: string, subHeader: string) => {
      const lines = text.split('\n');
      let result = '';
      let capturing = false;
      
      for (const line of lines) {
        if (line.includes(subHeader)) {
          capturing = true;
          continue;
        }
        // If we hit another known subheader, stop (simplistic check)
        if (capturing && /^[A-Z][a-z]+ [A-Z]/.test(line) && line.endsWith(':')) break; 
        
        if (capturing) result += line + '\n';
      }
      return result.trim();
    };

    groupConfigs.forEach(group => {
      let groupHtml = `<div class="report-group border-l-4 border-blue-500 pl-6 py-2">`;
      groupHtml += `<h2 class="text-blue-600 font-bold mb-4 tracking-wide text-sm">${group.label}</h2>`;
      
      let hasContent = false;
      group.patterns.forEach(pattern => {
        // Find matching section in the raw input
        const match = sections.find(s => s.includes(pattern));
        if (match) {
          hasContent = true;
          const cleanTitle = pattern === 'Sources' ? 'Sources' : pattern;
          groupHtml += `<div class="mb-6"><h2 class="text-lg font-bold mb-2">${cleanTitle}</h2>`;
          
          // Basic bullet points conversion for report content
          const contentLines = match.split('\n').slice(1);
          groupHtml += '<div class="prose prose-sm"><ul>';
          contentLines.forEach(line => {
            const cleanLine = line.replace(/^[•\-\u2022\s\t*]+/, '').trim();
            if (cleanLine) {
              const formattedLine = cleanLine.replace(/^(.*?:\s)/, '<strong>$1</strong>');
              groupHtml += `<li>${formattedLine}</li>`;
            }
          });
          groupHtml += '</ul></div></div>';
        }
      });

      groupHtml += '</div>';
      if (hasContent) processedGroups.push({ label: group.label, html: groupHtml });
    });

    setOutputHtml(processedGroups.map(g => g.html).join('<hr class="my-8 border-gray-100" />'));
    setLinks([]);
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
          Text <span className="text-indigo-600">Copier</span>
        </h1>
        <p className="text-slate-500 font-medium max-w-lg mx-auto leading-relaxed">
          The ultimate utility for professional researchers. Sanitize bullets and extract citations with surgical precision.
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
          
          <div className="flex flex-wrap items-center gap-2.5 bg-slate-50/50 p-4 rounded-2xl border border-slate-100/80">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Preset Use Cases:</span>
            <button
              onClick={() => setInputText(`Use Cases\n• Frotcom — Company website: https://www.frotcom.com/frotcom-international\n• Frotcom — About us: https://www.frotcom.com/about-us\n• Frotcom — Features: https://www.frotcom.com/features\n• Frotcom — Plug & Play vehicle tracking: https://www.frotcom.com/features/plug-play-vehicle-tracking-and-maintenance\n• Microsoft Azure Marketplace — Frotcom listing: https://marketplace.microsoft.com/en-us/product/web-apps/frotcominternationallda.frotcom\n• Capterra — Frotcom product page: https://www.capterra.com/p/149357/Frotcom/`)}
              className="px-4 py-2 bg-white hover:bg-indigo-50 hover:text-indigo-600 text-slate-700 rounded-xl text-xs font-bold transition-all active:scale-95 border border-slate-200 hover:border-indigo-200 shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              <LayoutGrid className="w-3.5 h-3.5 text-indigo-500" />
              Frotcom Fleet Tracking
            </button>
          </div>
          
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-blue-500 rounded-3xl blur opacity-0 group-focus-within:opacity-10 transition duration-500"></div>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Paste your source text or messy bullet points here..."
              className="relative w-full h-[480px] p-8 rounded-[2rem] bg-slate-50 border-2 border-transparent focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5 outline-none transition-all resize-none font-medium text-slate-600 leading-relaxed placeholder:text-slate-300"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              onClick={processLinks}
              disabled={!inputText || isLoading}
              className="flex items-center justify-center gap-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:active:scale-100 text-white py-4 px-6 rounded-2xl font-bold transition-all shadow-xl shadow-indigo-100 premium-button"
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Link className="w-5 h-5" />}
              <span className="text-sm tracking-tight">Extract Links</span>
            </button>
            <button
              onClick={cleanBullets}
              disabled={!inputText || isLoading}
              className="flex items-center justify-center gap-3 bg-slate-900 hover:bg-black disabled:opacity-50 disabled:active:scale-100 text-white py-4 px-6 rounded-2xl font-bold transition-all shadow-xl shadow-slate-200 premium-button"
            >
              <List className="w-5 h-5" />
              <span className="text-sm tracking-tight">Sanitize Bullets</span>
            </button>
          </div>

          <AnimatePresence>
            {showDevNotice && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-indigo-50 border border-indigo-100 text-indigo-700 px-6 py-4 rounded-2xl text-sm font-medium flex items-center gap-3 shadow-sm"
              >
                <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
                This sophisticated module is currently being optimized.
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* Output Panel */}
        <section className="space-y-8">
          <div className="bg-white rounded-[2.5rem] shadow-premium border border-slate-200 p-8 min-h-[640px] flex flex-col relative overflow-hidden">
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
                    <ExternalLink className="w-12 h-12 opacity-20" />
                  </div>
                  <div>
                    <h4 className="text-slate-400 font-bold mb-2">Awaiting Intelligence</h4>
                    <p className="text-sm font-medium opacity-60">Your processed data will appear here in a clean, professional format.</p>
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
