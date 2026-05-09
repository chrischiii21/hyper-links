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
    <div className="relative z-10 bg-slate-900 border-b border-white/5 px-4 py-2 shadow-2xl">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-4 text-white">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2 px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded-md shrink-0 border border-blue-500/30">
            <Sparkles className="w-3.5 h-3.5" />
            <span className="text-[10px] font-black uppercase tracking-widest">New Update</span>
          </div>
          
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[11px] font-semibold text-slate-200 truncate">
              {professionalizeMessage(message)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <div className="hidden sm:flex items-center gap-2 border-r border-white/10 pr-4">
            <div className="relative">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-ping absolute" />
              <div className="w-2 h-2 bg-green-500 rounded-full relative" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Mainframe Live
            </span>
          </div>
          <div className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">
            Laboratory
          </div>
        </div>
      </div>
    </div>
  );
}
