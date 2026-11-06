import os
import pytest
from app.parsers.markdown_parser import MarkdownParser
from app.parsers.code_parser import CodeParser
from app.drift.detector import DriftEngineOrchestrator
from app.graph_builder import KnowledgeGraphBuilder

WORKSPACE = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "stavvros-workspace"))

def test_markdown_parser():
    prd_path = os.path.join(WORKSPACE, "docs", "PRD-2025-Refund-Policy.md")
    assert os.path.exists(prd_path)

    spec, contracts = MarkdownParser.parse_file(prd_path)
    assert spec.id == "PRD-2025-Refund-Policy"
    assert "Checkout Team" in spec.owning_team
    assert len(spec.scope_in) > 0
    assert any("credit card" in s.lower() for s in spec.scope_in)
    assert any("cryptographic" in s.lower() for s in spec.scope_out)
    assert len(contracts) > 0
    
    refund_contract = next((c for c in contracts if "refund" in c.path.lower()), None)
    assert refund_contract is not None
    assert refund_contract.method == "POST"
    assert refund_contract.path == "/v1/refunds"

def test_code_parser_ast():
    payment_code = os.path.join(WORKSPACE, "services", "payment-service", "main.py")
    assert os.path.exists(payment_code)

    endpoints, outgoing, models = CodeParser.parse_file(payment_code, "payment-service")
    assert len(endpoints) >= 2
    assert len(models) >= 2  # ChargeRequest, RefundRequest

    refund_model = next((m for m in models if m.name == "RefundRequest"), None)
    assert refund_model is not None
    assert any(f.name == "order_id" for f in refund_model.fields)

    async_refund = next((ep for ep in endpoints if "/v2/refunds/async" in ep.path), None)
    assert async_refund is not None
    assert async_refund.method == "POST"
    assert async_refund.status_code == 202
    assert async_refund.is_async is True

def test_drift_detection_orchestrator():
    prd_path = os.path.join(WORKSPACE, "docs", "PRD-2025-Refund-Policy.md")
    payment_code = os.path.join(WORKSPACE, "services", "payment-service", "main.py")

    spec, contracts = MarkdownParser.parse_file(prd_path)
    endpoints, _, _ = CodeParser.parse_file(payment_code, "payment-service")

    orchestrator = DriftEngineOrchestrator()
    alerts = orchestrator.run_all(contracts, endpoints, {"specs": [spec]})

    assert len(alerts) > 0
    version_alert = next((a for a in alerts if "Version Drift" in a.title), None)
    assert version_alert is not None
    assert version_alert.severity == "critical"
    assert "/v1/refunds" in version_alert.doc_spec
    assert "/v2/refunds/async" in version_alert.code_reality

def test_knowledge_graph_builder():
    builder = KnowledgeGraphBuilder(WORKSPACE)
    response = builder.build()

    assert len(response.nodes) > 0
    assert len(response.edges) > 0
    assert response.doc_coverage_pct > 0.0

    # Verify service node has blueprint
    payment_node = next((n for n in response.nodes if n.id == "service-payment-service"), None)
    assert payment_node is not None
    assert "Kafka" in (payment_node.subtitle or "")
    assert "blueprint" in payment_node.properties

    # Verify drift edge is present
    drift_edges = [e for e in response.edges if e.relationship == "drift_flagged"]
    assert len(drift_edges) >= 1
    drift_edge = drift_edges[0]
    assert "PRD-2025-Refund-Policy" in drift_edge.source

    # Test manual edge addition
    teams = [n.id for n in response.nodes if n.type == "team"]
    assert len(teams) > 0
    new_edge = builder.add_user_edge(teams[0], "service-payment-service", "references", "Direct partnership")
    assert new_edge.relationship == "references"

    # Test drift reconciliation
    alert_id = drift_edge.properties.get("alert_id")
    assert alert_id is not None
    reconciled = builder.reconcile_drift(alert_id)
    assert reconciled is True

    # Re-check edge status
    edge_data = builder.graph.edges[drift_edge.source, drift_edge.target]["data"]
    assert edge_data["relationship"] == "specifies"
    assert edge_data["confidence"] == 1.0
