import type { StavvrosApi } from './types';
import type { DriftItem, GraphResponse, NodeDetailsResponse, WorkspaceInfo } from '../types';
import { buildDriftItem } from '../lib/driftBuilder';
import { PEOPLE } from './mock/sampleData';

/**
 * Live backend (FastAPI). Endpoints marked NEW do not exist yet; see README-DEMO.md for the contract.
 * Until they do, the UI shows the error message from the server.
 */
const BASE = '/api';

async function j<T>(res: Response, what: string): Promise<T> {
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).detail; } catch { /* ignore */ }
    throw new Error(detail || `${what} failed (HTTP ${res.status})`);
  }
  return res.json();
}
const post = (path: string, body?: unknown) =>
  fetch(`${BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });

export const liveApi: StavvrosApi = {
  mode: 'live',
  getWorkspace: async () => j<WorkspaceInfo>(await fetch(`${BASE}/workspace`), 'Loading workspace'),
  getGraph: async () => j<GraphResponse>(await fetch(`${BASE}/graph`), 'Loading graph'),
  getNode: async (id) => j<NodeDetailsResponse>(await fetch(`${BASE}/nodes/${encodeURIComponent(id)}`), 'Loading node'),
  rescan: async () => j<GraphResponse>(await post('/graph/rebuild'), 'Re-scan'),
  createEdge: async (source, target, relationship, notes) => {
    await j(await post('/graph/edge', { source, target, relationship, notes }), 'Creating link');
  },

  // Until GET /api/drift exists, build items client-side from the graph and node details.
  listDrifts: async () => {
    const res = await fetch(`${BASE}/drift`);
    if (res.ok) return res.json();
    const graph = await liveApi.getGraph();
    const ids = new Set<string>();
    graph.drift_alerts.forEach((a) => {
      ids.add(`service-${a.service_id}`);
      if (a.doc_id !== 'none') ids.add(`doc-${a.doc_id}`);
      if (a.api_id) ids.add(a.api_id);
    });
    graph.edges.filter((e) => e.relationship === 'calls').forEach((e) => ids.add(e.source));
    const nodes: Record<string, NodeDetailsResponse> = {};
    await Promise.all([...ids].map(async (id) => { nodes[id] = await liveApi.getNode(id); }));
    return graph.drift_alerts.map((a) => buildDriftItem(a, graph, (id) => nodes[id], PEOPLE)) as DriftItem[];
  },
  // NEW: POST /api/drift/{id}/decision  { decision, reason }
  decideDrift: async (id, decision, reason) => j<DriftItem>(await post(`/drift/${encodeURIComponent(id)}/decision`, { decision, reason }), 'Saving decision'),
  // NEW: POST /api/drift/{id}/doc-fix   { edited_lines }
  sendDocFix: async (id, edited) => j<DriftItem>(await post(`/drift/${encodeURIComponent(id)}/doc-fix`, { edited_lines: edited }), 'Sending doc fix'),
  // Live mode closes drifts from a Git webhook; this falls back to the existing reconcile endpoint.
  simulateMerge: async (id) => {
    await j(await post(`/drift/reconcile/${encodeURIComponent(id)}`), 'Reconcile');
    return (await liveApi.listDrifts()).find((d) => d.alert.id === id)!;
  },
  // NEW: POST /api/drift/{id}/reopen
  reopenDrift: async (id) => j<DriftItem>(await post(`/drift/${encodeURIComponent(id)}/reopen`), 'Reopen'),
  // NEW: POST /api/context  { question }  (same payload the MCP tool returns)
  queryContext: async (question) => j(await post('/context', { question }), 'Query'),
};
