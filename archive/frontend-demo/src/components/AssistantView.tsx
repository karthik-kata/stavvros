import React, { useState } from 'react';
import { Send, Bot, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { api } from '../api';
import type { AssistantContext } from '../types';
import { Spinner } from './ui';

interface Turn {
  q: string;
  ctx?: AssistantContext;
}

export function AssistantView({ onOpenDrift }: { onOpenDrift: (id: string) => void }) {
  const [input, setInput] = useState('Add a refund button to the order history page.');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const last = turns[turns.length - 1]?.ctx;

  const ask = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = input.trim();
    if (!q || busy) return;
    setBusy(true);
    setTurns((t) => [...t, { q }]);
    const ctx = await api.queryContext(q);
    setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, ctx } : x)));
    setBusy(false);
  };

  return (
    <div className="grid h-full min-h-0 gap-0 lg:grid-cols-[minmax(0,1fr)_420px]">
      {/* The developer's assistant */}
      <section className="flex min-h-0 flex-col border-r border-line bg-panel">
        <div className="flex items-center gap-2 border-b border-line bg-sunken px-4 py-2 font-mono text-[12px] text-muted">
          <span className="flex gap-1"><i className="h-2 w-2 rounded-full bg-line" /><i className="h-2 w-2 rounded-full bg-line" /><i className="h-2 w-2 rounded-full bg-line" /></span>
          AI assistant · checkout-service
          <span className="ml-auto">signed in as Maya (sample)</span>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="mx-auto flex max-w-[720px] flex-col gap-4">
            {turns.length === 0 && (
              <div className="rounded-lg border border-dashed border-line p-5 text-muted">
                This is what a developer sees in their AI assistant. Before writing code, the assistant asks Stavvros about the services involved.
                Send the prompt below to see a drift warning arrive with the answer.
              </div>
            )}
            {turns.map((t, i) => (
              <React.Fragment key={i}>
                <div className="max-w-[85%] self-end rounded-[12px_12px_2px_12px] bg-accent-soft px-3.5 py-2">{t.q}</div>
                {!t.ctx ? (
                  <Spinner label="Asking Stavvros how this works across services…" />
                ) : (
                  <div className="flex flex-col gap-3">
                    <p className="flex items-center gap-1.5 text-muted"><Bot size={15} /> Checked Stavvros before writing code.</p>
                    {t.ctx.drift_warnings.map((w) => (
                      <div key={w.drift_id} className="flex flex-col gap-1.5 rounded-lg border border-drift bg-drift-soft p-3.5">
                        <div className="flex items-center gap-1.5 font-semibold"><AlertTriangle size={15} className="text-drift" /> {w.headline}</div>
                        <div><span className="text-muted">Doc says:</span> <code className="font-mono text-[12.5px]">{w.doc_says}</code></div>
                        <div><span className="text-muted">Code does:</span> <code className="font-mono text-[12.5px]">{w.code_does}</code></div>
                        <div>{w.guidance} I'll build against the code version.</div>
                        <div className="mt-1 flex gap-2">
                          <button className="btn" onClick={() => onOpenDrift(w.drift_id)}>Open drift details</button>
                        </div>
                      </div>
                    ))}
                    {t.ctx.drift_warnings.length === 0 && (
                      <div className="flex items-center gap-1.5 rounded-lg border border-ok bg-ok-soft p-3 text-[13px]">
                        <CheckCircle2 size={15} className="text-ok" /> No drift on the services involved. Docs and code agree.
                      </div>
                    )}
                    <ul className="list-disc space-y-1 pl-5">
                      {t.ctx.answer.map((a) => <li key={a}>{a}</li>)}
                    </ul>
                    <p className="text-[12.5px] text-muted">Plan: add the button in checkout, call POST /api/checkout/request-refund, and show “refund requested” until the payment event confirms it.</p>
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
        <form onSubmit={ask} className="flex gap-2 border-t border-line p-3">
          <label htmlFor="prompt" className="sr-only">Prompt</label>
          <input id="prompt" value={input} onChange={(e) => setInput(e.target.value)} className="flex-1 rounded-md border border-line px-3 py-2 outline-none focus:border-accent" />
          <button className="btn btn-primary" disabled={busy || !input.trim()} type="submit"><Send size={14} /> Send</button>
        </form>
      </section>

      {/* What crossed the wire */}
      <aside className="flex min-h-0 flex-col bg-canvas">
        <div className="border-b border-line px-4 py-3">
          <div className="eyebrow">Behind the scenes</div>
          <h2 className="font-semibold">What Stavvros returned to the assistant</h2>
          <p className="text-[12.5px] text-muted">The payload the planned MCP query tool would return. Mock backend builds it from the real graph.</p>
        </div>
        <pre className="m-4 flex-1 overflow-auto rounded-md border border-line bg-panel p-3 font-mono text-[11px] leading-5">
          {last ? JSON.stringify(last, null, 2) : '// Send a prompt to see the payload'}
        </pre>
      </aside>
    </div>
  );
}
