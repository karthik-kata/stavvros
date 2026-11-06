import type {
  AssistantContext,
  DriftDecision,
  DriftItem,
  EdgeType,
  GraphResponse,
  NodeDetailsResponse,
  WorkspaceInfo,
} from '../types';

/**
 * The single contract between the UI and a backend.
 * `mock/` implements it in memory for demos; `live.ts` implements it against FastAPI.
 * Components only ever import `api` from `src/api/index.ts`.
 */
export interface StavvrosApi {
  mode: 'mock' | 'live';

  getWorkspace(): Promise<WorkspaceInfo>;
  getGraph(): Promise<GraphResponse>;
  getNode(nodeId: string): Promise<NodeDetailsResponse>;
  rescan(): Promise<GraphResponse>;
  createEdge(source: string, target: string, relationship: EdgeType, notes?: string): Promise<void>;

  /** Drift inbox: every alert with the context a person needs to judge it. */
  listDrifts(): Promise<DriftItem[]>;
  /** Record which side is correct. Returns the item with a proposed doc fix, a code issue, or dismissed. */
  decideDrift(id: string, decision: DriftDecision, reason?: string): Promise<DriftItem>;
  /** Send the proposed doc fix (optionally edited) to the doc owner for review. */
  sendDocFix(id: string, editedLines?: Record<number, string[]>): Promise<DriftItem>;
  /** Demo helper: the reviewer approves and the doc fix merges. Live mode gets this from a Git webhook. */
  simulateMerge(id: string): Promise<DriftItem>;
  /** Undo a decision during a demo. */
  reopenDrift(id: string): Promise<DriftItem>;

  /** What an AI assistant receives from Stavvros (the MCP query tool) for a question. */
  queryContext(question: string): Promise<AssistantContext>;

  /** Reset demo state (mock only). */
  reset?(): Promise<void>;
}
