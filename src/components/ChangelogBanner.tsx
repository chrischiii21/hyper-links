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

export default function ChangelogBanner() {
  const [commits, setCommits] = useState<Commit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function fetchCommits() {
      try {
        const response = await fetch('https://api.github.com/repos/chrischiii21/hyper-links/commits?per_page=1');
        if (!response.ok) throw new Error('Failed to fetch');
        const data = await response.json();
        setCommits(data);
      } catch (err) {
        console.error('Error fetching commits:', err);
        setError(true);
      } finally {
        setLoading(false);
      }
    }

    fetchCommits();
  }, []);

  return (
    <motion.div 
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="sticky top-0 z-[60] bg-slate-900 border-b border-white/5 px-4 py-2 shadow-2xl"
    >
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-4 text-white">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2 px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded-md shrink-0 border border-blue-500/30">
            <Sparkles className="w-3.5 h-3.5 animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-widest">New Update</span>
          </div>
          
          <AnimatePresence mode="wait">
            {loading ? (
              <div className="text-[11px] font-medium text-slate-400 flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Processing Laboratory Updates...</span>
              </div>
            ) : commits.length > 0 && (
              <a 
                href={commits[0].html_url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-2 min-w-0"
              >
                <span className="text-[11px] font-semibold text-slate-200 group-hover:text-blue-400 transition-colors truncate">
                  {professionalizeMessage(commits[0].commit.message)}
                </span>
                <ExternalLink className="w-3 h-3 text-slate-500 group-hover:text-blue-400 transition-opacity shrink-0" />
              </a>
            )}
          </AnimatePresence>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          {!loading && commits.length > 0 && (
            <div className="hidden sm:flex items-center gap-2 border-r border-white/10 pr-4">
              <div className="relative">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-ping absolute" />
                <div className="w-2 h-2 bg-green-500 rounded-full relative" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Mainframe Live
              </span>
            </div>
          )}
          <a 
            href="https://github.com/chrischiii21/hyper-links" 
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-bold text-slate-500 hover:text-white transition-colors uppercase tracking-widest"
          >
            Repo
          </a>
        </div>
      </div>
    </motion.div>
  );
}
