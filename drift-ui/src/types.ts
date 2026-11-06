// Mirrors drift-service/stavvros_drift/models.py

export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type Category = 'contract' | 'behavior' | 'events' | 'coverage' | 'integration';
export type DriftState = 'open' | 'change_drafted' | 'in_review' | 'issue_open' | 'resolved' | 'dismissed';
export type Engine = 'ast' | 'ast+llm';
export type ActionId = 'update_doc' | 'update_code' | 'dismiss';

export interface Person { name: string; role: string; team: string }
export interface Excerpt { path: string; start_line: number; highlight: number[]; lines: string[] }
export interface SideRef { path: string; line: number; label: string; owner: Person; excerpt: Excerpt }
export interface Hunk { line: number; remove: string[]; add: string[] }
export interface ProposedChange { target: 'doc' | 'code'; path: string; hunks: Hunk[]; reviewer: Person; notes: string[]; creates_file: boolean }
export interface Detection {
  engine: Engine; rule: string; confidence: number; reasoning: string;
  fact_ids: string[]; claim_id: string | null; llm_tasks: string[];
}
export interface Action { id: ActionId; label: string; primary: boolean }

export interface Finding {
  id: string; kind: string; category: Category; severity: Severity;
  title: string; doc_value: string; code_value: string; impact: string; service: string;
  doc: SideRef | null; code: SideRef | null; related: SideRef | null; callers: string[];
  detection: Detection; actions: Action[]; fixes: Partial<Record<ActionId, ProposedChange | null>>;
}

export interface TimelineEvent { at: string; label: string; detail: string; pending: boolean }
export interface Issue { title: string; team: string; body: string }

export interface DriftRecord {
  finding: Finding; state: DriftState; first_seen: string;
  decision: ActionId | null; decided_by: Person | null; reason: string | null;
  change: ProposedChange | null; issue: Issue | null; timeline: TimelineEvent[];
}

export interface DriftListItem {
  id: string; title: string; severity: Severity; category: Category; state: DriftState;
  service: string; doc_title: string | null; doc_value: string; code_value: string; engine: Engine; first_seen: string;
}

export interface ScanReport {
  scanned_at: string; duration_ms: number; codebase: string; llm_backend: string;
  files_parsed: number; docs_parsed: number;
  facts: Record<string, number>; claims: Record<string, number>; llm_calls: Record<string, number>;
  findings: Record<string, number>; verified_claims: number;
}

export interface DocClaim { id: string; kind: string; doc_path: string; line: number; section: string; text: string; source: 'parser' | 'llm' }
export interface VerifiedClaim { claim: DocClaim; doc_title: string; evidence: string; engine: Engine }
export interface Claims { verified: VerifiedClaim[]; unverified: DocClaim[] }

export interface GraphNode { id: string; type: 'service' | 'route' | 'doc'; label: string; detail: string; service?: string; services?: string[]; drift_ids: string[] }
export interface GraphEdge { id: string; source: string; target: string; kind: 'exposes' | 'documents' | 'calls' | 'event' | 'drift'; label?: string; drift_id?: string; severity?: Severity }
export interface Graph { nodes: GraphNode[]; edges: GraphEdge[] }

export interface AssistantContext {
  question: string; services: string[]; answer: string[];
  drift_warnings: { drift_id: string; title: string; severity: Severity; doc_says: string; code_does: string; doc: string | null; guidance: string }[];
}
