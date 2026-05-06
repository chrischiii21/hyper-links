import React, { useState, useRef } from 'react';
import { 
  Clipboard, 
  Link, 
  List, 
  Trash2, 
  CheckCircle, 
  Loader2, 
  ExternalLink,
  Info
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { motion, AnimatePresence } from 'framer-motion';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface LinkData {
  publisher: string;
  year: string;
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

  const extractLinks = (text: string) => {
    const results: LinkData[] = [];
    const regex = /(.*?)\s*\((.*?)(https?:\/\/[^\)]+)\)/g;
    
    let match;
    let foundAny = false;
    
    while ((match = regex.exec(text)) !== null) {
      foundAny = true;
      // Clean up the preceding text (remove leading semicolons, newlines, or standalone "Sources" headers)
      let precedingText = match[1].replace(/^[;\s\n]+/, '').trim();
      precedingText = precedingText.replace(/^Sources?[\s\n]*/i, '').trim();
      
      const insideParens = match[2].trim();
      const url = match[3].trim();
      
      let publisher = '';
      if (insideParens) {
        // If there's content before the URL in the parens, use the first comma-separated chunk
        publisher = insideParens.split(',')[0].replace(/Source:\s*/i, '').trim();
      } else {
        // Otherwise, use the text immediately preceding the parentheses
        publisher = precedingText;
      }
      
      results.push({ publisher: publisher || 'Source', url, year: '' });
    }
    
    // Fallback: If no formatted links were found, try to grab any raw URLs
    if (!foundAny) {
      const rawUrls = [...text.matchAll(/(https?:\/\/[^\s\)]+)/g)];
      rawUrls.forEach(urlMatch => {
        results.push({ publisher: 'Source', url: urlMatch[1], year: '' });
      });
    }
    
    return results;
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
      let html = `<div class="prose prose-sm max-w-none"><h2>${heading}</h2><ul>`;
      
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

    let cleanHTML = '<div class="prose"><ul>';
    
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
    <div className="max-w-6xl mx-auto p-4 sm:p-8 space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900">Rich Text Copier</h1>
        <p className="text-gray-500 max-w-lg mx-auto">
          Extract links or sanitize bullet points into formatted rich text ready for Slack, Notion, or Wikis.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        {/* Input Panel */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Info className="w-5 h-5 text-blue-500" />
              Input Text
            </h2>
            <button 
              onClick={() => setInputText('')}
              className="text-gray-400 hover:text-red-500 transition-colors"
              title="Clear Input"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
          
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Paste your source text or messy bullet points here..."
            className="w-full h-80 p-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all resize-none font-mono text-sm leading-relaxed"
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <button
              onClick={processLinks}
              disabled={!inputText || isLoading}
              className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 px-4 rounded-xl font-medium transition-all shadow-lg shadow-blue-200 text-sm"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link className="w-4 h-4" />}
              Process Links
            </button>
            <button
              onClick={cleanBullets}
              disabled={!inputText || isLoading}
              className="flex items-center justify-center gap-2 bg-gray-900 hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 px-4 rounded-xl font-medium transition-all shadow-lg shadow-gray-200 text-sm"
            >
              <List className="w-4 h-4" />
              Clean Bullets
            </button>
            <button
              onClick={formatReport}
              disabled={!inputText || isLoading}
              className="relative flex items-center justify-center gap-2 bg-gray-200 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed text-gray-500 py-3 px-4 rounded-xl font-medium transition-all text-sm group"
            >
              <Clipboard className="w-4 h-4" />
              Format Report
              <span className="absolute -top-10 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                Under Development
              </span>
            </button>
          </div>

          <AnimatePresence>
            {showDevNotice && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="bg-purple-50 border border-purple-200 text-purple-700 px-4 py-3 rounded-xl text-sm flex items-center gap-2"
              >
                <Info className="w-4 h-4" />
                This feature is currently under development for better performance.
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* Output Panel */}
        <section className="space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 min-h-[440px] flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold">Live Preview</h2>
              {outputHtml && (
                <button
                  onClick={copyRichText}
                  className={cn(
                    "flex items-center gap-2 py-2 px-4 rounded-lg font-medium transition-all",
                    copyStatus === 'copied' 
                      ? "bg-green-100 text-green-700" 
                      : "bg-blue-50 text-blue-600 hover:bg-blue-100"
                  )}
                >
                  {copyStatus === 'copied' ? (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Clipboard className="w-4 h-4" />
                      Copy Rich Text
                    </>
                  )}
                </button>
              )}
            </div>

            <div className="flex-1 overflow-auto rounded-lg bg-gray-50 border border-gray-100 p-6">
              {outputHtml ? (
                <div 
                  dangerouslySetInnerHTML={{ __html: outputHtml }} 
                  className="prose prose-sm prose-blue max-w-none"
                />
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-2">
                  <ExternalLink className="w-12 h-12 opacity-20" />
                  <p>Processed content will appear here</p>
                </div>
              )}
            </div>
          </div>

          {/* Links Status (Optional debug/list) */}
          <AnimatePresence>
            {links.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="bg-blue-50 border border-blue-100 rounded-xl p-4"
              >
                <h3 className="text-sm font-semibold text-blue-800 mb-3">Detected Sources ({links.length})</h3>
                <div className="space-y-2">
                  {links.map((link, i) => (
                    <div key={i} className="flex items-center justify-between text-xs text-blue-700 bg-white/50 p-2 rounded-lg">
                      <span className="font-medium truncate max-w-[200px]">
                        {link.publisher} ({link.year})
                      </span>
                      {link.loading ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <span className="truncate max-w-[150px] opacity-60 italic">
                          {link.h1 || link.title || 'No Title'}
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
              {toastMessage.type === 'success' ? <CheckCircle className="w-4 h-4 text-white" /> : 
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
