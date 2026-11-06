import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import { api } from './api';
import type { Claims, DriftListItem, Graph, ScanReport } from './types';
import { DriftList, visibleDrifts, type ListTab } from './components/DriftList';
import { DriftView } from './components/DriftView';
import { Matches } from './components/Matches';
import { ScanStatus } from './components/ScanStatus';
import { DEFAULT_SPLIT, DETAIL_ONLY, LIST_ONLY, SplitPane, type Frac } from './components/SplitPane';
import { SystemMap } from './components/SystemMap';
import { Assistant } from './components/Assistant';
import { Spinner, isActive } from './components/ui';

type View = 'drift' | 'map' | 'assistant';
const loadFrac = (): Frac => {
  try { const f = parseFloat(localStorage.getItem('drift-split') ?? ''); if (f >= 0 && f <= 1) return f; } catch { /* storage unavailable */ }
  return DEFAULT_SPLIT;
};

export default function App() {
  const [view, setView] = useState<View>('drift');
  const [items, setItems] = useState<DriftListItem[] | null>(null);
  const [report, setReport] = useState<ScanReport | null>(null);
  const [claims, setClaims] = useState<Claims | null>(null);
  const [graph, setGraph] = useState<Graph | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<ListTab>('decide');
  const [focus, setFocus] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [frac, setFracState] = useState<Frac>(loadFrac);
  const [restore, setRestore] = useState<Frac>(() => { const f = loadFrac(); return f > 0 ? f : DEFAULT_SPLIT; });
  const setFrac = (f: Frac) => {
    setFracState(f);
    if (f > 0) setRestore(f);
    try { localStorage.setItem('drift-split', String(f)); } catch { /* ignore */ }
  };
  const mode = frac >= LIST_ONLY ? 'list' : frac <= DETAIL_ONLY ? 'focus' : 'split';
  const order = useMemo(() => (items ? visibleDrifts(items, tab) : []), [items, tab]);
  const pos = selected ? order.findIndex((i) => i.id === selected) : -1;
  const step = useCallback((d: number) => { if (pos >= 0 && order[pos + d]) setSelected(order[pos + d].id); }, [order, pos]);
  /** In list-only mode a row opens the issue full-page (GitHub style); in split it just selects. */
  const pick = (id: string) => {
    setSelected(id);
    if (mode === 'list') setFrac(DETAIL_ONLY);
  };
  const leaveFocus = () => setFrac(restore);

  useEffect(() => {
    if (view !== 'drift' || mode === 'list') return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'j') step(1);
      else if (e.key === 'k') step(-1);
      else if (e.key === 'Escape' && mode === 'focus') leaveFocus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const refresh = useCallback(async () => {
    try {
      const [list, rep, cl, g] = await Promise.all([api.drifts(), api.lastScan(), api.claims(), api.graph()]);
      setItems(list); setReport(rep); setClaims(cl); setGraph(g); setError(null);
      setSelected((cur) => cur ?? list.find((i) => i.state === 'open')?.id ?? null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const scan = async (fn: () => Promise<ScanReport>) => {
    setScanning(true);
    try { await fn(); await refresh(); setVersion((v) => v + 1); } catch (e) { setError((e as Error).message); } finally { setScanning(false); }
  };

  const openDrift = (id: string) => {
    const it = items?.find((i) => i.id === id);
    if (it) setTab(it.state === 'open' ? 'decide' : isActive(it.state) ? 'progress' : 'closed');
    setSelected(id); setView('drift'); if (mode === 'list') setFrac(DEFAULT_SPLIT);
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-6 border-b border-line bg-panel px-5 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-ink font-display text-[17px] font-bold text-onink">S</span>
          <div className="leading-tight">
            <div className="font-display text-[16px] font-semibold">Stavvros</div>
            <div className="font-mono text-[11px] text-muted">{report?.codebase ?? '…'}</div>
          </div>
        </div>
        <nav className="flex items-center gap-1 text-[13px]" aria-label="Views">
          <button onClick={() => setView('drift')} aria-current={view === 'drift' ? 'page' : undefined}
            className={`rounded-md px-3 py-1.5 font-medium ${view === 'drift' ? 'bg-ink text-onink' : 'text-ink hover:bg-sunken'}`}>Drift</button>
          <span className="mx-2 h-4 w-px bg-line" />
          {(['map', 'assistant'] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} aria-current={view === v ? 'page' : undefined}
              className={`rounded-md px-2.5 py-1.5 ${view === v ? 'bg-sunken text-ink' : 'text-muted hover:text-ink'}`}>
              {v === 'map' ? 'System map' : 'Assistant preview'}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ScanStatus report={report} scanning={scanning} onScan={() => scan(api.scan)} />
          <button className="btn btn-ghost" title="Restore the mock codebase and clear decisions" onClick={() => { setSelected(null); scan(api.reset); }}>
            <RotateCcw size={14} />Reset
          </button>
        </div>
      </header>

      {error && <div className="border-b border-crit bg-crit-soft px-5 py-2 text-[13px] text-crit">{error}</div>}

      <main className="min-h-0 flex-1">
        {!items ? (
          <div className="grid h-full place-items-center">{error ? null : <Spinner label="Scanning acme-shop…" />}</div>
        ) : view === 'drift' ? (
          <SplitPane frac={frac} onFrac={setFrac}
            left={(
              <>
                <DriftList items={items} selectedId={selected} onSelect={pick} tab={tab}
                  onTab={(t) => { setTab(t); if (t === 'matches') setSelected(null); }} verifiedCount={claims?.verified.length ?? 0} />
                {mode === 'list' && tab === 'matches' && <Matches claims={claims} />}
              </>
            )}
            right={
              <div className="flex min-h-full flex-col">
                {mode === 'focus' && (
                  <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-panel px-5 py-2 text-[13px]">
                    <button className="flex items-center gap-1.5 text-muted hover:text-ink" onClick={leaveFocus}><ArrowLeft size={14} />All drifts</button>
                    <span className="ml-auto tabular-nums text-muted">{pos >= 0 ? `${pos + 1} of ${order.length}` : ''}</span>
                    <button className="btn btn-ghost px-1.5" aria-label="Previous drift" title="Previous (k)" disabled={pos <= 0} onClick={() => step(-1)}><ChevronUp size={14} /></button>
                    <button className="btn btn-ghost px-1.5" aria-label="Next drift" title="Next (j)" disabled={pos < 0 || pos >= order.length - 1} onClick={() => step(1)}><ChevronDown size={14} /></button>
                  </div>
                )}
                {tab === 'matches' ? <Matches claims={claims} />
                  : selected ? <DriftView key={`${selected}-${version}`} id={selected} onChanged={refresh} onShowOnMap={(n) => { setFocus(n); setView('map'); }} onAsk={() => setView('assistant')} />
                  : <div className="grid h-full min-h-[240px] place-items-center text-muted">Select a drift</div>}
              </div>
            } />
        ) : view === 'map' && graph ? (
          <SystemMap graph={graph} drifts={items} focus={focus} onOpenDrift={openDrift} />
        ) : (
          <div className="h-full overflow-y-auto"><Assistant onOpenDrift={openDrift} /></div>
        )}
      </main>
    </div>
  );
}
