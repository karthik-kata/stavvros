from fastapi.testclient import TestClient

from stavvros_drift.api import create_app


R = "/api/repos/default"


def test_api_flow(container):
    api = TestClient(create_app(container))
    report = api.post(f"{R}/scan").json()
    assert report["llm_backend"].startswith("mock")
    items = api.get(f"{R}/drifts").json()
    first = items[0]
    assert first["severity"] == "critical"
    detail = api.get(f"{R}/drifts/{first['id']}").json()
    assert detail["finding"]["actions"][0]["primary"]
    r = api.post(f"{R}/drifts/{first['id']}/decision", json={"action": "dismiss"})
    assert r.status_code == 409  # a reason is required
    r = api.post(f"{R}/drifts/{first['id']}/decision", json={"action": "update_code"}).json()
    assert r["state"] == "change_drafted"
    assert api.post(f"{R}/drifts/{first['id']}/send", json={}).json()["state"] == "in_review"
    assert api.post(f"{R}/drifts/{first['id']}/approve").json()["state"] == "resolved"
    g = api.get(f"{R}/graph").json()
    assert any(e["kind"] == "drift" for e in g["edges"])
    ctx = api.post(f"{R}/context", json={"question": "Add a refund button to the order history page"}).json()
    assert ctx["drift_warnings"] and "payments" in ctx["services"]
    assert api.get(f"{R}/drifts/nope").status_code == 404
