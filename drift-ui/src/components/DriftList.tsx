import { useMemo } from 'react';
import { Check } from 'lucide-react';
import type { DriftListItem, Severity } from '../types';
import { SEV_BAR, SEV_LABEL, SEV_TEXT, STATE_LABEL, isActive } from './ui';

export type ListTab = 'decide' | 'progress' | 'closed' | 'matches';

const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low'];

/** Drifts shown under a tab, in on-screen order (by severity). Used for prev/next in focus mode. */
export function visibleDrifts(items: DriftListItem[], tab: ListTab): DriftListItem[] {
  if (tab === 'matches') return [];
  const inTab = items.filter((i) => (tab === 'decide' ? i.state === 'open' : tab === 'progress' ? i.state !== 'open' && isActive(i.state) : !isActive(i.state)));
  return SEVERITIES.flatMap((sev) => inTab.filter((i) => i.severity === sev));
}

export function DriftList({
  items, selectedId, onSelect, tab, onTab, verifiedCount, dense = false,
}: {
  items: DriftListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  tab: ListTab;
  onTab: (t: ListTab) => void;
  verifiedCount: number;
  /** List mode: full-width table rows instead of the narrow sidebar rows. */
  dense?: boolean;
}) {
  const groups = useMemo(() => ({
    decide: items.filter((i) => i.state === 'open'),
    progress: items.filter((i) => i.state !== 'open' && isActive(i.state)),
    closed: items.filter((i) => !isActive(i.state)),
  }), [items]);

  const tabs: { id: ListTab; label: string; n: number }[] = [
    { id: 'decide', label: 'To decide', n: groups.decide.length },
    { id: 'progress', label: 'In progress', n: groups.progress.length },
    { id: 'closed', label: 'Closed', n: groups.closed.length },
    { id: 'matches', label: 'Matches', n: verifiedCount },
  ];
  const shown = tab === 'matches' ? [] : groups[tab];
  const critical = groups.decide.filter((i) => i.severity === 'critical').length;

  return (
    <div className={`flex min-h-0 flex-col bg-panel ${dense ? '' : 'h-full border-r border-line'}`}>
      {/* Level 0 summary: one sentence */}
      <div className="px-5 pb-3 pt-5">
        <h1 className="font-display text-[22px] font-semibold leading-tight">
          {groups.decide.length === 0 ? 'Docs and code agree' : `${groups.decide.length} drift${groups.decide.length === 1 ? '' : 's'} to decide`}
        </h1>
        <p className="mt-1 text-[13px] text-muted">
          {critical > 0 ? <><span className="font-medium text-crit">{critical} critical</span> · </> : null}
          {verifiedCount} doc claims match the code
        </p>
      </div>
      <div role="tablist" className="flex gap-3.5 border-b border-line px-5 text-[13px]">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => onTab(t.id)}
            className={`-mb-px flex items-center gap-1 whitespace-nowrap border-b-2 pb-2 ${tab === t.id ? 'border-ink font-semibold text-ink' : 'border-transparent text-muted hover:text-ink'}`}>
            {t.label}<span className="tabular-nums text-muted">{t.n}</span>
          </button>
        ))}
      </div>

      <div className={dense ? 'pb-4' : 'flex-1 overflow-y-auto pb-4'}>
        {tab !== 'matches' && shown.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-6 py-16 text-center text-muted">
            <Check size={20} className="text-ok" />
            {tab === 'decide' ? 'Nothing left to decide.' : tab === 'progress' ? 'No fixes in progress.' : 'Nothing closed yet.'}
          </div>
        )}
        {SEVERITIES.map((sev) => {
          const rows = shown.filter((i) => i.severity === sev);
          if (!rows.length) return null;
          return (
            <section key={sev}>
              <h2 className={`px-5 pb-1 pt-4 font-mono text-[11px] uppercase tracking-[0.08em] ${SEV_TEXT[sev]}`}>
                {SEV_LABEL[sev]} · {rows.length}
              </h2>
              <ul>
                {rows.map((i) => (
                  <li key={i.id}>
                    {dense ? (
                      <button
                        onClick={() => onSelect(i.id)}
                        aria-current={i.id === selectedId}
                        className={`relative grid w-full grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.2fr)_130px] items-center gap-4 py-2 pl-6 pr-5 text-left transition hover:bg-sunken/70 ${i.id === selectedId ? 'bg-accent-soft' : ''}`}
                      >
                        <span className={`absolute bottom-1.5 left-2.5 top-1.5 w-[3px] rounded-full ${SEV_BAR[i.severity]}`} />
                        <span className="truncate font-medium">{i.title}</span>
                        <span className="truncate text-[12.5px] text-muted">{i.service}</span>
                        <span className="truncate text-[12.5px] text-muted">{i.doc_title ?? ''}</span>
                        <span className="truncate text-right text-[12px] text-muted">{STATE_LABEL[i.state]}</span>
                      </button>
                    ) : (
                    <button
                      onClick={() => onSelect(i.id)}
                      aria-current={i.id === selectedId}
                      className={`group relative flex w-full flex-col gap-0.5 py-2.5 pl-6 pr-5 text-left transition ${i.id === selectedId ? 'bg-accent-soft' : 'hover:bg-sunken/70'}`}
                    >
                      <span className={`absolute bottom-2 left-2.5 top-2 w-[3px] rounded-full ${SEV_BAR[i.severity]}`} />
                      <span className="truncate font-medium leading-snug">{i.title}</span>
                      <span className="truncate text-[12px] text-muted">
                        {i.service}{i.doc_title ? ` · ${i.doc_title}` : ''}{tab !== 'decide' ? ` · ${STATE_LABEL[i.state]}` : ''}
                      </span>
                    </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
