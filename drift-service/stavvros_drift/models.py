"""Data shapes shared by the extractors, the detector, the workflow and the API."""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

# --------------------------------------------------------------------------- #
# Extracted facts
# --------------------------------------------------------------------------- #

FactKind = Literal[
    "route", "model", "enum", "constant", "publish", "subscribe", "http_call", "guard"
]


class CodeFact(BaseModel):
    """One thing the AST says is true about the code."""

    id: str
    kind: FactKind
    service: str
    file: str            # path relative to the codebase root
    line: int            # 1-based
    end_line: int
    name: str            # symbol name, route "POST /v2/refunds", topic, ...
    data: dict[str, Any] = Field(default_factory=dict)
    tokens: list[str] = Field(default_factory=list)  # lower-case words used for retrieval


ClaimKind = Literal["endpoint", "enum", "event_produced", "event_consumed", "rule"]


class DocClaim(BaseModel):
    """One checkable statement in a document."""

    id: str
    kind: ClaimKind
    doc_path: str
    line: int
    section: str
    text: str
    data: dict[str, Any] = Field(default_factory=dict)
    source: Literal["parser", "llm"] = "parser"


class DocInfo(BaseModel):
    path: str
    title: str
    kind: str
    owner: str
    owner_role: str = ""
    team: str
    services: list[str]


# --------------------------------------------------------------------------- #
# Findings
# --------------------------------------------------------------------------- #

Severity = Literal["critical", "high", "medium", "low"]
Category = Literal["contract", "behavior", "events", "coverage", "integration"]
FindingKind = Literal[
    "endpoint_changed",
    "endpoint_missing",
    "status_changed",
    "fields_changed",
    "enum_changed",
    "event_not_produced",
    "event_not_consumed",
    "rule_mismatch",
    "undocumented_route",
    "broken_call",
]


class Excerpt(BaseModel):
    path: str
    start_line: int
    highlight: list[int]
    lines: list[str]


class Person(BaseModel):
    name: str
    role: str = ""
    team: str = ""


class SideRef(BaseModel):
    """The doc side or the code side of a finding."""

    path: str
    line: int
    label: str          # doc title or "service · symbol"
    owner: Person
    excerpt: Excerpt


class Hunk(BaseModel):
    line: int
    remove: list[str]
    add: list[str]


class ProposedChange(BaseModel):
    target: Literal["doc", "code"]
    path: str
    hunks: list[Hunk]
    reviewer: Person
    notes: list[str] = Field(default_factory=list)
    creates_file: bool = False


class Detection(BaseModel):
    """How the finding was produced: shown under 'Details' in the UI."""

    engine: Literal["ast", "ast+llm"]
    rule: str
    confidence: float
    reasoning: str = ""
    fact_ids: list[str] = Field(default_factory=list)
    claim_id: Optional[str] = None
    llm_tasks: list[str] = Field(default_factory=list)


class Action(BaseModel):
    id: Literal["update_doc", "update_code", "dismiss"]
    label: str
    primary: bool = False


class Finding(BaseModel):
    id: str                      # stable fingerprint, survives rescans
    kind: FindingKind
    category: Category
    severity: Severity
    title: str                   # level 0: one line
    doc_value: str               # level 1: the two values side by side
    code_value: str
    impact: str                  # level 1: one sentence
    service: str
    doc: Optional[SideRef] = None
    code: Optional[SideRef] = None
    related: Optional[SideRef] = None   # e.g. the route a broken call should have used
    callers: list[str] = Field(default_factory=list)
    detection: Detection
    actions: list[Action]
    fixes: dict[str, Optional[ProposedChange]] = Field(default_factory=dict)  # by action id


class VerifiedClaim(BaseModel):
    claim: DocClaim
    doc_title: str
    evidence: str
    engine: Literal["ast", "ast+llm"]


# --------------------------------------------------------------------------- #
# Workflow
# --------------------------------------------------------------------------- #

DriftState = Literal["open", "change_drafted", "in_review", "issue_open", "resolved", "dismissed"]


class TimelineEvent(BaseModel):
    at: str
    label: str
    detail: str = ""
    pending: bool = False


class Issue(BaseModel):
    title: str
    team: str
    body: str


class DriftRecord(BaseModel):
    """A finding plus what people have done about it. What the API returns."""

    finding: Finding
    state: DriftState = "open"
    first_seen: str
    decision: Optional[str] = None
    decided_by: Optional[Person] = None
    reason: Optional[str] = None
    change: Optional[ProposedChange] = None
    issue: Optional[Issue] = None
    timeline: list[TimelineEvent] = Field(default_factory=list)


class DriftListItem(BaseModel):
    """Level 0: what the inbox shows."""

    id: str
    title: str
    severity: Severity
    category: Category
    state: DriftState
    service: str
    doc_title: Optional[str]
    doc_value: str
    code_value: str
    engine: Literal["ast", "ast+llm"]
    first_seen: str


class ScanReport(BaseModel):
    scanned_at: str
    duration_ms: int
    codebase: str
    llm_backend: str
    files_parsed: int
    docs_parsed: int
    facts: dict[str, int]
    claims: dict[str, int]
    llm_calls: dict[str, int]
    findings: dict[str, int]
    verified_claims: int


class RepoInfo(BaseModel):
    """A repository Stavvros watches. `source` is a folder on this machine ('path') or a git clone ('git')."""
    id: str
    name: str
    source: str
    location: str
    demo: bool = False
    added_at: str
    last_scanned: Optional[str] = None
    open_drifts: Optional[int] = None
    error: Optional[str] = None
