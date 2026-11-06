import { useState } from 'react';
import { AlertTriangle, Bot, CheckCircle2, Send } from 'lucide-react';
import { api } from '../api';
import type { AssistantContext } from '../types';
import { SEV_CHIP, Spinner } from './ui';

/** What a developer's AI assistant receives from Stavvros before it writes code. */
export function Assistant({ onOpenDrift }: { onOpenDrift: (id: string) => void }) {
  const [q, setQ] = useState('Add a refund button to the order history page');
  const [ctx, setCtx] = useState<AssistantContext | null>(null);
  const [asked, setAsked] = useState('');
  const [busy, setBusy] = useState(false);
  const [raw, setRaw] = useState(false);

  const ask = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!q.trim()) return;
    setBusy(true); setAsked(q);
    try { setCtx(await api.context(q)); } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto flex h-full max-w-[820px] flex-col px-8 py-7">
      <div className="mb-4">
        <h1 className="font-display text-[24px] font-semibold">Assistant preview</h1>
        <p className="text-ink-soft">The context an AI coding assistant gets from Stavvros for a task. Warnings come from open drifts.</p>
      </div>
      <form onSubmit={ask} className="flex gap-2">
        <label htmlFor="q" className="sr-only">Task</label>
        <input id="q" value={q} onChange={(e) => setQ(e.target.value)} className="flex-1 rounded-md border border-line bg-panel px-3 py-2 outline-none focus:border-accent" />
        <button className="btn btn-primary" disabled={busy}>{busy ? <Spinner /> : <Send size={14} />}Ask</button>
      </form>

      {ctx && (
        <div className="mt-6 flex flex-col gap-4">
          <div className="max-w-[85%] self-end rounded-[12px_12px_2px_12px] bg-accent-soft px-3.5 py-2">{asked}</div>
          <p className="flex items-center gap-1.5 text-muted"><Bot size={15} />Checked Stavvros: {ctx.services.join(', ') || 'no matching services'}.</p>
          {ctx.drift_warnings.length === 0 ? (
            <div className="flex items-center gap-2 rounded-lg border border-ok bg-ok-soft px-4 py-3"><CheckCircle2 size={16} className="text-ok" />No open drift on these services.</div>
          ) : (
            <ul className="flex flex-col gap-2">
              {ctx.drift_warnings.map((w) => (
                <li key={w.drift_id} className="flex items-start gap-3 rounded-lg border border-drift/50 bg-panel px-4 py-3">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0 text-drift" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><span className={`chip ${SEV_CHIP[w.severity]}`}>{w.severity.toUpperCase()}</span><span className="font-medium">{w.title}</span></div>
                    <div className="text-[13px] text-ink-soft">{w.guidance}</div>
                  </div>
                  <button className="shrink-0 text-[12.5px] text-accent hover:underline" onClick={() => onOpenDrift(w.drift_id)}>Open</button>
                </li>
              ))}
            </ul>
          )}
          <details>
            <summary className="cursor-pointer text-[13px] text-muted">Facts the assistant also gets ({ctx.answer.length})</summary>
            <ul className="mt-2 list-disc space-y-0.5 pl-5 font-mono text-[12px]">{ctx.answer.map((a) => <li key={a}>{a}</li>)}</ul>
          </details>
          <button className="self-start text-[12.5px] text-muted hover:text-ink" onClick={() => setRaw((v) => !v)}>{raw ? 'Hide' : 'Show'} raw payload</button>
          {raw && <pre className="codebox max-h-[320px] overflow-auto text-[11px]">{JSON.stringify(ctx, null, 2)}</pre>}
        </div>
      )}
    </div>
  );
}
