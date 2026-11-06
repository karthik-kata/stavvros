import React from 'react';
import { FileCheck, AlertTriangle, Network, GitMerge, ArrowUpRight } from 'lucide-react';
import { GraphResponse } from '../types';

interface ManagementKPIsProps {
  data: GraphResponse | null;
  onSelectDriftAlert: () => void;
}

export const ManagementKPIs: React.FC<ManagementKPIsProps> = ({ data, onSelectDriftAlert }) => {
  if (!data) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 px-6 py-4 bg-slate-900/40 border-b border-slate-800/80">
      {/* 1. Doc Coverage Score */}
      <div className="bg-gradient-to-br from-slate-900/90 to-slate-900/60 border border-slate-800/80 hover:border-emerald-500/30 rounded-xl p-4 flex items-center justify-between shadow-sm transition hover:shadow-emerald-500/5">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mb-1">
            <FileCheck className="w-4 h-4 text-emerald-400" />
            <span>Doc Coverage Score</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white tracking-tight">
              {data.doc_coverage_pct}%
            </span>
            <span className="text-xs text-emerald-400 flex items-center font-semibold">
              <ArrowUpRight className="w-3 h-3" /> Inferred
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Code APIs backed by .md specs</p>
        </div>
        <div className="w-12 h-12 rounded-full border-4 border-emerald-500/20 border-t-emerald-500 flex items-center justify-center shadow-inner">
          <span className="text-[11px] font-bold text-emerald-400">{Math.round(data.doc_coverage_pct)}%</span>
        </div>
      </div>

      {/* 2. Active Drift Alerts */}
      <div 
        onClick={onSelectDriftAlert}
        className="bg-gradient-to-br from-slate-900/90 to-slate-900/60 border border-slate-800/80 hover:border-red-500/50 cursor-pointer rounded-xl p-4 flex items-center justify-between shadow-sm transition group hover:shadow-red-500/10"
      >
        <div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mb-1">
            <AlertTriangle className="w-4 h-4 text-red-400 group-hover:scale-110 transition" />
            <span>Active Drift Alerts</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-red-400 tracking-tight">
              {data.active_drift_count}
            </span>
            {data.active_drift_count > 0 ? (
              <span className="text-[10px] uppercase font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20">
                Action Required
              </span>
            ) : (
              <span className="text-[10px] uppercase font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                In Sync
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 mt-1 group-hover:text-slate-300 transition">
            Click to inspect doc vs code diff
          </p>
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
          data.active_drift_count > 0
            ? 'bg-red-500/10 border border-red-500/40 text-red-400 animate-pulse'
            : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
        }`}>
          <AlertTriangle className="w-5 h-5" />
        </div>
      </div>

      {/* 3. Total Memory Entities */}
      <div className="bg-gradient-to-br from-slate-900/90 to-slate-900/60 border border-slate-800/80 hover:border-purple-500/30 rounded-xl p-4 flex items-center justify-between shadow-sm transition hover:shadow-purple-500/5">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mb-1">
            <Network className="w-4 h-4 text-purple-400" />
            <span>Indexed Memory Entities</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white tracking-tight">
              {data.nodes.length} Nodes
            </span>
            <span className="text-xs text-slate-400 font-mono">/ {data.edges.length} Edges</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Teams, Services, APIs & PRDs</p>
        </div>
        <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
          <Network className="w-5 h-5" />
        </div>
      </div>

      {/* 4. Cross-Team Service Coupling */}
      <div className="bg-gradient-to-br from-slate-900/90 to-slate-900/60 border border-slate-800/80 hover:border-blue-500/30 rounded-xl p-4 flex items-center justify-between shadow-sm transition hover:shadow-blue-500/5">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mb-1">
            <GitMerge className="w-4 h-4 text-blue-400" />
            <span>Cross-Team Services</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white tracking-tight">
              {data.cross_team_services_count}
            </span>
            <span className="text-xs text-blue-400 font-medium">Discovered Calls</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Cross-service API callers mapped</p>
        </div>
        <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
          <GitMerge className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
};
