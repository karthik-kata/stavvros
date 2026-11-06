from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any, Literal

NodeType = Literal["team", "service", "api", "document", "section"]
EdgeType = Literal["owns", "specifies", "implements", "calls", "drift_flagged", "references"]
DriftSeverity = Literal["critical", "medium", "warning"]

class DataModelField(BaseModel):
    name: str
    type_annotation: str
    is_required: bool = True
    default_value: Optional[str] = None

class DataModelSchema(BaseModel):
    name: str
    docstring: Optional[str] = None
    fields: List[DataModelField] = Field(default_factory=list)

class ExecutionStep(BaseModel):
    step_number: int
    title: str
    description: str
    component: str

class ServiceBlueprint(BaseModel):
    service_id: str
    name: str
    mission: str
    tech_stack: List[str] = Field(default_factory=list)
    execution_pipeline: List[ExecutionStep] = Field(default_factory=list)
    models: List[DataModelSchema] = Field(default_factory=list)
    files: List[str] = Field(default_factory=list)

class MemoryNode(BaseModel):
    id: str
    label: str
    subtitle: Optional[str] = None
    type: NodeType
    properties: Dict[str, Any] = Field(default_factory=dict)
    team_id: Optional[str] = None
    service_id: Optional[str] = None
    file_path: Optional[str] = None
    status: Literal["active", "drift", "stale"] = "active"

class MemoryEdge(BaseModel):
    id: str
    source: str
    target: str
    relationship: EdgeType
    confidence: float = 1.0
    properties: Dict[str, Any] = Field(default_factory=dict)

class DocContract(BaseModel):
    id: str
    doc_id: str
    doc_path: str
    line_number: int = 1
    method: str
    path: str
    is_sync: bool = True
    service_id: str
    domain_tag: str
    raw_text: str = ""

class CodeEndpoint(BaseModel):
    id: str
    service_id: str
    file_path: str
    line_number: int
    method: str
    path: str
    is_async: bool = False
    event_topic: Optional[str] = None
    handler_name: str
    status_code: int = 200

class FleetHDSpec(BaseModel):
    id: str
    title: str
    doc_path: str
    owning_team: str
    collaborating_team: Optional[str] = None
    objective: str
    user_stories: List[str] = Field(default_factory=list)
    scope_in: List[str] = Field(default_factory=list)
    scope_out: List[str] = Field(default_factory=list)
    success_criteria: List[str] = Field(default_factory=list)
    technical_changes: List[str] = Field(default_factory=list)
    raw_markdown: str

class DriftAlert(BaseModel):
    id: str
    rule_id: str
    evaluator_origin: Literal["ast_rule", "llm_semantic"] = "ast_rule"
    severity: DriftSeverity
    title: str
    doc_spec: str
    code_reality: str
    doc_id: str
    service_id: str
    api_id: Optional[str] = None
    suggested_patch: Optional[str] = None
    status: Literal["open", "resolved", "dismissed"] = "open"

class GraphResponse(BaseModel):
    nodes: List[MemoryNode]
    edges: List[MemoryEdge]
    drift_alerts: List[DriftAlert]
    doc_coverage_pct: float
    active_drift_count: int
    total_entities_count: int
    cross_team_services_count: int

class AddEdgeRequest(BaseModel):
    source: str
    target: str
    relationship: EdgeType
    notes: Optional[str] = None
