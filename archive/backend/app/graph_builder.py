import os
import re
import ast
import networkx as nx
from typing import Dict, Any, List, Optional, Set
from app.models import (
    MemoryNode, MemoryEdge, FleetHDSpec, DocContract, 
    CodeEndpoint, DriftAlert, GraphResponse, DataModelSchema, ServiceBlueprint
)
from app.parsers.markdown_parser import MarkdownParser
from app.parsers.code_parser import CodeParser
from app.drift.detector import DriftEngineOrchestrator

def slugify(text: str) -> str:
    """Helper to convert names into clean URL/ID slugs."""
    cleaned = re.sub(r"\(.*?\)", "", text).strip()
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", cleaned.lower()).strip("-")
    return slug or "unassigned"

def normalize_team_name(text: str) -> str:
    """Strips channel/handle annotations like (#payments-core) for canonical team names."""
    cleaned = re.sub(r"\(.*?\)", "", text).strip()
    return cleaned or text.strip()

class KnowledgeGraphBuilder:
    """
    Builds and manages the in-memory NetworkX Knowledge Graph
    from source code AST and Markdown documentation files 100% dynamically
    with zero hardcoded static metadata.
    """

    def __init__(self, workspace_path: str):
        self.workspace_path = os.path.abspath(workspace_path)
        self.graph = nx.DiGraph()
        self.specs: Dict[str, FleetHDSpec] = {}
        self.doc_contracts: List[DocContract] = []
        self.code_endpoints: List[CodeEndpoint] = []
        self.drift_alerts: List[DriftAlert] = []
        self.user_edges: List[MemoryEdge] = []
        self.service_blueprints: Dict[str, ServiceBlueprint] = {}
        self.drift_orchestrator = DriftEngineOrchestrator()

    def build(self) -> GraphResponse:
        self.graph.clear()
        self.specs.clear()
        self.doc_contracts.clear()
        self.code_endpoints.clear()
        self.service_blueprints.clear()

        # 1. Parse Markdown Documentation Files Dynamically
        # Recursively search in workspace (prioritizing docs/ if present, or all .md)
        docs_dir = os.path.join(self.workspace_path, "docs")
        search_dirs = [docs_dir] if os.path.exists(docs_dir) else [self.workspace_path]

        for sdir in search_dirs:
            for root, _, files in os.walk(sdir):
                # Skip virtualenvs or node_modules if any exist inside workspace
                if any(ignored in root for ignored in (".venv", "node_modules", ".git", ".pytest_cache", "dist")):
                    continue
                for f in files:
                    if f.endswith(".md"):
                        path = os.path.join(root, f)
                        try:
                            spec, contracts = MarkdownParser.parse_file(path)
                            self.specs[spec.id] = spec
                            self.doc_contracts.extend(contracts)
                        except Exception as e:
                            print(f"[Warning] Failed to parse markdown doc {path}: {e}")

        # 2. Discover and Parse Code Files by Service Dynamically
        services_dir = os.path.join(self.workspace_path, "services")
        service_models_map: Dict[str, List[DataModelSchema]] = {}
        service_files_map: Dict[str, List[str]] = {}
        service_owner_map: Dict[str, str] = {}
        outgoing_calls_all: List[Dict[str, Any]] = []

        if os.path.exists(services_dir):
            for service_name in os.listdir(services_dir):
                service_path = os.path.join(services_dir, service_name)
                if os.path.isdir(service_path) and not service_name.startswith("."):
                    service_models_map[service_name] = []
                    service_files_map[service_name] = []
                    service_trees: List[ast.AST] = []

                    for root, _, files in os.walk(service_path):
                        for f in files:
                            if f.endswith(".py"):
                                fpath = os.path.join(root, f)
                                service_files_map[service_name].append(fpath)
                                endpoints, calls, models = CodeParser.parse_file(fpath, service_name)
                                self.code_endpoints.extend(endpoints)
                                outgoing_calls_all.extend(calls)
                                service_models_map[service_name].extend(models)

                                try:
                                    with open(fpath, "r", encoding="utf-8") as src_f:
                                        service_trees.append(ast.parse(src_f.read(), filename=fpath))
                                except Exception:
                                    pass

                    # Extract owner docstring if declared
                    owner = CodeParser.extract_team_owner(service_trees)
                    if owner:
                        service_owner_map[service_name] = owner
        else:
            # Fallback: scan root for top-level python packages
            for item in os.listdir(self.workspace_path):
                ipath = os.path.join(self.workspace_path, item)
                if os.path.isdir(ipath) and not item.startswith((".", "docs", "backend", "frontend")):
                    py_files = [os.path.join(ipath, f) for f in os.listdir(ipath) if f.endswith(".py")]
                    if py_files:
                        service_name = item
                        service_files_map[service_name] = py_files
                        service_models_map[service_name] = []
                        for fpath in py_files:
                            endpoints, calls, models = CodeParser.parse_file(fpath, service_name)
                            self.code_endpoints.extend(endpoints)
                            outgoing_calls_all.extend(calls)
                            service_models_map[service_name].extend(models)

        # 3. Build Dynamic Service Blueprints
        for service_name, sfiles in service_files_map.items():
            s_endpoints = [ep for ep in self.code_endpoints if ep.service_id == service_name]
            s_models = service_models_map.get(service_name, [])
            blueprint = CodeParser.build_service_blueprint(service_name, sfiles, s_models, s_endpoints)
            self.service_blueprints[service_name] = blueprint

        # 4. Detect Drift (100% Deterministic AST vs Markdown Contract Rules)
        context = {"specs": list(self.specs.values())}
        self.drift_alerts = self.drift_orchestrator.run_all(
            self.doc_contracts, 
            self.code_endpoints, 
            context
        )

        # 5. Discover Teams Dynamically from Docs & Code
        discovered_teams: Dict[str, str] = {}  # team_id -> team_label

        for spec in self.specs.values():
            if spec.owning_team:
                norm_name = normalize_team_name(spec.owning_team)
                tid = f"team-{slugify(norm_name)}"
                discovered_teams[tid] = norm_name
            if spec.collaborating_team:
                norm_name = normalize_team_name(spec.collaborating_team)
                tid = f"team-{slugify(norm_name)}"
                discovered_teams[tid] = norm_name

        for owner in service_owner_map.values():
            if owner:
                norm_name = normalize_team_name(owner)
                tid = f"team-{slugify(norm_name)}"
                discovered_teams[tid] = norm_name

        # If no teams found in docs or code, provide a default workspace team
        if not discovered_teams:
            discovered_teams["team-core"] = "Engineering Team"

        # Instantiate Team Nodes
        for tid, tlabel in discovered_teams.items():
            self._add_node(MemoryNode(
                id=tid,
                label=tlabel,
                subtitle=f"Engineering Team ({tlabel})",
                type="team",
                properties={"team_name": tlabel}
            ))

        # 6. Instantiate Service Nodes & OWNS Edges
        for sid, blueprint in self.service_blueprints.items():
            # Determine owning team dynamically
            owning_team_label = service_owner_map.get(sid)
            target_tid = None
            if owning_team_label:
                target_tid = f"team-{slugify(owning_team_label)}"
            else:
                # Try to associate team by name similarity in specs
                for tid, tlabel in discovered_teams.items():
                    if any(token in tlabel.lower() for token in sid.split("-")):
                        target_tid = tid
                        break
            if not target_tid or target_tid not in discovered_teams:
                target_tid = list(discovered_teams.keys())[0]

            # Dynamic subtitle from tech stack
            tech_tags = " • ".join(blueprint.tech_stack[:3])
            subtitle = f"⚡ {tech_tags}" if tech_tags else "Service Component"

            rel_repo = os.path.relpath(os.path.join(self.workspace_path, "services", sid), self.workspace_path)
            self._add_node(MemoryNode(
                id=f"service-{sid}",
                label=sid,
                subtitle=subtitle,
                type="service",
                team_id=target_tid,
                properties={
                    "repository": rel_repo,
                    "blueprint": blueprint.model_dump()
                }
            ))

            # OWNS edge (Team -> Service)
            self._add_edge(MemoryEdge(
                id=f"edge-owns-{target_tid}-{sid}",
                source=target_tid,
                target=f"service-{sid}",
                relationship="owns"
            ))

        # 7. Instantiate Document Nodes & OWNS Edges
        for spec_id, spec in self.specs.items():
            doc_node_id = f"doc-{spec_id}"
            owning_tid = f"team-{slugify(spec.owning_team)}" if spec.owning_team else list(discovered_teams.keys())[0]
            if owning_tid not in discovered_teams:
                owning_tid = list(discovered_teams.keys())[0]

            subtitle = "📄 Architecture Spec" if "architecture" in spec.title.lower() else "📄 FleetHD PRD Spec"
            self._add_node(MemoryNode(
                id=doc_node_id,
                label=spec.title,
                subtitle=subtitle,
                type="document",
                team_id=owning_tid,
                file_path=spec.doc_path,
                properties={
                    "objective": spec.objective,
                    "scope_in": spec.scope_in,
                    "scope_out": spec.scope_out,
                    "success_criteria": spec.success_criteria,
                    "technical_changes": spec.technical_changes
                }
            ))

            # OWNS edge (Team -> Doc)
            self._add_edge(MemoryEdge(
                id=f"edge-owns-{owning_tid}-{doc_node_id}",
                source=owning_tid,
                target=doc_node_id,
                relationship="owns"
            ))

        # 8. Instantiate Code API Endpoints & IMPLEMENTS Edges
        for ep in self.code_endpoints:
            ep_node_id = ep.id
            subtitle = f"HTTP {ep.status_code} • Async Event" if ep.is_async else f"HTTP {ep.status_code} • Sync REST"
            self._add_node(MemoryNode(
                id=ep_node_id,
                label=f"{ep.method} {ep.path}",
                subtitle=subtitle,
                type="api",
                service_id=ep.service_id,
                file_path=ep.file_path,
                properties={
                    "handler": ep.handler_name,
                    "line_number": ep.line_number,
                    "is_async": ep.is_async,
                    "status_code": ep.status_code,
                    "event_topic": ep.event_topic
                }
            ))

            # IMPLEMENTS edge (Service -> API)
            self._add_edge(MemoryEdge(
                id=f"edge-impl-service-{ep.service_id}-{ep_node_id}",
                source=f"service-{ep.service_id}",
                target=ep_node_id,
                relationship="implements"
            ))

        # 9. Dynamic Cross-Service CALLS Edges
        # Discovered from outgoing calls and URL host hints
        service_id_set = set(self.service_blueprints.keys())
        added_call_edges: Set[str] = set()

        for call in outgoing_calls_all:
            # Derive source service dynamically from file path
            rel_path = os.path.relpath(call["file_path"], self.workspace_path)
            parts = rel_path.split(os.sep)
            source_service = None
            if "services" in parts:
                idx = parts.index("services")
                if idx + 1 < len(parts):
                    source_service = parts[idx + 1]

            target_hint = call.get("target_hint", "")
            target_service = None

            # Check if target_hint directly names a service
            if target_hint in service_id_set:
                target_service = target_hint
            else:
                # Match against known service names
                for sid in service_id_set:
                    if sid != source_service and (sid in target_hint or target_hint in sid):
                        target_service = sid
                        break

            if source_service and target_service and source_service != target_service:
                edge_id = f"edge-calls-service-{source_service}-{target_service}"
                if edge_id not in added_call_edges:
                    added_call_edges.add(edge_id)
                    self._add_edge(MemoryEdge(
                        id=edge_id,
                        source=f"service-{source_service}",
                        target=f"service-{target_service}",
                        relationship="calls",
                        properties={"caller_file": call["file_path"], "line": call["line_number"]}
                    ))

        # 10. SPECIFIES & DRIFT_FLAGGED Edges
        alert_map = {a.api_id: a for a in self.drift_alerts if a.api_id}
        for contract in self.doc_contracts:
            doc_node_id = f"doc-{contract.doc_id}"
            matching_ep = next((ep for ep in self.code_endpoints if ep.path == contract.path and ep.method == contract.method), None)
            
            if matching_ep:
                self._add_edge(MemoryEdge(
                    id=f"edge-specifies-{doc_node_id}-{matching_ep.id}",
                    source=doc_node_id,
                    target=matching_ep.id,
                    relationship="specifies",
                    confidence=1.0
                ))
            else:
                # Find matching endpoint flagged for drift
                drift_ep = next((ep for ep in self.code_endpoints if ep.id in alert_map and contract.domain_tag in ep.path.lower()), None)
                if drift_ep:
                    alert = alert_map[drift_ep.id]
                    self._add_edge(MemoryEdge(
                        id=f"edge-drift-{doc_node_id}-{drift_ep.id}",
                        source=doc_node_id,
                        target=drift_ep.id,
                        relationship="drift_flagged",
                        confidence=0.2,
                        properties={
                            "alert_id": alert.id,
                            "severity": alert.severity,
                            "title": alert.title,
                            "doc_spec": alert.doc_spec,
                            "code_reality": alert.code_reality
                        }
                    ))
                    if doc_node_id in self.graph.nodes:
                        self.graph.nodes[doc_node_id]["status"] = "drift"
                    if drift_ep.id in self.graph.nodes:
                        self.graph.nodes[drift_ep.id]["status"] = "drift"

        # Apply any manual user edges
        for uedge in self.user_edges:
            self._add_edge(uedge)

        return self.get_graph_response()

    def _add_node(self, node: MemoryNode):
        self.graph.add_node(node.id, data=node.model_dump())

    def _add_edge(self, edge: MemoryEdge):
        self.graph.add_edge(edge.source, edge.target, data=edge.model_dump())

    def add_user_edge(self, source: str, target: str, relationship: str, notes: Optional[str] = None) -> MemoryEdge:
        edge = MemoryEdge(
            id=f"user-edge-{source}-{target}-{relationship}",
            source=source,
            target=target,
            relationship=relationship,  # type: ignore
            confidence=1.0,
            properties={"manual": True, "notes": notes or ""}
        )
        self.user_edges.append(edge)
        self._add_edge(edge)
        return edge

    def reconcile_drift(self, alert_id: str) -> bool:
        """1-Click Reconciliation of a drift alert into a verified relationship edge."""
        alert = next((a for a in self.drift_alerts if a.id == alert_id), None)
        if not alert:
            return False

        alert.status = "resolved"

        # Update edges in graph
        for u, v in list(self.graph.edges()):
            edata = self.graph.edges[u, v]["data"]
            if edata.get("relationship") == "drift_flagged" and edata.get("properties", {}).get("alert_id") == alert_id:
                # Transform to verified specifies edge
                edata["relationship"] = "specifies"
                edata["confidence"] = 1.0
                edata["properties"]["reconciled"] = True
                self.graph.edges[u, v]["data"] = edata

        # Clear drift status on affected nodes if no other open alerts remain
        for nid in [f"doc-{alert.doc_id}", alert.api_id]:
            if nid and nid in self.graph.nodes:
                has_remaining = any(
                    a.status == "open" and (a.api_id == nid or f"doc-{a.doc_id}" == nid)
                    for a in self.drift_alerts
                )
                if not has_remaining:
                    self.graph.nodes[nid]["status"] = "active"

        return True

    def get_graph_response(self) -> GraphResponse:
        nodes = [MemoryNode(**d["data"]) for _, d in self.graph.nodes(data=True)]
        edges = [MemoryEdge(**d["data"]) for _, _, d in self.graph.edges(data=True)]

        # Calculate KPIs dynamically
        active_drifts = [a for a in self.drift_alerts if a.status == "open"]
        total_endpoints = len(self.code_endpoints)
        documented_count = sum(
            1 for ep in self.code_endpoints 
            if any(c.path == ep.path for c in self.doc_contracts)
        )
        doc_coverage = round((documented_count / total_endpoints * 100), 1) if total_endpoints > 0 else 0.0

        cross_team_services = len(set(
            e.source for e in edges if e.relationship == "calls"
        ))

        return GraphResponse(
            nodes=nodes,
            edges=edges,
            drift_alerts=active_drifts,
            doc_coverage_pct=doc_coverage,
            active_drift_count=len(active_drifts),
            total_entities_count=len(nodes),
            cross_team_services_count=cross_team_services
        )
