import React, { useState } from 'react';
import { api } from '../api';
import type { EdgeType, MemoryNode } from '../types';
import { nodeHeading } from './SystemMap';

const RELS: EdgeType[] = ['calls', 'references', 'specifies', 'owns', 'implements'];

export function LinkModal({ nodes, onClose, onCreated }: { nodes: MemoryNode[]; onClose: () => void; onCreated: () => void }) {
  const [source, setSource] = useState(nodes[0]?.id ?? '');
  const [target, setTarget] = useState(nodes[1]?.id ?? '');
  const [rel, setRel] = useState<EdgeType>('references');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await api.createEdge(source, target, rel, notes || undefined);
    setBusy(false);
    onCreated();
    onClose();
  };
  const sel = 'w-full rounded-md border border-line bg-panel px-2.5 py-1.5';

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="flex w-[440px] max-w-full flex-col gap-3 rounded-lg border border-ink bg-panel p-5">
        <h2 className="font-display text-[19px] font-semibold">Link two nodes</h2>
        <p className="text-[13px] text-muted">Add a connection the scanner missed. It takes effect for everyone and for AI assistants right away.</p>
        <label className="flex flex-col gap-1 text-[13px]" htmlFor="link-src">From
          <select id="link-src" className={sel} value={source} onChange={(e) => setSource(e.target.value)}>
            {nodes.map((n) => <option key={n.id} value={n.id}>{nodeHeading(n)}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[13px]" htmlFor="link-rel">Relationship
          <select id="link-rel" className={sel} value={rel} onChange={(e) => setRel(e.target.value as EdgeType)}>
            {RELS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[13px]" htmlFor="link-dst">To
          <select id="link-dst" className={sel} value={target} onChange={(e) => setTarget(e.target.value)}>
            {nodes.map((n) => <option key={n.id} value={n.id}>{nodeHeading(n)}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[13px]" htmlFor="link-notes">Note (optional)
          <input id="link-notes" className={sel} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy || source === target}>Add link</button>
        </div>
      </form>
    </div>
  );
}
