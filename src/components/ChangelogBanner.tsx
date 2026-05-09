import React, { useState, useEffect } from 'react';
import { Sparkles, GitCommit, ExternalLink, Loader2, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Commit {
  sha: string;
  commit: {
    message: string;
    author: {
      date: string;
      name: string;
    };
  };
  html_url: string;
}

const professionalizeMessage = (msg: string) => {
  let clean = msg.split('\n')[0].trim();
  
  // Remove common prefixes
  clean = clean.replace(/^(fix|feat|chore|docs|style|refactor|perf|test|build|ci)(\(.*\))?:\s*/i, '');
  
  // Common professional replacements
  const mappings: [RegExp, string][] = [
    [/^fix\s+/i, 'Improved '],
    [/^add\s+/i, 'Introduced '],
    [/^update\s+/i, 'Enhanced '],
    [/^implement\s+/i, 'Launched '],
    [/^remove\s+/i, 'Optimized '],
    [/^refactor\s+/i, 'Refined '],
    [/^adjust\s+/i, 'Polished '],
    [/pdf/i, 'PDF Document Parsing'],
    [/link/i, 'Hyperlink Detection'],
    [/source/i, 'Citation Processing'],
    [/readme/i, 'Project Documentation'],
    [/ui|style/i, 'Interface Aesthetics'],
    [/paste/i, 'Clipboard Integration'],
  ];

  for (const [regex, replacement] of mappings) {
    if (regex.test(clean)) {
      clean = clean.replace(regex, replacement);
    }
  }

  // Ensure first letter is capitalized
  clean = clean.charAt(0).toUpperCase() + clean.slice(1);
  
  // Add a professional suffix if it's too short
  if (clean.length < 15 && !clean.includes(' ')) {
    clean = `System Update: ${clean}`;
  }

  return clean;
};

export default function ChangelogBanner({ message }: { message: string }) {
  return (
    <div className="sticky top-0 z-[100] w-full">
      <div className="bg-slate-900/95 backdrop-blur-md border-b border-white/5 px-4 py-2 shadow-2xl">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-6">
          <div className="flex items-center gap-4 min-w-0">
            <div className="flex items-center gap-2.5 px-2.5 py-1 bg-indigo-500/10 text-indigo-400 rounded-full shrink-0 border border-indigo-500/20 shadow-inner">
              <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(129,140,248,0.8)]" />
              <span className="text-[10px] font-black uppercase tracking-[0.15em]">Lab Log</span>
            </div>
            
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[11px] font-medium text-slate-300 truncate tracking-tight">
                {professionalizeMessage(message)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-5 shrink-0">
            <div className="hidden sm:flex items-center gap-2.5">
              <div className="flex -space-x-1">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="w-4 h-4 rounded-full border border-slate-900 bg-slate-800 flex items-center justify-center overflow-hidden">
                    <div className={`w-full h-full bg-gradient-to-br ${i === 1 ? 'from-blue-500 to-indigo-600' : i === 2 ? 'from-slate-600 to-slate-800' : 'from-slate-700 to-slate-900'}`} />
                  </div>
                ))}
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Core Active
              </span>
            </div>
            <div className="h-4 w-px bg-white/10 hidden sm:block" />
            <div className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">
              V2.4.5
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
