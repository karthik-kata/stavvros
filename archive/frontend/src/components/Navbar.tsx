import React, { useState, useEffect } from 'react';
import { RefreshCw, GitBranch, Database, Layers, Sparkles } from 'lucide-react';
import { fetchWorkspaceInfo } from '../api';
import { WorkspaceInfo } from '../types';

interface NavbarProps {
  onRebuild: () => void;
  isRebuilding: boolean;
  onOpenAddEdge: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onRebuild, isRebuilding, onOpenAddEdge }) => {
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);

  useEffect(() => {
    fetchWorkspaceInfo()
      .then((info) => setWorkspace(info))
      .catch((err) => console.error('Failed to load workspace info', err));
  }, []);

  return (
    <header className="bg-slate-900/85 backdrop-blur-md border-b border-slate-800/80 px-6 py-3.5 flex items-center justify-between sticky top-0 z-30 shadow-lg shadow-black/20">
      {/* Left: Brand & Inferred Status */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-sky-500 flex items-center justify-center shadow-md shadow-purple-500/30 ring-1 ring-white/10">
          <Layers className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-lg tracking-tight text-white bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-100 to-slate-400">
              STAVVROS
            </span>
            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 font-bold border border-purple-500/30 shadow-inner">
              Shared Memory
            </span>
            <span className="hidden lg:flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-sky-950/70 text-sky-300 text-[10px] font-semibold border border-sky-500/30">
              <Sparkles className="w-3 h-3 text-sky-400" />
              100% Inferred from Code & Docs (Zero Hardcoding)
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Autonomous Knowledge Graph & AST-Driven Architecture Engine
          </p>
        </div>
      </div>

      {/* Right: Actions & Workspace Metadata */}
      <div className="flex items-center gap-3">
        {/* Workspace selector - Dynamically Inferred */}
        <div className="flex items-center gap-2 bg-slate-950/80 border border-slate-800 px-3 py-1.5 rounded-lg text-xs shadow-inner">
          <GitBranch className="w-3.5 h-3.5 text-purple-400" />
          <span className="text-slate-400">Workspace:</span>
          <span className="font-mono font-semibold text-slate-200">
            {workspace?.workspace_name || 'Loading...'}
          </span>
        </div>

        {/* Live Ingestion Status */}
        <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 rounded-lg text-xs text-emerald-400 font-medium shadow-sm">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse ring-4 ring-emerald-400/20" />
          <span>AST Scanner Active</span>
        </div>

        {/* Add Connection Modal button */}
        <button
          onClick={onOpenAddEdge}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 hover:border-slate-600 transition shadow-sm active:scale-95"
        >
          <Database className="w-3.5 h-3.5 text-purple-400" />
          <span>+ Connect Entities</span>
        </button>

        {/* Rebuild Graph button */}
        <button
          onClick={onRebuild}
          disabled={isRebuilding}
          className="flex items-center gap-2 px-3.5 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-md shadow-purple-600/30 transition active:scale-95 ring-1 ring-white/10"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRebuilding ? 'animate-spin' : ''}`} />
          <span>{isRebuilding ? 'Scanning Files...' : 'Re-scan Workspace'}</span>
        </button>
      </div>
    </header>
  );
};
