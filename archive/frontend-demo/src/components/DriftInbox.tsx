import React, { useMemo, useState } from 'react';
import type { DriftItem, GraphResponse } from '../types';
import { SeverityChip, StateChip, fmtDate, isActive, Sample } from './ui';
import { shortDocName } from '../lib/driftBuilder';

type Filter = 'active' | 'open' | 'review' | 'closed';

const FILTERS: { id: Filter; label: string; test: (d: DriftItem) => boolean }[] = [
  { id: 'active', label: 'Active', test: isActive },
  { id: 'open', label: 'Needs a decision', test: (d) => d.state === 'open' },
  { id: 'review', label: 'In review', test: (d) => d.state === 'fix_in_review' || d.state === 'issue_open' },
  { id: 'closed', label: 'Closed', test: (d) => d.state === 'resolved' || d.state === 'dismissed' },
];

const sevRank = { critical: 0, medium: 1, warning: 2 } as const;

export function DriftInbox({
  drifts,
  graph,
  selectedId,
  onSelect,
}: {
  drifts: DriftItem[];
  graph: GraphResponse | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>('active');
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.id, drifts.filter(f.test).length])), [drifts]);
  const list = useMemo(
    () =>
      drifts
        .filter(FILTERS.find((f) => f.id === filter)!.test)
        .sort((a, b) => sevRank[a.alert.severity] - sevRank[b.alert.severity] || b.ai_answers_7d - a.ai_answers_7d),
    [drifts, filter],
  );
  const critical = drifts.filter((d) => isActive(d) && d.alert.severity === 'critical').length;

  return (
    <div className="flex h-full min-h-0 flex-col border-r border-line bg-panel">
      <div className="flex flex-col gap-3 border-b border-line px-4 py-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-[19px] font-semibold">Drift inbox</h2>
          <span className="text-[12px] text-muted">Services your team owns or calls</span>
        </div>
        <dl className="grid grid-cols-3 gap-2 text-[12px]">
          <Stat label="Active" value={counts.active} />
          <Stat label="Critical" value={critical} tone={critical ? 'crit' : undefined} />
          <Stat label="Doc coverage" value={`${graph?.doc_coverage_pct ?? 0}%`} />
        </dl>
        <div role="tablist" className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-md px-2.5 py-1 text-[12px] ${filter === f.id ? 'bg-ink text-white' : 'text-muted hover:bg-sunken hover:text-ink'}`}
            >
              {f.label} <span className="tabular-nums opacity-70">{counts[f.id]}</span>
            </button>
          ))}
        </div>
      </div>
      <ul className="flex-1 overflow-y-auto p-2">
        {list.length === 0 && <li className="px-3 py-10 text-center text-muted">Nothing here.</li>}
        {list.map((d) => {
          const sel = d.alert.id === selectedId;
          return (
            <li key={d.alert.id}>
              <button
                onClick={() => onSelect(d.alert.id)}
                className={`mb-1.5 grid w-full grid-cols-[auto_1fr] gap-x-2.5 gap-y-1 rounded-lg border p-3 text-left transition ${
                  sel ? 'border-accent bg-accent-soft' : 'border-line hover:border-ink-soft/40 hover:bg-sunken/60'
                }`}
              >
                <SeverityChip severity={d.alert.severity} />
                <span className="min-w-0">
                  <span className="font-semibold">{d.headline}</span>
                  <span className="text-muted"> · {d.alert.doc_id !== 'none' ? `${shortDocName(d.alert.doc_id)} ↔ ` : ''}{d.alert.service_id}</span>
                </span>
                <span />
                <span className="truncate font-mono text-[11.5px] text-ink-soft">
                  {d.kind === 'undocumented' ? d.code_does[0] : d.kind === 'missing_in_code' ? d.doc_says[0] : `${d.doc_says[0]} → ${d.code_does[0]?.split(' ')[1] ?? ''}`}
                </span>
                <span />
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-muted">
                  {d.state !== 'open' && <StateChip state={d.state} />}
                  <span>Since {fmtDate(d.diverged?.date ?? d.detected_at)}</span>
                  {d.ai_answers_7d > 0 && (
                    <Sample>
                      used in {d.ai_answers_7d} AI answer{d.ai_answers_7d === 1 ? '' : 's'} this week
                    </Sample>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'crit' }) {
  return (
    <div className="rounded-md bg-sunken px-2.5 py-1.5">
      <dt className="text-muted">{label}</dt>
      <dd className={`font-display text-[18px] font-semibold tabular-nums ${tone === 'crit' ? 'text-crit' : ''}`}>{value}</dd>
    </div>
  );
}
