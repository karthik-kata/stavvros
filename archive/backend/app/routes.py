import os
from fastapi import APIRouter, HTTPException
from typing import Dict, Any
from app.config import WORKSPACE_PATH, get_workspace_name, get_workspace_path
from app.models import GraphResponse, MemoryNode, AddEdgeRequest, DriftAlert
from app.graph_builder import KnowledgeGraphBuilder

router = APIRouter(prefix="/api")

graph_builder = KnowledgeGraphBuilder(WORKSPACE_PATH)

# Initial build
graph_builder.build()

@router.get("/workspace")
def get_workspace_info():
    """Returns active workspace metadata and inference mode."""
    return {
        "workspace_name": get_workspace_name(),
        "workspace_path": get_workspace_path(),
        "services_count": len(graph_builder.service_blueprints),
        "docs_count": len(graph_builder.specs),
        "inferred_mode": "ast_and_markdown",
        "zero_hardcoding": True
    }

@router.get("/graph", response_model=GraphResponse)
def get_graph():
    """Returns the complete Knowledge Graph, active drift alerts, and KPIs."""
    return graph_builder.get_graph_response()

@router.get("/nodes/{node_id}")
def get_node_details(node_id: str):
    """Retrieves deep metadata, Service Blueprint, FleetHD specs, code snippets, or drift diffs."""
    if node_id not in graph_builder.graph.nodes:
        raise HTTPException(status_code=404, detail="Node not found")

    node_data = graph_builder.graph.nodes[node_id]["data"]
    node = MemoryNode(**node_data)

    details: Dict[str, Any] = {"node": node}

    # 1. If service node, attach Service Blueprint & File Sources
    if node.type == "service":
        service_name = node.id.replace("service-", "")
        blueprint = graph_builder.service_blueprints.get(service_name)
        if blueprint:
            details["blueprint"] = blueprint.model_dump()

        # Read service source code files dynamically
        service_dir = os.path.join(WORKSPACE_PATH, "services", service_name)
        if not os.path.exists(service_dir):
            service_dir = os.path.join(WORKSPACE_PATH, service_name)

        service_files: Dict[str, str] = {}
        if os.path.exists(service_dir):
            for root, _, files in os.walk(service_dir):
                for f in files:
                    if f.endswith(".py"):
                        fpath = os.path.join(root, f)
                        with open(fpath, "r", encoding="utf-8") as sfile:
                            service_files[f] = sfile.read()
        details["service_files"] = service_files

    # 2. If document node, attach FleetHD parsed spec & raw markdown
    if node.type == "document":
        spec_id = node.id.replace("doc-", "")
        if spec_id in graph_builder.specs:
            details["spec"] = graph_builder.specs[spec_id].model_dump()

    # 3. If code API node, attach file source snippet
    if node.type == "api" and node.file_path and os.path.exists(node.file_path):
        with open(node.file_path, "r", encoding="utf-8") as f:
            code_lines = f.readlines()
        line = node.properties.get("line_number", 1)
        start = max(0, line - 4)
        end = min(len(code_lines), line + 15)
        details["code_snippet"] = "".join(code_lines[start:end])

    # 4. Find connected drift alerts
    related_alerts = [
        a for a in graph_builder.drift_alerts 
        if a.api_id == node.id or f"doc-{a.doc_id}" == node.id or f"service-{a.service_id}" == node.id
    ]
    details["drift_alerts"] = related_alerts

    return details

@router.post("/graph/edge")
def add_edge(req: AddEdgeRequest):
    """Creates a user-specified relationship edge in the graph."""
    if req.source not in graph_builder.graph.nodes:
        raise HTTPException(status_code=400, detail=f"Source node '{req.source}' not found")
    if req.target not in graph_builder.graph.nodes:
        raise HTTPException(status_code=400, detail=f"Target node '{req.target}' not found")

    edge = graph_builder.add_user_edge(req.source, req.target, req.relationship, req.notes)
    return {"status": "SUCCESS", "edge": edge}

@router.post("/drift/reconcile/{alert_id}")
def reconcile_drift(alert_id: str):
    """Reconciles a drift alert, turning the flagged edge into a verified relationship."""
    success = graph_builder.reconcile_drift(alert_id)
    if not success:
        raise HTTPException(status_code=404, detail="Drift alert not found")
    return {"status": "RESOLVED", "alert_id": alert_id}

@router.post("/graph/rebuild")
def rebuild_graph():
    """Forces dynamic re-scanning of the target workspace."""
    response = graph_builder.build()
    return response
