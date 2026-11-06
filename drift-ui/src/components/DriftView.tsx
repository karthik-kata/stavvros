import { useEffect, useState } from 'react';
import { ArrowLeft, Bot, Check, Cpu, FileText, Map as MapIcon, Sparkles, Undo2 } from 'lucide-react';
import { api } from '../api';
import type { ActionId, DriftRecord, Finding, ProposedChange } from '../types';
import { CATEGORY_LABEL, CodeExcerpt, Disclosure, SeverityChip, Spinner, STATE_LABEL, ago, fileName, time } from './ui';

const SIDE_LABELS: Record<string, [string, string]> = {
  broken_call: ['Caller uses', 'Service exposes'],
  undocumented_route: ['Docs', 'Code exposes'],
  fields_changed: ['Only in doc', 'Only in code'],
  enum_changed: ['Only in doc', 'Only in code'],
  event_not_consumed: ['Doc says', 'Code'],
};
const DISMISS_REASONS = ['Intentional, doc update scheduled', 'Internal route', 'False positive'];

export function DriftView({ id, onChanged, onShowOnMap, onAsk }: {
  id: string;
  onChanged: () => void;
  onShowOnMap: (nodeId: string) => void;
  onAsk: () => void;
}) {
  const [rec, setRec] = useState<DriftRecord | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState(false);
  const [reason, setReason] = useState('');
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<Record<number, string>>({});

  useEffect(() => {
    setRec(null); setError(null); setDismissing(false); setReason(''); setEditing(false); setEdits({});
    api.drift(id).then(setRec).catch((e) => setError(e.message));
  }, [id]);

  const run = async (label: string, fn: () => Promise<DriftRecord>) => {
    setBusy(label); setError(null);
    try {
      setRec(await fn());
      setEditing(false); setDismissing(false);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (!rec) return <div className="grid h-full place-items-center">{error ? <p className="text-crit">{error}</p> : <Spinner label="Loading" />}</div>;
  const f = rec.finding;
  const [leftLabel, rightLabel] = SIDE_LABELS[f.kind] ?? ['Doc says', 'Code does'];

  return (
    <article className="mx-auto flex max-w-[860px] flex-col px-8 py-7">
      {/* ---------- Level 1: the verdict ---------- */}
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
        <SeverityChip severity={f.severity} />
        <span>{CATEGORY_LABEL[f.category]}</span>
        <span>·</span>
        <span>{f.service}</span>
        {rec.state !== 'open' && <><span>·</span><span className="font-medium text-ink">{STATE_LABEL[rec.state]}</span></>}
      </div>
      <h1 className="mt-2 font-display text-[28px] font-semibold leading-tight">{f.title}</h1>

      <div className={`mt-5 grid grid-cols-2 overflow-hidden rounded-xl border border-line bg-panel ${rec.state === 'resolved' || rec.state === 'dismissed' ? 'opacity-60' : ''}`}>
        <Value label={leftLabel} value={f.doc_value} tone="doc"
          source={f.kind === 'broken_call' && f.code ? `${fileName(f.code.path)} · line ${f.code.line}` : f.doc ? `${f.doc.label} · line ${f.doc.line}` : 'No document'} />
        <Value label={rightLabel} value={f.code_value} tone="code" border
          source={f.kind === 'broken_call' ? (f.related ? `${f.related.label.split(' · ')[0]} · ${fileName(f.related.path)} · line ${f.related.line}` : '') : f.code ? `${fileName(f.code.path)} · line ${f.code.line}` : ''} />
      </div>
      <p className="mt-3 text-[15px] text-ink-soft">{f.impact}</p>

      {error && <p className="mt-4 rounded-md border border-crit bg-crit-soft px-3 py-2 text-[13px] text-crit">{error}</p>}

      {/* ---------- Level 1: what to do ---------- */}
      <div className="mt-6 mb-6">
        {rec.state === 'open' && !dismissing && (
          <div className="flex flex-col gap-2.5">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-muted">Which is right?</h2>
            <div className="flex flex-wrap gap-2">
              {f.actions.map((a) => (
                <button key={a.id} disabled={!!busy}
                  className={`btn ${a.primary ? 'btn-primary' : a.id === 'dismiss' ? 'btn-ghost' : ''}`}
                  onClick={() => (a.id === 'dismiss' ? setDismissing(true) : run(a.id, () => api.decide(f.id, a.id as ActionId)))}>
                  {busy === a.id && <Spinner />}{a.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {rec.state === 'open' && dismissing && (
          <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); run('dismiss', () => api.decide(f.id, 'dismiss', reason)); }}>
            <label htmlFor="reason" className="text-[13px] font-medium">Why is this not a problem? The reason stays with the drift.</label>
            <div className="flex flex-wrap gap-1.5">
              {DISMISS_REASONS.map((r) => (
                <button type="button" key={r} onClick={() => setReason(r)} className={`rounded-full border px-2.5 py-0.5 text-[12px] ${reason === r ? 'border-ink' : 'border-line hover:border-ink'}`}>{r}</button>
              ))}
            </div>
            <div className="flex gap-2">
              <input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} className="flex-1 rounded-md border border-line px-3 py-1.5 outline-none focus:border-accent" placeholder="Reason" />
              <button className="btn btn-primary" disabled={!reason.trim() || !!busy}>{busy && <Spinner />}Dismiss</button>
              <button type="button" className="btn btn-ghost" onClick={() => setDismissing(false)}>Cancel</button>
            </div>
          </form>
        )}

        {rec.state === 'change_drafted' && rec.change && (
          <ChangeCard change={rec.change} editing={editing} edits={edits} setEdits={setEdits}>
            <button className="btn btn-primary" disabled={!!busy}
              onClick={() => run('send', () => api.send(f.id, Object.fromEntries(Object.entries(edits).map(([k, v]) => [Number(k), v.split('\n')]))))}>
              {busy === 'send' && <Spinner />}Send to {rec.change.reviewer.name}
            </button>
            <button className="btn" onClick={() => setEditing((v) => !v)}>{editing ? 'Done editing' : 'Edit'}</button>
            <button className="btn btn-ghost" disabled={!!busy} onClick={() => run('reopen', () => api.reopen(f.id))}><ArrowLeft size={14} />Change decision</button>
          </ChangeCard>
        )}

        {(rec.state === 'in_review' || rec.state === 'issue_open' || rec.state === 'resolved' || rec.state === 'dismissed') && (
          <Progress rec={rec} busy={busy}
            onApprove={() => run('approve', () => api.approve(f.id))}
            onReopen={() => run('reopen', () => api.reopen(f.id))}
            onAsk={onAsk} />
        )}
      </div>

      {/* ---------- Level 2: evidence ---------- */}
      <Disclosure title="Evidence" hint={[f.doc && `${fileName(f.doc.path)}:${f.doc.line}`, f.code && `${fileName(f.code.path)}:${f.code.line}`].filter(Boolean).join('  ·  ')}>
        <div className="grid gap-4 md:grid-cols-2">
          {f.doc && <Side title={f.doc.label} path={f.doc.path} owner={`${f.doc.owner.name}, ${f.doc.owner.team}`} icon={<FileText size={14} />}><CodeExcerpt ex={f.doc.excerpt} tone="doc" /></Side>}
          {f.code && <Side title={f.code.label} path={f.code.path} owner={`${f.code.owner.name}, ${f.code.owner.team}`} icon={<Cpu size={14} />}><CodeExcerpt ex={f.code.excerpt} tone="code" /></Side>}
          {f.related && <Side title={f.related.label} path={f.related.path} owner={`${f.related.owner.name}, ${f.related.owner.team}`} icon={<Cpu size={14} />}><CodeExcerpt ex={f.related.excerpt} tone="code" /></Side>}
        </div>
        {f.callers.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1 text-[12.5px] text-ink-soft">
            {f.callers.map((c) => <li key={c} className="font-mono text-[12px]">{c}</li>)}
          </ul>
        )}
        <button className="mt-3 inline-flex items-center gap-1 text-[12.5px] text-accent hover:underline" onClick={() => onShowOnMap(f.code ? f.detection.fact_ids[0] ?? `service:${f.service}` : `service:${f.service}`)}>
          <MapIcon size={13} /> Show on the system map
        </button>
      </Disclosure>

      {/* ---------- Level 3: how it was found ---------- */}
      <Disclosure title="How Stavvros found this" hint={`${f.detection.engine === 'ast' ? 'Static analysis' : 'Static analysis + LLM'} · ${Math.round(f.detection.confidence * 100)}% confident`}>
        <HowFound f={f} />
      </Disclosure>

      {rec.timeline.length > 1 && (
        <Disclosure title="History" hint={`${rec.timeline.length} events`}>
          <ol className="flex flex-col gap-2 text-[13px]">
            {rec.timeline.map((e, i) => (
              <li key={i} className="grid grid-cols-[64px_1fr] gap-3">
                <span className="text-muted tabular-nums">{e.pending ? 'pending' : time(e.at)}</span>
                <span>{e.label}{e.detail && <span className="text-muted"> · {e.detail}</span>}</span>
              </li>
            ))}
          </ol>
        </Disclosure>
      )}
    </article>
  );
}

function Value({ label, value, source, tone, border }: { label: string; value: string; source: string; tone: 'doc' | 'code'; border?: boolean }) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 px-5 py-4 ${border ? 'border-l border-line' : ''}`}>
      <span className="eyebrow">{label}</span>
      <span className={`break-words font-display text-[24px] font-semibold leading-tight ${tone === 'doc' ? 'text-drift' : 'text-accent'}`}>{value}</span>
      <span className="truncate text-[12px] text-muted">{source}</span>
    </div>
  );
}

function Side({ title, path, owner, icon, children }: { title: string; path: string; owner: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center gap-1.5 text-[13px] font-medium">{icon}{title}</div>
      <div className="truncate font-mono text-[11px] text-muted">{path} · {owner}</div>
      {children}
    </div>
  );
}

function ChangeCard({ change, editing, edits, setEdits, children }: {
  change: ProposedChange; editing: boolean; edits: Record<number, string>; setEdits: (e: Record<number, string>) => void; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-ink bg-panel p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">{change.creates_file ? 'New doc' : change.target === 'doc' ? 'Doc fix' : 'Code fix'} <span className="font-mono text-[12px] font-normal text-muted">{change.path}</span></h2>
        <span className="text-[12.5px] text-muted">Reviewer: <span className="text-ink">{change.reviewer.name}</span>, {change.reviewer.team}</span>
      </div>
      <div className="overflow-x-auto rounded-md border border-line font-mono text-[11.5px] leading-[1.65]">
        {change.hunks.map((h) => (
          <div key={h.line}>
            {h.remove.map((l, i) => <div key={`r${i}`} className="whitespace-pre-wrap break-words bg-crit-soft px-3">- {l}</div>)}
            {editing ? (
              <textarea aria-label={`New text for line ${h.line}`} className="block w-full resize-y bg-ok-soft px-3 py-1 outline-none" rows={Math.max(1, h.add.length)}
                value={edits[h.line] ?? h.add.join('\n')} onChange={(e) => setEdits({ ...edits, [h.line]: e.target.value })} />
            ) : (
              (edits[h.line]?.split('\n') ?? h.add).map((l, i) => <div key={`a${i}`} className="whitespace-pre-wrap break-words bg-ok-soft px-3">+ {l}</div>)
            )}
          </div>
        ))}
      </div>
      {change.notes.map((n) => <p key={n} className="text-[12.5px] text-muted">{n}</p>)}
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Progress({ rec, busy, onApprove, onReopen, onAsk }: { rec: DriftRecord; busy: string | null; onApprove: () => void; onReopen: () => void; onAsk: () => void }) {
  const reviewer = rec.change?.reviewer.name;
  const steps =
    rec.state === 'issue_open' ? ['Decided', 'Issue opened', 'Code fixed']
      : rec.state === 'dismissed' ? ['Decided', 'Dismissed']
      : ['Decided', `With ${reviewer ?? 'reviewer'}`, 'Merged'];
  const current = rec.state === 'in_review' ? 1 : rec.state === 'issue_open' ? 1 : steps.length;
  const message = {
    in_review: `AI assistants are told to follow the code until ${reviewer} merges the fix.`,
    issue_open: `${rec.issue?.team} has an issue to fix the code. Assistants are warned meanwhile.`,
    resolved: 'Docs and code agree. The last scan no longer finds this drift.',
    dismissed: `Dismissed by ${rec.decided_by?.name ?? 'someone'}: “${rec.reason}”. It will not come back on rescans.`,
  }[rec.state as 'in_review' | 'issue_open' | 'resolved' | 'dismissed'];

  return (
    <div className={`flex flex-col gap-3 rounded-xl border p-4 ${rec.state === 'resolved' ? 'border-ok bg-ok-soft' : rec.state === 'dismissed' ? 'border-line bg-sunken' : 'border-line bg-panel'}`}>
      <ol className="flex items-center gap-2 text-[12.5px]">
        {steps.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span className={`grid h-5 w-5 place-items-center rounded-full text-[11px] ${i < current ? 'bg-ok text-onink' : i === current ? 'border-2 border-drift text-drift' : 'border border-line text-muted'}`}>
              {i < current ? <Check size={12} /> : i + 1}
            </span>
            <span className={i <= current ? 'text-ink' : 'text-muted'}>{s}</span>
            {i < steps.length - 1 && <span className="h-px w-6 bg-line" />}
          </li>
        ))}
      </ol>
      <p className="text-[13.5px]">{message}</p>
      {rec.state === 'in_review' && rec.change && (
        <details className="text-[12.5px]">
          <summary className="cursor-pointer text-muted">The change ({rec.change.path})</summary>
          <div className="mt-2 overflow-x-auto rounded-md border border-line bg-panel font-mono text-[11.5px] leading-[1.65]">
            {rec.change.hunks.map((h) => (
              <div key={h.line}>
                {h.remove.map((l, i) => <div key={`r${i}`} className="bg-crit-soft px-3">- {l}</div>)}
                {h.add.map((l, i) => <div key={`a${i}`} className="bg-ok-soft px-3">+ {l}</div>)}
              </div>
            ))}
          </div>
        </details>
      )}
      <div className="flex flex-wrap gap-2">
        {rec.state === 'in_review' && (
          <button className="btn btn-primary" disabled={!!busy} onClick={onApprove}>
            {busy === 'approve' ? <Spinner /> : <Sparkles size={14} />}Approve as {reviewer} (demo)
          </button>
        )}
        <button className="btn" onClick={onAsk}><Bot size={14} />Ask the assistant</button>
        {rec.state !== 'resolved' && (
          <button className="btn btn-ghost" disabled={!!busy} onClick={onReopen}><Undo2 size={14} />Reopen</button>
        )}
      </div>
    </div>
  );
}

function HowFound({ f }: { f: Finding }) {
  const llm = f.detection.engine === 'ast+llm';
  const steps: { who: 'AST' | 'Parser' | 'LLM'; text: string }[] = [];
  if (f.kind === 'rule_mismatch') {
    steps.push({ who: 'LLM', text: `Read the doc and pulled out a checkable claim: “${f.doc?.excerpt.lines[f.doc.line - f.doc.excerpt.start_line]?.replace(/^[-*\d.\s]+/, '')}”` });
    steps.push({ who: 'AST', text: `Found the code facts that could settle it: ${f.detection.fact_ids.map((x) => x.split(':')[2]).join(', ')}` });
    steps.push({ who: 'LLM', text: `Compared the two and judged them different (${Math.round(f.detection.confidence * 100)}% confident).` });
    steps.push({ who: 'LLM', text: 'Drafted the doc fix and wrote this summary.' });
  } else if (f.kind === 'undocumented_route') {
    steps.push({ who: 'AST', text: `Found ${f.code_value} in ${f.code ? fileName(f.code.path) : f.service}, and no doc lists it.` });
    steps.push({ who: 'LLM', text: `Rated how much that matters (${f.severity}) using the docs for ${f.service}.` });
  } else {
    steps.push({ who: 'Parser', text: f.doc ? `Read the ${f.doc.label} table or list at line ${f.doc.line}.` : 'Read outbound HTTP calls in every service.' });
    steps.push({ who: 'AST', text: `Compared it with ${f.detection.fact_ids.map((x) => x.split(':').slice(1, 3).join(' ')).join(', ') || 'the code'} (rule ${f.detection.rule}).` });
  }
  return (
    <div className="flex flex-col gap-4 text-[13px]">
      <p className="text-ink-soft">{f.detection.reasoning}</p>
      <ol className="flex flex-col gap-2">
        {steps.map((s, i) => (
          <li key={i} className="grid grid-cols-[56px_1fr] items-start gap-3">
            <span className={`chip justify-center ${s.who === 'LLM' ? 'bg-drift-soft text-drift' : 'bg-accent-soft text-accent'}`}>{s.who}</span>
            <span>{s.text}</span>
          </li>
        ))}
      </ol>
      <dl className="grid grid-cols-[120px_1fr] gap-y-1 text-[12px] text-muted">
        <dt>Engine</dt><dd className="text-ink">{llm ? 'Static analysis + LLM' : 'Static analysis only (deterministic)'}</dd>
        <dt>Rule</dt><dd className="font-mono text-ink">{f.detection.rule}</dd>
        <dt>Fingerprint</dt><dd className="font-mono text-ink">{f.id}</dd>
      </dl>
    </div>
  );
}

export { ago };
