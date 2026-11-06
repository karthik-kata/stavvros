import React from 'react';
import type { DriftItem, DriftSeverity, DriftState, SourceExcerpt } from '../types';

export const SEVERITY_LABEL: Record<DriftSeverity, string> = { critical: 'CRITICAL', medium: 'MEDIUM', warning: 'WARNING' };

export function SeverityChip({ severity }: { severity: DriftSeverity }) {
  const cls = severity === 'critical' ? 'bg-crit-soft text-crit' : severity === 'medium' ? 'bg-drift-soft text-drift' : 'bg-warn-soft text-warn';
  return <span className={`chip ${cls}`}>{SEVERITY_LABEL[severity]}</span>;
}

export const STATE_LABEL: Record<DriftState, string> = {
  open: 'Needs a decision',
  fix_in_review: 'Doc fix in review',
  issue_open: 'Code issue open',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
};

export function StateChip({ state }: { state: DriftState }) {
  const cls =
    state === 'open'
      ? 'bg-sunken text-ink-soft'
      : state === 'fix_in_review' || state === 'issue_open'
        ? 'bg-drift-soft text-drift'
        : state === 'resolved'
          ? 'bg-ok-soft text-ok'
          : 'bg-sunken text-muted';
  return <span className={`chip ${cls}`}>{STATE_LABEL[state].toUpperCase()}</span>;
}

export function fmtDate(iso: string, withTime = false) {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (!withTime) return date;
  return `${date}, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

export function CodeExcerpt({ ex, tone = 'drift' }: { ex: SourceExcerpt; tone?: 'drift' | 'ok' }) {
  return (
    <div className="overflow-x-auto rounded-md bg-sunken py-1.5 font-mono text-[11.5px] leading-[1.6]">
      {ex.lines.map((l, i) => {
        const n = ex.start_line + i;
        const hi = n === ex.highlight_line;
        return (
          <div key={n} className={`flex gap-3 px-2.5 ${hi ? (tone === 'ok' ? 'bg-ok-soft' : 'bg-drift-soft') : ''}`}>
            <span className="w-6 shrink-0 select-none text-right text-muted">{n}</span>
            <span className="whitespace-pre-wrap break-words">{l || ' '}</span>
          </div>
        );
      })}
    </div>
  );
}

export function SourceHeader({ label, ex, missing }: { label: string; ex?: SourceExcerpt; missing?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="eyebrow">{label}</span>
      {ex ? (
        <span className="text-[12px] text-muted">
          <span className="font-mono text-ink-soft">{ex.path.replace('stavvros-workspace/', '')}</span>, line {ex.highlight_line} · owner{' '}
          <span className="text-ink">{ex.owner.name}</span> ({ex.owner.team})
        </span>
      ) : (
        <span className="text-[12px] text-muted">{missing}</span>
      )}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-muted">
      <span className="h-3 w-3 animate-spin rounded-full border-2 border-line border-t-accent" />
      {label}
    </span>
  );
}

export function isActive(d: DriftItem) {
  return d.state === 'open' || d.state === 'fix_in_review' || d.state === 'issue_open';
}

export function Sample({ children }: { children: React.ReactNode }) {
  return (
    <span title="Sample data: the engine does not produce this yet" className="border-b border-dotted border-muted">
      {children}
    </span>
  );
}
