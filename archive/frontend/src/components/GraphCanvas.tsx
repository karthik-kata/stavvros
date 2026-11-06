import React, { useEffect, useRef, useState } from 'react';
import cytoscape, { Core, EventObject } from 'cytoscape';
import { Search, ZoomIn, ZoomOut, Maximize2, AlertTriangle } from 'lucide-react';
import { MemoryNode, MemoryEdge } from '../types';

interface GraphCanvasProps {
  nodes: MemoryNode[];
  edges: MemoryEdge[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
}

export const GraphCanvas: React.FC<GraphCanvasProps> = ({
  nodes,
  edges,
  selectedNodeId,
  onSelectNode,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [layoutName, setLayoutName] = useState<'cose' | 'concentric' | 'breadthfirst'>('cose');
  const [activeFilters, setActiveFilters] = useState<Record<string, boolean>>({
    team: true,
    service: true,
    api: true,
    document: true,
    driftOnly: false,
  });

  // Initialize and update Cytoscape instance
  useEffect(() => {
    if (!containerRef.current) return;

    // Filter elements
    const visibleNodes = nodes.filter((n) => {
      if (activeFilters.driftOnly && n.status !== 'drift') return false;
      return activeFilters[n.type];
    });
    const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));

    const visibleEdges = edges.filter(
      (e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target)
    );

    const elements: cytoscape.ElementDefinition[] = [
      ...visibleNodes.map((n) => {
        let displayLabel = n.label;
        if (n.subtitle) {
          displayLabel = `${n.label}\n${n.subtitle}`;
        } else if (n.properties?.subtitle) {
          displayLabel = `${n.label}\n${n.properties.subtitle}`;
        }
        return {
          data: {
            id: n.id,
            label: displayLabel,
            type: n.type,
            status: n.status,
            team_id: n.team_id,
          },
        };
      }),
      ...visibleEdges.map((e) => ({
        data: {
          id: e.id,
          source: e.source,
          target: e.target,
          relationship: e.relationship,
          confidence: e.confidence,
          isDrift: e.relationship === 'drift_flagged',
        },
      })),
    ];

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            label: 'data(label)',
            color: '#f8fafc',
            'font-size': '11px',
            'font-weight': 'bold',
            'text-valign': 'center',
            'text-halign': 'center',
            'text-wrap': 'wrap',
            'text-max-width': '160px',
            width: 90,
            height: 50,
            'background-color': '#1e293b',
            'border-width': 2,
            'border-color': '#475569',
            'transition-property': 'background-color, border-color, width, height',
            'transition-duration': 0.2,
          },
        },
        // Team Nodes (Purple)
        {
          selector: 'node[type = "team"]',
          style: {
            'background-color': '#4a044e',
            'border-color': '#c084fc',
            'border-width': 2.5,
            shape: 'round-rectangle',
            width: 175,
            height: 60,
            'font-size': '10px',
          },
        },
        // Service Nodes (Blue) - Emphasized with larger card shape
        {
          selector: 'node[type = "service"]',
          style: {
            'background-color': '#0f172a',
            'border-color': '#38bdf8',
            'border-width': 2.5,
            shape: 'round-rectangle',
            width: 190,
            height: 64,
            'font-size': '10px',
          },
        },
        // Document Nodes (Amber)
        {
          selector: 'node[type = "document"]',
          style: {
            'background-color': '#78350f',
            'border-color': '#f59e0b',
            shape: 'barrel',
            width: 150,
            height: 52,
          },
        },
        // API Nodes (Emerald)
        {
          selector: 'node[type = "api"]',
          style: {
            'background-color': '#064e3b',
            'border-color': '#10b981',
            shape: 'ellipse',
            width: 130,
            height: 48,
          },
        },
        // Drift Flagged Node Badge
        {
          selector: 'node[status = "drift"]',
          style: {
            'border-color': '#ef4444',
            'border-width': 3.5,
            'border-style': 'solid',
          },
        },
        // Edge styling
        {
          selector: 'edge',
          style: {
            width: 2,
            'line-color': '#475569',
            'curve-style': 'bezier',
            'target-arrow-shape': 'triangle',
            'target-arrow-color': '#475569',
            'arrow-scale': 0.9,
            label: 'data(relationship)',
            'font-size': '9px',
            color: '#94a3b8',
            'text-background-opacity': 0.8,
            'text-background-color': '#0f172a',
            'text-background-padding': '2px',
            'text-background-shape': 'roundrectangle',
          },
        },
        // Edge: OWNS
        {
          selector: 'edge[relationship = "owns"]',
          style: {
            'line-color': '#a855f7',
            'target-arrow-color': '#a855f7',
            'line-style': 'dashed',
          },
        },
        // Edge: SPECIFIES
        {
          selector: 'edge[relationship = "specifies"]',
          style: {
            'line-color': '#f59e0b',
            'target-arrow-color': '#f59e0b',
            width: 2.5,
          },
        },
        // Edge: IMPLEMENTS
        {
          selector: 'edge[relationship = "implements"]',
          style: {
            'line-color': '#3b82f6',
            'target-arrow-color': '#3b82f6',
          },
        },
        // Edge: CALLS
        {
          selector: 'edge[relationship = "calls"]',
          style: {
            'line-color': '#10b981',
            'target-arrow-color': '#10b981',
            width: 2.5,
          },
        },
        // Edge: DRIFT_FLAGGED (Blinking Red)
        {
          selector: 'edge[isDrift]',
          style: {
            'line-color': '#ef4444',
            'target-arrow-color': '#ef4444',
            width: 3.5,
            'line-style': 'dashed',
            label: '⚠ DRIFT FLAGGED',
            color: '#f87171',
            'font-weight': 'bold',
            'font-size': '10px',
            'text-background-color': '#450a0a',
          },
        },
        // Selected Node Highlight
        {
          selector: 'node:selected',
          style: {
            'border-color': '#ffffff',
            'border-width': 4,
          },
        },
      ],
      layout: {
        name: layoutName,
        padding: 60,
        animate: true,
        animationDuration: 500,
      } as any,
    });

    // Click on node listener
    cy.on('tap', 'node', (evt: EventObject) => {
      const node = evt.target;
      onSelectNode(node.id());
    });

    // Click on edge with drift listener
    cy.on('tap', 'edge', (evt: EventObject) => {
      const edge = evt.target;
      if (edge.data('isDrift')) {
        onSelectNode(edge.source().id());
      }
    });

    cyRef.current = cy;

    return () => {
      cy.destroy();
    };
  }, [nodes, edges, activeFilters, layoutName]);

  // Handle external selection change
  useEffect(() => {
    if (!cyRef.current || !selectedNodeId) return;
    const cy = cyRef.current;
    cy.$(':selected').unselect();
    const targetNode = cy.$id(selectedNodeId);
    if (targetNode.length) {
      targetNode.select();
      cy.animate({
        center: { eles: targetNode },
        zoom: 1.4,
        duration: 400,
      });
    }
  }, [selectedNodeId]);

  // Handle search filter
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cyRef.current || !searchQuery.trim()) return;
    const cy = cyRef.current;
    const match = cy.nodes().filter((n) =>
      n.data('label').toLowerCase().includes(searchQuery.toLowerCase())
    );
    if (match.length > 0) {
      match.select();
      cy.animate({
        center: { eles: match.first() },
        zoom: 1.5,
        duration: 400,
      });
      onSelectNode(match.first().id());
    }
  };

  const handleZoomIn = () => cyRef.current?.zoom(cyRef.current.zoom() * 1.3);
  const handleZoomOut = () => cyRef.current?.zoom(cyRef.current.zoom() / 1.3);
  const handleFit = () => cyRef.current?.fit(undefined, 50);

  const toggleFilter = (key: string) => {
    setActiveFilters((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="relative w-full h-[calc(100vh-190px)] bg-slate-950 overflow-hidden flex flex-col">
      {/* Top Toolbar */}
      <div className="absolute top-4 left-4 right-4 z-20 flex flex-wrap items-center justify-between gap-3 pointer-events-none">
        {/* Left: Search & Filters */}
        <div className="flex items-center gap-2 pointer-events-auto bg-slate-900/90 backdrop-blur border border-slate-800 p-1.5 rounded-xl shadow-lg">
          <form onSubmit={handleSearch} className="flex items-center gap-2 px-2 py-1 bg-slate-950 rounded-lg border border-slate-800">
            <Search className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search API, doc, team..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none w-48"
            />
          </form>

          <div className="h-4 w-px bg-slate-800" />

          {/* Node Filters */}
          <div className="flex items-center gap-1 text-xs">
            <button
              onClick={() => toggleFilter('team')}
              className={`px-2.5 py-1 rounded-md font-medium transition ${
                activeFilters.team ? 'bg-purple-950/80 text-purple-300 border border-purple-500/30' : 'text-slate-500'
              }`}
            >
              🟣 Teams
            </button>
            <button
              onClick={() => toggleFilter('service')}
              className={`px-2.5 py-1 rounded-md font-medium transition ${
                activeFilters.service ? 'bg-blue-950/80 text-blue-300 border border-blue-500/30' : 'text-slate-500'
              }`}
            >
              🔵 Services
            </button>
            <button
              onClick={() => toggleFilter('api')}
              className={`px-2.5 py-1 rounded-md font-medium transition ${
                activeFilters.api ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/30' : 'text-slate-500'
              }`}
            >
              🟢 APIs
            </button>
            <button
              onClick={() => toggleFilter('document')}
              className={`px-2.5 py-1 rounded-md font-medium transition ${
                activeFilters.document ? 'bg-amber-950/80 text-amber-300 border border-amber-500/30' : 'text-slate-500'
              }`}
            >
              🟡 Documents
            </button>
            <button
              onClick={() => toggleFilter('driftOnly')}
              className={`px-2.5 py-1 rounded-md font-medium flex items-center gap-1 transition ${
                activeFilters.driftOnly ? 'bg-red-950 text-red-300 border border-red-500/50' : 'text-slate-500 hover:text-red-400'
              }`}
            >
              <AlertTriangle className="w-3 h-3 text-red-400" />
              <span>Drift Only</span>
            </button>
          </div>
        </div>

        {/* Right: Layout Switcher & Zoom */}
        <div className="flex items-center gap-2 pointer-events-auto bg-slate-900/90 backdrop-blur border border-slate-800 p-1.5 rounded-xl shadow-lg">
          <select
            value={layoutName}
            onChange={(e) => setLayoutName(e.target.value as any)}
            className="bg-slate-950 border border-slate-800 text-xs text-slate-300 px-2.5 py-1 rounded-lg focus:outline-none"
          >
            <option value="cose">Layout: Physics (COSE)</option>
            <option value="concentric">Layout: Concentric</option>
            <option value="breadthfirst">Layout: Hierarchical</option>
          </select>

          <div className="h-4 w-px bg-slate-800" />

          <button onClick={handleZoomIn} title="Zoom In" className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-300 transition">
            <ZoomIn className="w-4 h-4" />
          </button>
          <button onClick={handleZoomOut} title="Zoom Out" className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-300 transition">
            <ZoomOut className="w-4 h-4" />
          </button>
          <button onClick={handleFit} title="Fit to screen" className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-300 transition">
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Cytoscape Canvas Container */}
      <div ref={containerRef} className="w-full flex-1 cursor-grab active:cursor-grabbing" />

      {/* Legend Footer */}
      <div className="absolute bottom-4 left-6 z-10 bg-slate-900/80 backdrop-blur border border-slate-800/80 px-4 py-2 rounded-xl text-xs flex items-center gap-4 text-slate-400 shadow-md pointer-events-none">
        <span className="font-semibold text-slate-300">Legend:</span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-purple-500" /> Teams
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Services
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Code APIs
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> .md Documents
        </span>
        <span className="flex items-center gap-1.5 font-medium text-red-400">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" /> Code-Doc Drift
        </span>
      </div>
    </div>
  );
};
