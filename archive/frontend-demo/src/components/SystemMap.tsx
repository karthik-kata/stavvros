import React, { useEffect, useMemo, useRef, useState } from 'react';
import cytoscape, { Core } from 'cytoscape';
import { Maximize2, ZoomIn, ZoomOut, X, Link2, PanelRight } from 'lucide-react';
import type { DriftItem, GraphResponse, MemoryNode } from '../types';
import { shortDocName } from '../lib/driftBuilder';
import { SeverityChip, StateChip, isActive } from './ui';

/** The heading shown on a node. Details only appear when the node is expanded. */
export function nodeHeading(n: MemoryNode): string {
  if (n.type === 'document') return shortDocName(n.id.replace('doc-', ''));
  return n.label;
}

const TYPE_LABEL: Record<string, string> = { team: 'Team', service: 'Service', api: 'API route', document: 'Document', section: 'Section' };

const COLORS = {
  ink: '#17202C',
  muted: '#5A6675',
  line: '#C9D1DB',
  team: { bg: '#EFEAF8', border: '#6B4FA0' },
  service: { bg: '#E3ECF6', border: '#2C5A88' },
  api: { bg: '#E3F1EA', border: '#2D7A55' },
  document: { bg: '#F7EDD4', border: '#966A10' },
  drift: '#C2570C',
  ok: '#1E7B4F',
};

export function SystemMap({
  graph,
  drifts,
  focusNodeId,
  onOpenDrift,
  onOpenDetails,
  onLinkNodes,
}: {
  graph: GraphResponse;
  drifts: DriftItem[];
  focusNodeId: string | null;
  onOpenDrift: (id: string) => void;
  onOpenDetails: (nodeId: string) => void;
  onLinkNodes: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const [expanded, setExpanded] = useState<string | null>(focusNodeId);
  const [pos, setPos] = useState<{ x: number; y: number; h: number } | null>(null);
  const [filters, setFilters] = useState({ team: true, service: true, api: true, document: true, driftOnly: false });

  const activeDrifts = useMemo(() => drifts.filter(isActive), [drifts]);
  const driftsByNode = useMemo(() => {
    const m: Record<string, DriftItem[]> = {};
    const add = (k: string | undefined, d: DriftItem) => k && (m[k] = [...(m[k] ?? []), d]);
    for (const d of drifts) {
      add(d.alert.api_id ?? undefined, d);
      if (d.alert.doc_id !== 'none') add(`doc-${d.alert.doc_id}`, d);
    }
    return m;
  }, [drifts]);

  // Build / rebuild the graph
  useEffect(() => {
    if (!ref.current) return;
    const nodeHasActive = (id: string) => (driftsByNode[id] ?? []).some(isActive);
    const nodes = graph.nodes.filter((n) => (filters as any)[n.type] !== false && (!filters.driftOnly || nodeHasActive(n.id)));
    const ids = new Set(nodes.map((n) => n.id));
    const edges = graph.edges.filter((e) => ids.has(e.source) && ids.has(e.target) && e.source !== e.target);
    const activeIds = new Set(activeDrifts.map((d) => d.alert.id));

    const cy = cytoscape({
      container: ref.current,
      elements: [
        ...nodes.map((n) => ({
          data: { id: n.id, label: nodeHeading(n), type: n.type, drift: nodeHasActive(n.id) ? 'yes' : 'no' },
        })),
        ...edges.map((e) => ({
          data: {
            id: e.id,
            source: e.source,
            target: e.target,
            rel: e.relationship === 'drift_flagged' && !activeIds.has(e.properties?.alert_id) ? 'specifies' : e.relationship,
            reconciled: e.properties?.reconciled ? 'yes' : 'no',
          },
        })),
      ],
      style: [
        {
          selector: 'node',
          style: {
            label: 'data(label)',
            'font-family': '"IBM Plex Sans", system-ui, sans-serif',
            'font-size': 14,
            'font-weight': 600,
            color: COLORS.ink,
            'text-valign': 'center',
            'text-halign': 'center',
            'text-wrap': 'ellipsis',
            'text-max-width': '210px',
            shape: 'round-rectangle',
            width: 'label',
            height: 34,
            'padding-left': '12px',
            'padding-right': '12px',
            'border-width': 1.5,
          } as any,
        },
        ...(['team', 'service', 'api', 'document'] as const).map((t) => ({
          selector: `node[type = "${t}"]`,
          style: { 'background-color': COLORS[t].bg, 'border-color': COLORS[t].border },
        })),
        { selector: 'node[type = "api"]', style: { 'font-family': '"IBM Plex Mono", ui-monospace, monospace', 'font-size': 12.5, 'font-weight': 500 } as any },
        { selector: 'node[drift = "yes"]', style: { 'border-color': COLORS.drift, 'border-width': 3 } },
        { selector: 'node.expanded', style: { 'border-color': COLORS.ink, 'border-width': 3, height: 36, 'font-size': 15 } as any },
        { selector: 'node.dim', style: { opacity: 0.35 } },
        {
          selector: 'edge',
          style: {
            width: 1.4,
            'line-color': COLORS.line,
            'target-arrow-color': COLORS.line,
            'target-arrow-shape': 'triangle',
            'arrow-scale': 0.8,
            'curve-style': 'bezier',
          },
        },
        { selector: 'edge[rel = "owns"]', style: { 'line-style': 'dashed' } },
        { selector: 'edge[rel = "calls"]', style: { 'line-color': '#2C5A88', 'target-arrow-color': '#2C5A88', width: 2 } },
        { selector: 'edge[reconciled = "yes"]', style: { 'line-color': COLORS.ok, 'target-arrow-color': COLORS.ok, width: 2.5 } },
        {
          selector: 'edge[rel = "drift_flagged"]',
          style: {
            'line-color': COLORS.drift,
            'target-arrow-color': COLORS.drift,
            width: 3,
            'line-style': 'dashed',
            label: 'drift',
            'font-size': 10,
            'font-weight': 600,
            color: COLORS.drift,
            'text-background-color': '#FFFFFF',
            'text-background-opacity': 1,
            'text-background-padding': '2px',
          } as any,
        },
        { selector: 'edge.dim', style: { opacity: 0.2 } },
        { selector: 'edge.hl', style: { width: 2.5, 'line-color': COLORS.muted, 'target-arrow-color': COLORS.muted, label: 'data(rel)', 'font-size': 10, color: COLORS.muted, 'text-background-color': '#fff', 'text-background-opacity': 1 } as any },
      ],
      layout: { name: 'breadthfirst', directed: true, spacingFactor: 0.95, padding: 40, roots: nodes.filter((n) => n.type === 'team').map((n) => n.id) } as any,
      wheelSensitivity: 0.25,
      minZoom: 0.3,
      maxZoom: 2.5,
    });

    const update = () => {
      const id = (cy.scratch('_expanded') as string) || null;
      if (!id) return setPos(null);
      const n = cy.$id(id);
      if (!n.length) return setPos(null);
      const p = n.renderedPosition();
      setPos({ x: p.x, y: p.y, h: n.renderedOuterHeight() });
    };
    cy.on('pan zoom position resize', update);
    cy.on('tap', 'node', (e) => setExpanded((cur) => (cur === e.target.id() ? null : e.target.id())));
    cy.on('tap', (e) => {
      if (e.target === cy) setExpanded(null);
    });
    cy.on('tap', 'edge[rel = "drift_flagged"]', (e) => setExpanded(e.target.source().id()));
    cyRef.current = cy;
    (window as any).__stavvrosCy = cy; // handy for demos and tests
    (cy as any)._update = update;
    return () => cy.destroy();
  }, [graph, drifts, filters]);

  // Expansion: highlight neighbourhood and position the card
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.scratch('_expanded', expanded);
    cy.elements().removeClass('expanded dim hl');
    if (expanded) {
      const n = cy.$id(expanded);
      if (n.length) {
        const hood = n.closedNeighborhood();
        n.addClass('expanded');
        cy.elements().not(hood).addClass('dim');
        n.connectedEdges().addClass('hl');
      }
    }
    (cy as any)._update?.();
  }, [expanded, graph, drifts, filters]);

  useEffect(() => {
    if (focusNodeId) {
      setExpanded(focusNodeId);
      const cy = cyRef.current;
      const n = cy?.$id(focusNodeId);
      if (cy && n?.length) cy.animate({ center: { eles: n }, zoom: Math.max(cy.zoom(), 1.1) }, { duration: 300 });
    }
  }, [focusNodeId]);

  const node = graph.nodes.find((n) => n.id === expanded);
  const nodeDrifts = expanded ? driftsByNode[expanded] ?? [] : [];
  const conns = expanded ? graph.edges.filter((e) => e.source === expanded || e.target === expanded) : [];

  return (
    <div className="relative h-full min-h-0 overflow-hidden bg-canvas">
      {/* Toolbar */}
      <div className="absolute left-4 right-4 top-4 z-10 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-line bg-panel p-1 text-[12px]">
          {(['team', 'service', 'api', 'document'] as const).map((t) => (
            <button
              key={t}
              aria-pressed={filters[t]}
              onClick={() => setFilters({ ...filters, [t]: !filters[t] })}
              className={`flex items-center gap-1.5 rounded-md px-2 py-1 ${filters[t] ? 'text-ink' : 'text-muted line-through'}`}
            >
              <span className="h-2.5 w-2.5 rounded-sm border" style={{ background: COLORS[t].bg, borderColor: COLORS[t].border }} />
              {TYPE_LABEL[t]}s
            </button>
          ))}
          <span className="mx-1 h-4 w-px bg-line" />
          <button
            aria-pressed={filters.driftOnly}
            onClick={() => setFilters({ ...filters, driftOnly: !filters.driftOnly })}
            className={`rounded-md px-2 py-1 ${filters.driftOnly ? 'bg-drift-soft text-drift' : 'text-muted'}`}
          >
            Only nodes with drift
          </button>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-line bg-panel p-1">
          <button className="rounded-md px-2 py-1 text-[12px] text-ink hover:bg-sunken" onClick={onLinkNodes}>
            <Link2 size={14} className="mr-1 inline" />
            Link nodes
          </button>
          <span className="mx-1 h-4 w-px bg-line" />
          <IconBtn label="Zoom in" onClick={() => cyRef.current?.zoom(cyRef.current.zoom() * 1.25)}><ZoomIn size={15} /></IconBtn>
          <IconBtn label="Zoom out" onClick={() => cyRef.current?.zoom(cyRef.current.zoom() / 1.25)}><ZoomOut size={15} /></IconBtn>
          <IconBtn label="Fit" onClick={() => cyRef.current?.fit(undefined, 40)}><Maximize2 size={15} /></IconBtn>
        </div>
      </div>

      <div ref={ref} className="absolute inset-0" />

      {/* Expanded node card */}
      {node && pos && (
        <div
          className="absolute z-20 w-[300px] rounded-lg border border-ink bg-panel shadow-[0_8px_24px_rgba(23,32,44,0.14)]"
          style={{ left: Math.max(8, pos.x - 150), top: pos.y + pos.h / 2 + 10 }}
          role="dialog"
          aria-label={`${nodeHeading(node)} details`}
        >
          <div className="flex items-start justify-between gap-2 border-b border-line px-3 py-2">
            <div className="min-w-0">
              <div className="eyebrow">{TYPE_LABEL[node.type]}</div>
              <div className="break-words font-semibold leading-snug">{node.label}</div>
            </div>
            <button aria-label="Collapse" className="rounded p-1 text-muted hover:bg-sunken hover:text-ink" onClick={() => setExpanded(null)}>
              <X size={15} />
            </button>
          </div>
          <div className="flex flex-col gap-2 px-3 py-2.5 text-[12.5px]">
            {node.subtitle && <div className="text-ink-soft">{node.subtitle.replace(/^[^\w]+/, '')}</div>}
            {node.file_path && <div className="break-all font-mono text-[11px] text-muted">{node.file_path.replace('stavvros-workspace/', '')}</div>}
            <div className="text-muted">
              {conns.length} connection{conns.length === 1 ? '' : 's'}:{' '}
              {Object.entries(conns.reduce<Record<string, number>>((a, e) => ({ ...a, [e.relationship]: (a[e.relationship] ?? 0) + 1 }), {}))
                .map(([k, v]) => `${v} ${k.replace('_', ' ')}`)
                .join(', ')}
            </div>
            {nodeDrifts.length > 0 && (
              <ul className="flex flex-col gap-1.5">
                {nodeDrifts.map((d) => (
                  <li key={d.alert.id}>
                    <button
                      onClick={() => onOpenDrift(d.alert.id)}
                      className="flex w-full flex-wrap items-center gap-1.5 rounded-md border border-line px-2 py-1.5 text-left hover:border-ink"
                    >
                      <SeverityChip severity={d.alert.severity} />
                      <span className="font-medium">{d.headline}</span>
                      {d.state !== 'open' && <StateChip state={d.state} />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button className="btn mt-1 self-start" onClick={() => onOpenDetails(node.id)}>
              <PanelRight size={14} /> Full details
            </button>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="pointer-events-none absolute bottom-4 left-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-line bg-panel/95 px-3 py-2 text-[12px] text-muted">
        <span>Click a node to expand it</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 border-t-2 border-dashed border-drift" /> Drift</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 bg-ok" /> Reconciled</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 bg-accent" /> Calls</span>
      </div>
    </div>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button aria-label={label} title={label} onClick={onClick} className="rounded-md p-1.5 text-ink hover:bg-sunken">
      {children}
    </button>
  );
}
