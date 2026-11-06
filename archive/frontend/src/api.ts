import { GraphResponse, NodeDetailsResponse, EdgeType, WorkspaceInfo } from './types';

const API_BASE = '/api';

export async function fetchWorkspaceInfo(): Promise<WorkspaceInfo> {
  const res = await fetch(`${API_BASE}/workspace`);
  if (!res.ok) throw new Error('Failed to load workspace info');
  return res.json();
}

export async function fetchGraph(): Promise<GraphResponse> {
  const res = await fetch(`${API_BASE}/graph`);
  if (!res.ok) throw new Error('Failed to load memory graph');
  return res.json();
}

export async function fetchNodeDetails(nodeId: string): Promise<NodeDetailsResponse> {
  const res = await fetch(`${API_BASE}/nodes/${encodeURIComponent(nodeId)}`);
  if (!res.ok) throw new Error('Failed to load node details');
  return res.json();
}

export async function createEdge(source: string, target: string, relationship: EdgeType, notes?: string) {
  const res = await fetch(`${API_BASE}/graph/edge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, target, relationship, notes }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Failed to create edge');
  }
  return res.json();
}

export async function reconcileDriftAlert(alertId: string) {
  const res = await fetch(`${API_BASE}/drift/reconcile/${encodeURIComponent(alertId)}`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to reconcile drift alert');
  return res.json();
}

export async function rebuildGraph(): Promise<GraphResponse> {
  const res = await fetch(`${API_BASE}/graph/rebuild`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to rebuild graph');
  return res.json();
}
