import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, RotateCcw, Inbox, Network, Bot } from 'lucide-react';
import { api } from './api';
import type { DriftItem, GraphResponse, WorkspaceInfo } from './types';
import { DriftInbox } from './components/DriftInbox';
import { DriftDetail } from './components/DriftDetail';
import { SystemMap } from './components/SystemMap';
import { NodeDrawer } from './components/NodeDrawer';
import { AssistantView } from './components/AssistantView';
import { LinkModal } from './components/LinkModal';
import { Spinner, isActive } from './components/ui';

type View = 'inbox' | 'map' | 'assistant';
const VIEWS: { id: View; label: string; icon: typeof Inbox }[] = [
  { id: 'inbox', label: 'Drift inbox', icon: Inbox },
  { id: 'map', label: 'System map', icon: Network },
  { id: 'assistant', label: 'AI assistant view', icon: Bot },
];
const viewFromHash = (): View => {
  const h = window.location.hash.replace('#', '');
  return (VIEWS.some((v) => v.id === h) ? h : 'inbox') as View;
};

export default function App() {
  const [view, setView] = useState<View>(viewFromHash());
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [graph, setGraph] = useState<GraphResponse | null>(null);
  const [drifts, setDrifts] = useState<DriftItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [focusNode, setFocusNode] = useState<string | null>(null);
  const [drawerNode, setDrawerNode] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [g, d] = await Promise.all([api.getGraph(), api.listDrifts()]);
      setGraph(g);
      setDrifts(d);
      setSelected((cur) => cur ?? d.filter(isActive).sort((a, b) => (a.alert.severity === 'critical' ? -1 : 1) - (b.alert.severity === 'critical' ? -1 : 1))[0]?.alert.id ?? null);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    api.getWorkspace().then(setWorkspace).catch(() => undefined);
    load();
    const onHash = () => setView(viewFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [load]);

  const go = (v: View) => {
    setView(v);
    try {
      history.replaceState(null, '', `#${v}`);
    } catch {
      /* sandboxed frames may refuse */
    }
  };

  const openDrift = (id: string) => {
    setSelected(id);
    setDrawerNode(null);
    go('inbox');
  };
  const showOnMap = (nodeId: string) => {
    setFocusNode(nodeId);
    go('map');
  };
  const onDriftChanged = async (d: DriftItem) => {
    setDrifts((all) => all.map((x) => (x.alert.id === d.alert.id ? d : x)));
    setGraph(await api.getGraph());
  };

  const current = useMemo(() => drifts.find((d) => d.alert.id === selected) ?? null, [drifts, selected]);
  const activeCount = drifts.filter(isActive).length;

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line bg-panel px-5 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-ink font-display text-[17px] font-bold text-white">S</span>
          <div className="leading-tight">
            <div className="font-display text-[17px] font-semibold">Stavvros</div>
            <div className="font-mono text-[11px] text-muted">{workspace?.workspace_name ?? '…'}</div>
          </div>
        </div>
        <nav className="flex gap-1" aria-label="Views">
          {VIEWS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => go(id)}
              aria-current={view === id ? 'page' : undefined}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] ${view === id ? 'bg-ink text-white' : 'text-ink-soft hover:bg-sunken'}`}
            >
              <Icon size={15} />
              {label}
              {id === 'inbox' && activeCount > 0 && (
                <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${view === id ? 'bg-white/20' : 'bg-drift-soft text-drift'}`}>{activeCount}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 text-[12px]">
          <span className="hidden text-muted md:inline">Alex · Checkout Team</span>
          <span
            className={`chip ${api.mode === 'mock' ? 'border border-warn bg-warn-soft text-warn' : 'bg-ok-soft text-ok'}`}
            title={api.mode === 'mock' ? 'Engine output is a real snapshot; people, commits and AI usage are sample data.' : 'Connected to FastAPI on :8000'}
          >
            {api.mode === 'mock' ? 'MOCK BACKEND' : 'LIVE'}
          </span>
          <button
            className="btn"
            disabled={scanning}
            onClick={async () => {
              setScanning(true);
              setGraph(await api.rescan());
              await load();
              setScanning(false);
            }}
          >
            <RefreshCw size={14} className={scanning ? 'animate-spin' : ''} /> {scanning ? 'Scanning' : 'Re-scan'}
          </button>
          {api.reset && (
            <button
              className="btn btn-ghost"
              title="Reset demo data"
              onClick={async () => {
                await api.reset!();
                setSelected(null);
                await load();
              }}
            >
              <RotateCcw size={14} /> Reset demo
            </button>
          )}
        </div>
      </header>

      {error && <div className="border-b border-crit bg-crit-soft px-5 py-2 text-[13px] text-crit">Could not reach the backend: {error}</div>}

      <main className="relative min-h-0 flex-1">
        {!graph ? (
          <div className="grid h-full place-items-center"><Spinner label="Building the knowledge graph…" /></div>
        ) : view === 'inbox' ? (
          <div className="grid h-full min-h-0 md:grid-cols-[400px_minmax(0,1fr)]">
            <DriftInbox drifts={drifts} graph={graph} selectedId={selected} onSelect={setSelected} />
            <div className="min-h-0 overflow-y-auto">
              {current ? (
                <DriftDetail item={current} onChanged={onDriftChanged} onShowOnMap={showOnMap} onAskAssistant={() => go('assistant')} />
              ) : (
                <div className="grid h-full place-items-center text-muted">Select a drift to see both sides.</div>
              )}
            </div>
          </div>
        ) : view === 'map' ? (
          <SystemMap
            graph={graph}
            drifts={drifts}
            focusNodeId={focusNode}
            onOpenDrift={openDrift}
            onOpenDetails={setDrawerNode}
            onLinkNodes={() => setLinking(true)}
          />
        ) : (
          <AssistantView onOpenDrift={openDrift} />
        )}
        {view === 'map' && <NodeDrawer nodeId={drawerNode} onClose={() => setDrawerNode(null)} onOpenDrift={openDrift} />}
      </main>
      {linking && graph && <LinkModal nodes={graph.nodes} onClose={() => setLinking(false)} onCreated={load} />}
    </div>
  );
}
