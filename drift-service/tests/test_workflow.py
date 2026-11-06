"""Decisions persist, approved fixes are written to disk, and rescans agree."""
from stavvros_drift.container import Settings, build_container


def find(wf, prefix):
    return next(i for i in wf.list() if i.title.startswith(prefix))


def test_doc_fix_end_to_end(container):
    wf = container.workflow
    wf.scan()
    item = find(wf, "Refund window")
    rec = wf.decide(item.id, "update_doc")
    assert rec.state == "change_drafted"
    assert rec.change.hunks[0].add == ["- Customers can request a refund within 14 days of delivery."]
    wf.send(item.id)
    rec = wf.approve(item.id)
    assert rec.state == "resolved"
    prd = (container.settings.codebase / "docs/prd/refunds-self-service.md").read_text()
    assert "within 14 days" in prd
    assert all(not i.title.startswith("Refund window") or i.state == "resolved" for i in wf.list())


def test_code_fix_for_broken_call(container):
    wf = container.workflow
    wf.scan()
    item = find(wf, "Broken call")
    wf.decide(item.id, "update_code")
    wf.send(item.id)
    wf.approve(item.id)
    client = (container.settings.codebase / "services/checkout/app/clients/payments_client.py").read_text()
    assert '"/v2/refunds"' in client and '"/v1/refunds"' not in client
    assert not any(i.title.startswith("Broken call") and i.state != "resolved" for i in wf.list())


def test_dismissal_survives_rescan_and_restart(container, tmp_path):
    wf = container.workflow
    wf.scan()
    item = find(wf, "Order list limit")
    wf.decide(item.id, "dismiss", "Mobile app needs 100; doc update scheduled")
    wf.scan()
    assert find(wf, "Order list limit").state == "dismissed"
    again = build_container(Settings(codebase=container.settings.codebase, data_dir=container.settings.data_dir, cache_llm=False))
    again.workflow.scan()
    assert find(again.workflow, "Order list limit").state == "dismissed"


def test_issue_when_no_code_patch(container):
    wf = container.workflow
    wf.scan()
    item = find(wf, "RefundAccepted fields")
    rec = wf.decide(item.id, "update_code")
    assert rec.state == "issue_open" and rec.issue.team == "Payments Platform"


def test_reset_restores_files(container):
    wf = container.workflow
    wf.scan()
    item = find(wf, "Refund window")
    wf.decide(item.id, "update_doc"); wf.send(item.id); wf.approve(item.id)
    wf.reset()
    prd = (container.settings.codebase / "docs/prd/refunds-self-service.md").read_text()
    assert "within 30 days" in prd
    assert find(wf, "Refund window").state == "open"


def test_undocumented_routes_without_a_doc_create_one(container):
    wf = container.workflow
    wf.scan()
    for title in ("Undocumented route: POST /checkout/orders/{order_id}/pay", "Undocumented route: POST /checkout/orders/{order_id}/refund"):
        item = find(wf, title)
        wf.decide(item.id, "update_doc"); wf.send(item.id); wf.approve(item.id)
    doc = (container.settings.codebase / "docs/api/checkout-api.md").read_text()
    assert "/checkout/orders/{order_id}/pay" in doc and "/checkout/orders/{order_id}/refund" in doc
    assert not any("checkout/orders" in i.title and i.state != "resolved" for i in wf.list())
