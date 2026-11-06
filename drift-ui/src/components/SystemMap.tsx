import { useEffect, useMemo, useRef, useState } from 'react';
import cytoscape, { type Core } from 'cytoscape';
import { Maximize2, X } from 'lucide-react';
import type { DriftListItem, Graph } from '../types';
import { SEV_CHIP, isActive } from './ui';

const C = {
  ink: '#E8ECF1', line: '#3A4658', drift: '#F08A4B', crit: '#F2766B', accent: '#6EA8E8',
  service: { bg: '#182A42', border: '#6EA8E8' }, route: { bg: '#1D242F', border: '#5A6879' }, doc: { bg: '#30280F', border: '#D9A441' },
};
const TYPE: Record<string, string> = { service: 'Service', route: 'Route', doc: 'Document' };

/** Secondary view: where drift sits in the system. Nodes show a heading; click to expand. */
export function SystemMap({ graph, drifts, focus, onOpenDrift }: { graph: Graph; drifts: DriftListItem[]; focus: string | null; onOpenDrift: (id: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const [expanded, setExpanded] = useState<string | null>(focus);
  const [pos, setPos] = useState<{ x: number; y: number; h: number } | null>(null);
  const [onlyDrift, setOnlyDrift] = useState(false);
  const byId = useMemo(() => Object.fromEntries(drifts.map((d) => [d.id, d])), [drifts]);

  useEffect(() => {
    if (!box.current) return;
    const activeIds = new Set(drifts.filter((d) => isActive(d.state)).map((d) => d.id));
    const hasDrift = (ids: string[]) => ids.some((i) => activeIds.has(i));
    const nodes = graph.nodes.filter((n) => !onlyDrift || hasDrift(n.drift_ids) || n.type === 'service');
    const ids = new Set(nodes.map((n) => n.id));
    const services = nodes.filter((n) => n.type === 'service');
    const docs = nodes.filter((n) => n.type === 'doc');
    const COL = 250;
    const layoutPos: Record<string, { x: number; y: number }> = {};
    services.forEach((sv, i) => {
      layoutPos[sv.id] = { x: i * COL, y: 160 };
      nodes.filter((n) => n.type === 'route' && n.service === sv.label)
        .forEach((r, j) => { layoutPos[r.id] = { x: i * COL, y: 240 + j * 64 }; });
    });
    const width = Math.max(1, services.length - 1) * COL;
    // Each doc sits above the services it describes; nudge apart docs that would overlap.
    const colOf = (name: string) => services.findIndex((sv) => sv.label === name);
    const placed = docs.map((d, i) => {
      const cols = (d.services ?? []).map(colOf).filter((c) => c >= 0);
      return { d, x: cols.length ? (cols.reduce((a, b) => a + b, 0) / cols.length) * COL : (i * width) / Math.max(1, docs.length - 1) };
    }).sort((a, b) => a.x - b.x);
    placed.forEach((p, i) => { if (i > 0 && p.x - placed[i - 1].x < 230) p.x = placed[i - 1].x + 230; layoutPos[p.d.id] = { x: p.x, y: 20 }; });
    const cy = cytoscape({
      container: box.current,
      elements: [
        ...nodes.map((n) => ({ data: { id: n.id, label: n.label, type: n.type, drift: hasDrift(n.drift_ids) ? 'yes' : 'no' } })),
        ...graph.edges.filter((e) => ids.has(e.source) && ids.has(e.target) && (e.kind !== 'drift' || activeIds.has(e.drift_id!)))
          .map((e) => ({ data: { id: e.id, source: e.source, target: e.target, kind: e.kind, sev: e.severity ?? '' } })),
      ],
      style: [
        { selector: 'node', style: { label: 'data(label)', 'font-family': '"IBM Plex Sans", system-ui, sans-serif', 'font-size': 13, 'font-weight': 600, color: C.ink, 'text-valign': 'center', 'text-halign': 'center', 'text-wrap': 'ellipsis', 'text-max-width': '200px', shape: 'round-rectangle', width: 'label', height: 32, 'padding-left': '12px', 'padding-right': '12px', 'border-width': 1.5 } as any },
        ...(['service', 'route', 'doc'] as const).map((t) => ({ selector: `node[type = "${t}"]`, style: { 'background-color': C[t].bg, 'border-color': C[t].border } })),
        { selector: 'node[type = "route"]', style: { 'font-family': '"IBM Plex Mono", ui-monospace, monospace', 'font-size': 11, 'font-weight': 500, 'text-max-width': '210px', height: 28 } as any },
        { selector: 'node[type = "doc"]', style: { 'text-max-width': '170px' } as any },
        { selector: 'node[drift = "yes"]', style: { 'border-color': C.drift, 'border-width': 3 } },
        { selector: 'node.expanded', style: { 'border-color': C.ink, 'border-width': 3 } },
        { selector: '.dim', style: { opacity: 0.25 } },
        { selector: 'edge', style: { width: 1.3, 'line-color': C.line, 'target-arrow-color': C.line, 'target-arrow-shape': 'triangle', 'arrow-scale': 0.8, 'curve-style': 'bezier' } },
        { selector: 'edge[kind = "exposes"]', style: { 'target-arrow-shape': 'none', opacity: 0.6 } },
        { selector: 'edge[kind = "calls"]', style: { 'line-color': C.accent, 'target-arrow-color': C.accent, width: 2 } },
        { selector: 'edge[kind = "event"]', style: { 'line-color': C.accent, 'target-arrow-color': C.accent, 'line-style': 'dotted', width: 2 } },
        { selector: 'edge[kind = "drift"]', style: { 'line-color': C.drift, 'target-arrow-color': C.drift, 'line-style': 'dashed', width: 2.5 } },
        { selector: 'edge[sev = "critical"]', style: { 'line-color': C.crit, 'target-arrow-color': C.crit } },
      ],
      layout: { name: 'null' } as any,
      minZoom: 0.25, maxZoom: 2.5, wheelSensitivity: 0.25,
    });
    // Columns: one per service, its routes stacked below it, docs in a row on top.
    // (A grid pass first: a preset layout alone leaves edges unrendered in Cytoscape 3.30.)
    cy.layout({ name: 'grid' }).run();
    cy.layout({ name: 'preset', positions: (n: any) => layoutPos[n.id()] ?? { x: 0, y: 0 }, fit: true, padding: 50 } as any).run();
    const update = () => {
      const id = cy.scratch('_x') as string | null;
      const n = id ? cy.$id(id) : null;
      if (!n || !n.length) return setPos(null);
      const p = n.renderedPosition();
      setPos({ x: p.x, y: p.y, h: n.renderedOuterHeight() });
    };
    cy.on('pan zoom position resize', update);
    cy.on('tap', 'node', (e) => setExpanded((cur) => (cur === e.target.id() ? null : e.target.id())));
    cy.on('tap', (e) => { if (e.target === cy) setExpanded(null); });
    (cy as any)._update = update;
    cyRef.current = cy;
    return () => cy.destroy();
  }, [graph, drifts, onlyDrift]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.scratch('_x', expanded);
    cy.elements().removeClass('expanded dim');
    if (expanded && cy.$id(expanded).length) {
      const n = cy.$id(expanded);
      n.addClass('expanded');
      cy.elements().not(n.closedNeighborhood()).addClass('dim');
    }
    (cy as any)._update?.();
  }, [expanded, graph, drifts, onlyDrift]);

  useEffect(() => {
    if (!focus) return;
    setExpanded(focus);
    const cy = cyRef.current;
    const n = cy?.$id(focus);
    if (cy && n?.length) cy.animate({ center: { eles: n }, zoom: Math.max(cy.zoom(), 1) }, { duration: 250 });
  }, [focus]);

  const node = graph.nodes.find((n) => n.id === expanded);
  const nodeDrifts = (node?.drift_ids ?? []).map((i) => byId[i]).filter(Boolean);

  return (
    <div className="relative h-full overflow-hidden bg-canvas">
      <div className="absolute left-4 top-4 z-10 flex items-center gap-1 rounded-lg border border-line bg-panel p-1 text-[12.5px]">
        <button aria-pressed={!onlyDrift} onClick={() => setOnlyDrift(false)} className={`rounded-md px-2.5 py-1 ${!onlyDrift ? 'bg-ink text-onink' : 'text-muted'}`}>Everything</button>
        <button aria-pressed={onlyDrift} onClick={() => setOnlyDrift(true)} className={`rounded-md px-2.5 py-1 ${onlyDrift ? 'bg-ink text-onink' : 'text-muted'}`}>Only drift</button>
      </div>
      <button aria-label="Fit to screen" title="Fit to screen" onClick={() => cyRef.current?.fit(undefined, 40)} className="absolute right-4 top-4 z-10 rounded-lg border border-line bg-panel p-2 hover:bg-sunken"><Maximize2 size={15} /></button>
      <div ref={box} className="absolute inset-0" />

      {node && pos && (
        <div className="absolute z-20 w-[290px] rounded-xl border border-ink bg-panel shadow-[0_12px_32px_rgba(0,0,0,0.5)]" style={{ left: Math.max(8, pos.x - 145), top: pos.y + pos.h / 2 + 10 }}>
          <div className="flex items-start justify-between gap-2 px-3.5 pt-3">
            <div className="min-w-0">
              <div className="eyebrow">{TYPE[node.type]}</div>
              <div className="break-words font-semibold leading-snug">{node.label}</div>
            </div>
            <button aria-label="Collapse" onClick={() => setExpanded(null)} className="rounded p-1 text-muted hover:bg-sunken"><X size={15} /></button>
          </div>
          <div className="flex flex-col gap-2 px-3.5 pb-3.5 pt-1.5 text-[12.5px]">
            <div className="text-muted">{node.detail}</div>
            {nodeDrifts.map((d) => (
              <button key={d.id} onClick={() => onOpenDrift(d.id)} className="flex items-center gap-2 rounded-md border border-line px-2 py-1.5 text-left hover:border-ink">
                <span className={`chip ${SEV_CHIP[d.severity]}`}>{d.severity.toUpperCase()}</span>
                <span className="min-w-0 truncate">{d.title}</span>
              </button>
            ))}
            {nodeDrifts.length === 0 && <div className="text-ok">No drift here</div>}
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute bottom-4 left-4 flex flex-wrap gap-x-4 gap-y-1 rounded-lg border border-line bg-panel/95 px-3 py-2 text-[12px] text-muted">
        <span>Click a node to expand it</span>
        <span className="flex items-center gap-1.5"><span className="w-5 border-t-2 border-dashed border-drift" />Drift</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 bg-accent" />Calls</span>
        <span className="flex items-center gap-1.5"><span className="w-5 border-t-2 border-dotted border-accent" />Event</span>
      </div>
    </div>
  );
}
