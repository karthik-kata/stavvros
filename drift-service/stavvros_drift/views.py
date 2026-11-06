"""Read models built from the latest scan: the system map and the assistant context."""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from .extract.python_ast import tokenize
from .workflow import ACTIVE, Workflow


def graph(wf: Workflow) -> dict[str, Any]:
    res = wf.ensure_scanned()
    nodes, edges = [], []
    active = {r.finding.id: r for r in wf.records.values() if r.state in ACTIVE}
    for name, s in wf.cfg["services"].items():
        nodes.append({"id": f"service:{name}", "type": "service", "label": name, "detail": f"{s.get('team', '')} · owner {s.get('owner', '')}"})
    for r in res.code.of("route"):
        if r.data["path"] in wf.cfg.get("ignore_routes", []):
            continue
        nodes.append({"id": r.id, "type": "route", "label": r.name, "detail": f"{Path(r.file).name}:{r.line} · {r.data['handler']}()", "service": r.service})
        edges.append({"id": f"e:{r.id}", "source": f"service:{r.service}", "target": r.id, "kind": "exposes"})
    for d in res.docs:
        nodes.append({"id": f"doc:{d.info.path}", "type": "doc", "label": d.info.title, "detail": f"{d.info.path} · {d.info.owner}", "services": d.info.services})
    route_ids = {n["id"] for n in nodes if n["type"] == "route"}
    for v in res.verified:
        for fid in [f.id for f in res.code.of("route") if v.claim.kind == "endpoint" and f.data["path_norm"] == v.claim.data["path_norm"] and f.data["method"] == v.claim.data["method"]]:
            if fid in route_ids:
                edges.append({"id": f"doc:{v.claim.id}:{fid}", "source": f"doc:{v.claim.doc_path}", "target": fid, "kind": "documents"})
    seen_calls = set()
    for c in res.code.of("http_call"):
        key = (c.service, c.data["target_service"])
        if c.data["target_service"] in wf.cfg["services"] and key not in seen_calls and c.service != c.data["target_service"]:
            seen_calls.add(key)
            edges.append({"id": f"call:{key}", "source": f"service:{c.service}", "target": f"service:{c.data['target_service']}", "kind": "calls"})
    for p in res.code.of("publish"):
        for s in res.code.of("subscribe"):
            if p.data["topic"] == s.data["topic"]:
                edges.append({"id": f"evt:{p.id}:{s.id}", "source": f"service:{p.service}", "target": f"service:{s.service}", "kind": "event", "label": p.data["topic"]})
    for fid, rec in active.items():
        f = rec.finding
        src = f"doc:{f.doc.path}" if f.doc else f"service:{f.service}"
        tgt = next((x for x in f.detection.fact_ids if x in route_ids), f"service:{f.service}")
        if src != tgt:
            edges.append({"id": f"drift:{fid}", "source": src, "target": tgt, "kind": "drift", "drift_id": fid, "severity": f.severity})
    node_drifts: dict[str, list[str]] = {}
    for e in edges:
        if e["kind"] == "drift":
            for end in (e["source"], e["target"]):
                node_drifts.setdefault(end, []).append(e["drift_id"])
    for n in nodes:
        n["drift_ids"] = sorted(set(node_drifts.get(n["id"], [])))
    return {"nodes": nodes, "edges": edges}


def assistant_context(wf: Workflow, question: str) -> dict[str, Any]:
    """What the MCP query tool would hand an AI assistant before it writes code."""
    res = wf.ensure_scanned()
    words = {w for w in tokenize(question) if len(w) > 3} - {"button", "page", "history", "with", "that", "this", "from", "into", "make", "need"}
    score = lambda f: len(words & set(f.tokens))
    routes = sorted((r for r in res.code.of("route") if score(r)), key=score, reverse=True)[:4]
    consts = sorted((c for c in res.code.of("constant") if score(c) and not c.name.endswith("_URL")), key=score, reverse=True)[:4]
    services = {r.service for r in routes} | {c.service for c in consts}
    answer = [f"{r.service} exposes {r.name} → HTTP {r.data['status_code']}" + (f", returns {r.data['response_model']}" if r.data.get("response_model") else "") for r in routes]
    answer += [f"{c.service}: {c.name} = {c.data['value']}" for c in consts]
    warnings = []
    for rec in wf.records.values():
        f = rec.finding
        if rec.state not in ACTIVE:
            continue
        text = " ".join([f.title, f.doc_value, f.code_value, f.service])
        if f.service in services or words & set(tokenize(text)):
            guidance = {
                "in_review": f"Follow the code. A fix to the doc is waiting on {rec.change.reviewer.name if rec.change else 'review'}.",
                "change_drafted": "Follow the code. Someone is preparing a fix to the doc.",
                "issue_open": "The doc is right and the code is being fixed. Check with the owning team before relying on the current behaviour.",
            }.get(rec.state, "Follow the code. Nobody has confirmed which side is right yet.")
            if f.kind == "broken_call":
                guidance = f"Do not copy this call. Use {f.code_value} instead."
            warnings.append({"drift_id": f.id, "title": f.title, "severity": f.severity, "doc_says": f.doc_value, "code_does": f.code_value,
                             "doc": f.doc.label if f.doc else None, "guidance": guidance})
    sev = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    warnings.sort(key=lambda w: sev[w["severity"]])
    return {"question": question, "services": sorted(services), "answer": answer or ["Nothing in this codebase matches that question."],
            "drift_warnings": warnings[:5]}
