import type { ActionId, AssistantContext, Claims, DriftListItem, DriftRecord, Graph, ScanReport } from './types';

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

export const api = {
  lastScan: () => call<ScanReport>('/scan'),
  scan: () => post<ScanReport>('/scan'),
  reset: () => post<ScanReport>('/reset'),
  drifts: () => call<DriftListItem[]>('/drifts'),
  drift: (id: string) => call<DriftRecord>(`/drifts/${id}`),
  decide: (id: string, action: ActionId, reason?: string) => post<DriftRecord>(`/drifts/${id}/decision`, { action, reason }),
  send: (id: string, edited?: Record<number, string[]>) => post<DriftRecord>(`/drifts/${id}/send`, { edited }),
  approve: (id: string) => post<DriftRecord>(`/drifts/${id}/approve`),
  reopen: (id: string) => post<DriftRecord>(`/drifts/${id}/reopen`),
  claims: () => call<Claims>('/claims'),
  graph: () => call<Graph>('/graph'),
  context: (question: string) => post<AssistantContext>('/context', { question }),
};
