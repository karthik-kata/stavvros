"""The planted drifts in acme-shop are found, and the true claims are verified."""


def by_kind(findings):
    out = {}
    for f in findings:
        out.setdefault(f.kind, []).append(f)
    return out


def test_finds_every_planted_drift(container):
    res = container.workflow.scan()
    titles = {f.title for f in res.findings}
    assert "Refund window: 30 days → 14 days" in titles
    assert "Partial refunds: enabled → disabled" in titles
    assert "Login rate limit: 5 per minute → 10 per minute" in titles
    assert "Order list limit: 50 → 100" in titles
    assert "Route renamed: /cancel → /void" in titles
    k = by_kind(res.findings)
    assert k["fields_changed"][0].doc_value == "estimated_completion"
    assert k["enum_changed"][0].code_value == "VOIDED, REFUNDED"
    assert k["event_not_consumed"][0].doc_value == "listens to payments.refund.requested"
    assert k["broken_call"][0].code_value == "POST /v2/refunds"
    assert k["broken_call"][0].severity == "critical"
    impersonate = next(f for f in k["undocumented_route"] if "impersonate" in f.code_value)
    assert impersonate.severity == "high"
    assert len(res.findings) == 12


def test_true_claims_are_verified_not_flagged(container):
    res = container.workflow.scan()
    verified = " | ".join(v.claim.text for v in res.verified)
    for claim in ("A single refund cannot exceed $500.", "Passwords must be at least 12 characters.",
                  "Sessions expire after 30 minutes of inactivity.", "`Idempotency-Key`", "never calls other services"):
        assert claim in verified
    assert not res.unverified


def test_detection_says_how_it_was_found(container):
    res = container.workflow.scan()
    window = next(f for f in res.findings if f.title.startswith("Refund window"))
    assert window.detection.engine == "ast+llm"
    assert "REFUND_WINDOW_DAYS = 14" in window.detection.reasoning
    assert "Q3 fraud review" in window.detection.reasoning
    route = next(f for f in res.findings if f.kind == "endpoint_changed")
    assert route.detection.engine == "ast" and route.detection.confidence >= 0.9


def test_findings_have_stable_ids(container):
    a = {f.id for f in container.workflow.scan().findings}
    b = {f.id for f in container.workflow.scan().findings}
    assert a == b
