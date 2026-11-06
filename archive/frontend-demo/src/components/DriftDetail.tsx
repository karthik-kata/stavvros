import { useEffect, useState } from 'react';
import { ArrowLeft, GitCommit, Map as MapIcon, Bot, Undo2 } from 'lucide-react';
import { api } from '../api';
import type { DriftDecision, DriftItem } from '../types';
import { CodeExcerpt, SeverityChip, SourceHeader, StateChip, fmtDate, Sample, Spinner } from './ui';
import { shortDocName } from '../lib/driftBuilder';

const DECISIONS: Record<DriftItem['kind'], { id: DriftDecision; label: string; primary?: boolean }[]> = {
  endpoint_changed: [
    { id: 'code_correct', label: 'Code is correct: update the doc', primary: true },
    { id: 'doc_correct', label: 'Doc is correct: flag the code' },
    { id: 'not_drift', label: 'Not drift: dismiss' },
  ],
  protocol_changed: [
    { id: 'code_correct', label: 'Code is correct: update the doc', primary: true },
    { id: 'doc_correct', label: 'Doc is correct: flag the code' },
    { id: 'not_drift', label: 'Not drift: dismiss' },
  ],
  missing_in_code: [
    { id: 'code_correct', label: 'Route was removed: update the doc', primary: true },
    { id: 'doc_correct', label: 'Route should exist: flag the code' },
    { id: 'not_drift', label: 'Not drift: dismiss' },
  ],
  undocumented: [
    { id: 'code_correct', label: 'Document this route', primary: true },
    { id: 'not_drift', label: 'Internal route: dismiss' },
  ],
};

const DISMISS_REASONS = ['Path parameter name only', 'Internal route, not part of the contract', 'Already tracked elsewhere'];

export function DriftDetail({
  item,
  onChanged,
  onShowOnMap,
  onAskAssistant,
}: {
  item: DriftItem;
  onChanged: (d: DriftItem) => void;
  onShowOnMap: (nodeId: string) => void;
  onAskAssistant: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState(false);
  const [reason, setReason] = useState('');
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<Record<number, string>>({});

  useEffect(() => {
    setDismissing(false);
    setReason('');
    setEditing(false);
    setEdits({});
    setError(null);
  }, [item.alert.id]);

  const run = async (label: string, fn: () => Promise<DriftItem>) => {
    setBusy(label);
    setError(null);
    try {
      onChanged(await fn());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const decide = (d: DriftDecision, r?: string) => run(d, () => api.decideDrift(item.alert.id, d, r));
  const fix = item.proposed_fix;
  const awaitingSend = item.state === 'open' && !!fix;
  const mapNode = item.alert.api_id ?? (item.alert.doc_id !== 'none' ? `doc-${item.alert.doc_id}` : `service-${item.alert.service_id}`);

  return (
    <article className="mx-auto flex max-w-[980px] flex-col gap-5 px-6 py-6">
      {/* Header */}
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <SeverityChip severity={item.alert.severity} />
          <StateChip state={item.state} />
          <span className="font-mono text-[11px] text-muted">{item.alert.rule_id}</span>
        </div>
        <h1 className="font-display text-[26px] font-semibold leading-tight">{item.headline}</h1>
        <p className="max-w-[70ch] text-ink-soft">{item.summary}</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-muted">
          <span>Detected {fmtDate(item.diverged?.date ?? item.detected_at)}</span>
          {item.ai_answers_7d > 0 && (
            <span className="inline-flex items-center gap-1">
              <Bot size={14} />
              <Sample>Used in {item.ai_answers_7d} AI answers this week</Sample>
            </span>
          )}
          <button className="inline-flex items-center gap-1 text-accent hover:underline" onClick={() => onShowOnMap(mapNode)}>
            <MapIcon size={14} /> Show on system map
          </button>
        </div>
      </header>

      {/* Doc vs code */}
      <section className="grid gap-4 md:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-2">
          <SourceHeader label={item.state === 'resolved' && fix ? 'Document said (before the fix)' : 'Document says'} ex={item.doc} missing="No document describes this route." />
          <Claims lines={item.doc_says} />
          {item.doc && <CodeExcerpt ex={item.doc} />}
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <SourceHeader label="Code does" ex={item.code} missing="No service implements this route." />
          <Claims lines={item.code_does} />
          {item.code && <CodeExcerpt ex={item.code} tone="ok" />}
        </div>
      </section>

      {/* Evidence */}
      {(item.diverged || item.callers.length > 0) && (
        <section className="flex flex-col gap-1 rounded-lg border border-line bg-panel px-4 py-3 text-[13px]">
          {item.diverged && (
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <GitCommit size={15} className="text-muted" />
              <Sample>
                Diverged in commit <code className="font-mono">{item.diverged.commit}</code> “{item.diverged.message}” by {item.diverged.author},{' '}
                {fmtDate(item.diverged.date)}
              </Sample>
            </span>
          )}
          {item.callers.length > 0 && (
            <span className="text-ink-soft">
              Depends on this: <span className="font-mono text-[12px]">{item.callers.join(', ')}</span>
            </span>
          )}
        </section>
      )}

      {error && <div className="rounded-md border border-crit bg-crit-soft px-3 py-2 text-[13px] text-crit">{error}</div>}

      {/* S3: decision */}
      {item.state === 'open' && !fix && (
        <section className="flex flex-col gap-3 rounded-lg border border-ink/80 bg-panel p-4">
          <div>
            <h2 className="font-semibold">Which version is correct?</h2>
            <p className="text-[13px] text-muted">Stavvros shows the evidence; you decide. Your answer decides who gets the fix.</p>
          </div>
          {!dismissing ? (
            <div className="flex flex-wrap gap-2">
              {DECISIONS[item.kind].map((d) => (
                <button
                  key={d.id}
                  disabled={!!busy}
                  className={`btn ${d.primary ? 'btn-primary' : d.id === 'not_drift' ? 'btn-ghost' : ''}`}
                  onClick={() => (d.id === 'not_drift' ? setDismissing(true) : decide(d.id))}
                >
                  {busy === d.id ? <Spinner /> : null}
                  {d.label}
                </button>
              ))}
            </div>
          ) : (
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                decide('not_drift', reason);
              }}
            >
              <label htmlFor="dismiss-reason" className="text-[13px] font-medium">
                Why is this not drift? Others will see your reason.
              </label>
              <div className="flex flex-wrap gap-1.5">
                {DISMISS_REASONS.map((r) => (
                  <button type="button" key={r} onClick={() => setReason(r)} className="rounded-full border border-line px-2.5 py-0.5 text-[12px] hover:border-ink">
                    {r}
                  </button>
                ))}
              </div>
              <input
                id="dismiss-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason"
                className="rounded-md border border-line px-3 py-1.5 outline-none focus:border-accent"
              />
              <div className="flex gap-2">
                <button className="btn btn-primary" disabled={!reason.trim() || !!busy} type="submit">
                  {busy ? <Spinner /> : null} Dismiss drift
                </button>
                <button className="btn btn-ghost" type="button" onClick={() => setDismissing(false)}>
                  Cancel
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      {/* S4: suggested doc fix */}
      {fix && (
        <section className="flex flex-col gap-3 rounded-lg border border-line bg-panel p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">
              {awaitingSend ? 'Suggested doc fix' : 'Doc fix'} · <span className="font-mono text-[13px] font-normal">{fix.path.replace('stavvros-workspace/', '')}</span>
            </h2>
            {awaitingSend && (
              <button className="text-[12.5px] text-accent hover:underline" onClick={() => setEditing((v) => !v)}>
                {editing ? 'Done editing' : 'Edit text'}
              </button>
            )}
          </div>
          <div className="overflow-x-auto rounded-md border border-line font-mono text-[11.5px] leading-[1.6]">
            {fix.hunks.map((h) => (
              <div key={h.line} className="border-b border-line last:border-b-0">
                <div className="bg-sunken px-2.5 text-muted">@@ line {h.line}</div>
                {h.remove.map((l, i) => (
                  <div key={`r${i}`} className="whitespace-pre-wrap break-words bg-crit-soft px-2.5">- {l}</div>
                ))}
                {editing ? (
                  <textarea
                    className="block w-full resize-y bg-ok-soft px-2.5 py-1 outline-none"
                    rows={Math.max(1, h.add.length)}
                    value={edits[h.line] ?? h.add.join('\n')}
                    onChange={(e) => setEdits({ ...edits, [h.line]: e.target.value })}
                    aria-label={`Replacement text for line ${h.line}`}
                  />
                ) : (
                  (edits[h.line]?.split('\n') ?? h.add).map((l, i) => (
                    <div key={`a${i}`} className="whitespace-pre-wrap break-words bg-ok-soft px-2.5">+ {l}</div>
                  ))
                )}
              </div>
            ))}
          </div>
          {fix.notes.map((n) => (
            <p key={n} className="border-l-[3px] border-warn pl-2.5 text-[12.5px] text-ink-soft">
              {n}
            </p>
          ))}
          <p className="text-[13px] text-muted">
            Reviewer: <span className="font-medium text-ink">{fix.reviewer.name}</span>
            {fix.reviewer.role ? `, ${fix.reviewer.role.toLowerCase()}` : ''} ({fix.reviewer.team}), owner of this doc
          </p>
          {awaitingSend && (
            <div className="flex flex-wrap gap-2">
              <button
                className="btn btn-primary"
                disabled={!!busy}
                onClick={() =>
                  run('send', () =>
                    api.sendDocFix(
                      item.alert.id,
                      Object.fromEntries(Object.entries(edits).map(([k, v]) => [Number(k), v.split('\n')])),
                    ),
                  )
                }
              >
                {busy === 'send' ? <Spinner /> : null}Send to {fix.reviewer.name} for review
              </button>
              <button className="btn btn-ghost" disabled={!!busy} onClick={() => run('reopen', () => api.reopenDrift(item.alert.id))}>
                <ArrowLeft size={14} /> Change decision
              </button>
            </div>
          )}
        </section>
      )}

      {/* Code issue */}
      {item.issue && (
        <section className="flex flex-col gap-2 rounded-lg border border-line bg-panel p-4">
          <h2 className="font-semibold">Issue for {item.issue.assignee_team}</h2>
          <p className="font-medium">{item.issue.title}</p>
          <pre className="codebox">{item.issue.body}</pre>
        </section>
      )}

      {/* S5: status */}
      {item.state !== 'open' && (
        <section className="grid gap-4 rounded-lg border border-line bg-panel p-4 md:grid-cols-[1fr_1fr]">
          <div className="flex flex-col gap-3">
            <h2 className="font-semibold">Status</h2>
            <ol className="flex flex-col gap-2.5">
              {item.timeline.map((e, i) => (
                <li key={i} className="grid grid-cols-[14px_1fr] gap-2.5">
                  <span className={`mt-1.5 h-2.5 w-2.5 rounded-full ${e.pending ? 'border-2 border-warn' : item.state === 'dismissed' && i > 0 ? 'bg-muted' : 'bg-ok'}`} />
                  <span>
                    {e.label}
                    <span className="block text-[12px] text-muted">
                      {e.pending ? e.detail : `${fmtDate(e.at, true)}${e.detail ? ` · ${e.detail}` : ''}`}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <div className="flex flex-col gap-3">
            <div className={`rounded-md border p-3 text-[13px] ${item.state === 'resolved' ? 'border-ok bg-ok-soft' : item.state === 'dismissed' ? 'border-line bg-sunken' : 'border-drift bg-drift-soft'}`}>
              <div className="mb-1 flex items-center gap-1.5 font-semibold">
                <Bot size={15} /> What AI assistants hear now
              </div>
              {item.state === 'fix_in_review' && `They get the code version plus a note that ${shortDocName(item.alert.doc_id)} is being updated by ${fix?.reviewer.name}.`}
              {item.state === 'issue_open' && `They are told the doc is correct and ${item.alert.service_id} is being fixed, so they should check before building on it.`}
              {item.state === 'resolved' && 'The doc and code agree again. Answers cite the corrected doc with no warning.'}
              {item.state === 'dismissed' && 'No warning. Your reason is stored with the alert so it does not come back on the next scan.'}
            </div>
            <div className="flex flex-wrap gap-2">
              {(item.state === 'fix_in_review' || item.state === 'issue_open') && api.mode === 'mock' && (
                <button className="btn btn-primary" disabled={!!busy} onClick={() => run('merge', () => api.simulateMerge(item.alert.id))}>
                  {busy === 'merge' ? <Spinner /> : null}
                  Demo: {item.state === 'fix_in_review' ? `${fix?.reviewer.name} approves` : 'code fix merges'}
                </button>
              )}
              <button className="btn" onClick={onAskAssistant}>
                <Bot size={14} /> Ask the assistant again
              </button>
              <button className="btn btn-ghost" disabled={!!busy} onClick={() => run('reopen', () => api.reopenDrift(item.alert.id))}>
                <Undo2 size={14} /> Reopen
              </button>
            </div>
          </div>
        </section>
      )}
    </article>
  );
}

function Claims({ lines }: { lines: string[] }) {
  return (
    <ul className="flex flex-col gap-0.5 rounded-md border border-line bg-panel px-3 py-2 text-[13px]">
      {lines.map((l) => (
        <li key={l} className="break-words font-mono text-[12px]">
          {l}
        </li>
      ))}
    </ul>
  );
}
