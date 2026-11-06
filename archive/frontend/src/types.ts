export type NodeType = 'team' | 'service' | 'api' | 'document' | 'section';
export type EdgeType = 'owns' | 'specifies' | 'implements' | 'calls' | 'drift_flagged' | 'references';
export type DriftSeverity = 'critical' | 'medium' | 'warning';

export interface WorkspaceInfo {
  workspace_name: string;
  workspace_path: string;
  services_count: number;
  docs_count: number;
  inferred_mode: string;
  zero_hardcoding: boolean;
}

export interface DataModelField {
  name: string;
  type_annotation: string;
  is_required: boolean;
  default_value?: string;
}

export interface DataModelSchema {
  name: string;
  docstring?: string;
  fields: DataModelField[];
}

export interface ExecutionStep {
  step_number: number;
  title: string;
  description: string;
  component: string;
}

export interface ServiceBlueprint {
  service_id: string;
  name: string;
  mission: string;
  tech_stack: string[];
  execution_pipeline: ExecutionStep[];
  models: DataModelSchema[];
  files: string[];
}

export interface MemoryNode {
  id: string;
  label: string;
  subtitle?: string;
  type: NodeType;
  properties: Record<string, any>;
  team_id?: string;
  service_id?: string;
  file_path?: string;
  status: 'active' | 'drift' | 'stale';
}

export interface MemoryEdge {
  id: string;
  source: string;
  target: string;
  relationship: EdgeType;
  confidence: number;
  properties: Record<string, any>;
}

export interface DriftAlert {
  id: string;
  rule_id: string;
  evaluator_origin: 'ast_rule' | 'llm_semantic';
  severity: DriftSeverity;
  title: string;
  doc_spec: string;
  code_reality: string;
  doc_id: string;
  service_id: string;
  api_id?: string;
  suggested_patch?: string;
  status: 'open' | 'resolved' | 'dismissed';
}

export interface FleetHDSpec {
  id: string;
  title: string;
  doc_path: string;
  owning_team: string;
  collaborating_team?: string;
  objective: string;
  user_stories: string[];
  scope_in: string[];
  scope_out: string[];
  success_criteria: string[];
  technical_changes: string[];
  raw_markdown: string;
}

export interface GraphResponse {
  nodes: MemoryNode[];
  edges: MemoryEdge[];
  drift_alerts: DriftAlert[];
  doc_coverage_pct: number;
  active_drift_count: number;
  total_entities_count: number;
  cross_team_services_count: number;
}

export interface NodeDetailsResponse {
  node: MemoryNode;
  spec?: FleetHDSpec;
  blueprint?: ServiceBlueprint;
  service_files?: Record<string, string>;
  code_snippet?: string;
  drift_alerts: DriftAlert[];
}
