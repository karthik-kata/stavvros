import type { ActionId, RepoInfo, AssistantContext, Claims, DriftListItem, DriftRecord, Graph, ScanReport } from './types';

const BASE = '/api';

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { headers: { 'Content-Type': 'application/json' }, ...init });
  } catch {
    throw new Error('Cannot reach the drift service on port 8100. Start it with: uvicorn stavvros_drift.api:create_app --factory --port 8100');
  }
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).detail; } catch { /* not json */ }
    throw new Error(detail || `Request failed (HTTP ${res.status})`);
  }
  return res.json();
}
const post = <T>(path: string, body?: unknown) => call<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) });

const del = <T>(path: string) => call<T>(path, { method: 'DELETE' });

/** The repository every per-repo call is about. Set by App when the user picks one. */
let repo = '';
const r = (p: string) => `/repos/${encodeURIComponent(repo)}${p}`;

export const api = {
  setRepo: (id: string) => { repo = id; },
  repos: () => call<RepoInfo[]>('/repos'),
  addRepo: (location: string, name?: string) => post<RepoInfo>('/repos', { location, name: name || undefined }),
  removeRepo: (id: string) => del<{ ok: boolean }>(`/repos/${encodeURIComponent(id)}`),
  lastScan: () => call<ScanReport>(r('/scan')),
  scan: () => post<ScanReport>(r('/scan')),
  reset: () => post<ScanReport>(r('/reset')),
  drifts: () => call<DriftListItem[]>(r('/drifts')),
  drift: (id: string) => call<DriftRecord>(r(`/drifts/${id}`)),
  decide: (id: string, action: ActionId, reason?: string) => post<DriftRecord>(r(`/drifts/${id}/decision`), { action, reason }),
  send: (id: string, edited?: Record<number, string[]>) => post<DriftRecord>(r(`/drifts/${id}/send`), { edited }),
  approve: (id: string) => post<DriftRecord>(r(`/drifts/${id}/approve`)),
  reopen: (id: string) => post<DriftRecord>(r(`/drifts/${id}/reopen`)),
  claims: () => call<Claims>(r('/claims')),
  graph: () => call<Graph>(r('/graph')),
  context: (question: string) => post<AssistantContext>(r('/context'), { question }),
};
