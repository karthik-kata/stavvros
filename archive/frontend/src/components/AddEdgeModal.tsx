import React, { useState } from 'react';
import { X, Database, ArrowRight } from 'lucide-react';
import { MemoryNode, EdgeType } from '../types';
import { createEdge } from '../api';

interface AddEdgeModalProps {
  isOpen: boolean;
  onClose: () => void;
  nodes: MemoryNode[];
  onEdgeCreated: () => void;
}

export const AddEdgeModal: React.FC<AddEdgeModalProps> = ({
  isOpen,
  onClose,
  nodes,
  onEdgeCreated,
}) => {
  const [source, setSource] = useState('');
  const [target, setTarget] = useState('');
  const [relationship, setRelationship] = useState<EdgeType>('specifies');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!source || !target) {
      alert('Please select both a source and a target entity');
      return;
    }
    if (source === target) {
      alert('Source and target cannot be the same entity');
      return;
    }
    setLoading(true);
    try {
      await createEdge(source, target, relationship, notes);
      onEdgeCreated();
      onClose();
    } catch (err: any) {
      alert(err.message || 'Failed to create edge');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">Connect Knowledge Graph Entities</h3>
              <p className="text-[11px] text-slate-400">Directly link code elements, PRDs, or teams</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {/* Source Entity */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Source Entity (From)</label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-purple-500"
              required
            >
              <option value="">Select source node...</option>
              {nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  [{n.type.toUpperCase()}] {n.label}
                </option>
              ))}
            </select>
          </div>

          {/* Relationship */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Relationship Type</label>
            <select
              value={relationship}
              onChange={(e) => setRelationship(e.target.value as EdgeType)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-purple-500 font-mono"
            >
              <option value="specifies">SPECIFIES (Doc defines API requirements)</option>
              <option value="implements">IMPLEMENTS (Service/Code implements API)</option>
              <option value="calls">CALLS (Cross-service dependency)</option>
              <option value="owns">OWNS (Team owns Service/Doc)</option>
              <option value="references">REFERENCES (General reference)</option>
            </select>
          </div>

          {/* Target Entity */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Target Entity (To)</label>
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-purple-500"
              required
            >
              <option value="">Select target node...</option>
              {nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  [{n.type.toUpperCase()}] {n.label}
                </option>
              ))}
            </select>
          </div>

          {/* Optional Notes */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Notes / Reason (Optional)</label>
            <input
              type="text"
              placeholder="e.g. Verified contract during architectural sync"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500"
            />
          </div>

          {/* Footer Buttons */}
          <div className="pt-2 flex justify-end gap-2 border-t border-slate-800/80">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-lg shadow-md shadow-purple-600/20 transition flex items-center gap-1.5"
            >
              <span>{loading ? 'Creating...' : 'Create Connection'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
