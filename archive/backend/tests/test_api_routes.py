from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_api_health():
    res = client.get("/")
    assert res.status_code == 200
    assert res.json()["status"] == "ONLINE"

def test_api_workspace_info():
    res = client.get("/api/workspace")
    assert res.status_code == 200
    data = res.json()
    assert "workspace_name" in data
    assert data["zero_hardcoding"] is True
    assert data["services_count"] >= 2
    assert data["docs_count"] >= 2

def test_api_get_graph():
    res = client.get("/api/graph")
    assert res.status_code == 200
    data = res.json()
    assert "nodes" in data
    assert "edges" in data
    assert "drift_alerts" in data
    assert data["doc_coverage_pct"] > 0
    assert len(data["nodes"]) >= 5

def test_api_get_node_details():
    res = client.get("/api/graph")
    nodes = res.json()["nodes"]
    doc_node = next((n for n in nodes if n["type"] == "document"), None)
    assert doc_node is not None

    node_res = client.get(f"/api/nodes/{doc_node['id']}")
    assert node_res.status_code == 200
    data = node_res.json()
    assert "node" in data
    assert "spec" in data

def test_api_add_edge_and_reconcile():
    res = client.get("/api/graph")
    data = res.json()
    alerts = data["drift_alerts"]
    assert len(alerts) > 0
    alert_id = alerts[0]["id"]

    # Reconcile drift
    rec_res = client.post(f"/api/drift/reconcile/{alert_id}")
    assert rec_res.status_code == 200
    assert rec_res.json()["status"] == "RESOLVED"

    # Add custom edge
    team_node = next((n for n in data["nodes"] if n["type"] == "team"), None)
    service_node = next((n for n in data["nodes"] if n["type"] == "service"), None)
    assert team_node is not None
    assert service_node is not None

    edge_res = client.post("/api/graph/edge", json={
        "source": team_node["id"],
        "target": service_node["id"],
        "relationship": "owns",
        "notes": "Verified ownership"
    })
    assert edge_res.status_code == 200
