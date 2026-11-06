"""The drift detector.

Pipeline for one scan:
  1. AST index of every service (extract/python_ast.py)        deterministic
  2. Parse docs: tables, enum lists, events (extract/docs.py)   deterministic
  3. LLM extracts checkable claims from prose                   llm: extract_claims
  4. Contract rules compare doc tables with routes and models   deterministic
  5. For each prose claim, retrieve related code facts and
     ask the LLM to judge it                                    llm: judge_claim
  6. Cross-service checks: callers vs routes, events            deterministic
  7. Undocumented routes, rated by the LLM against policy text  llm: triage_undocumented
  8. Title, impact and drafted fixes for each finding           llm: summarize_finding, rewrite_doc_line
"""
from __future__ import annotations

import hashlib
import re
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from ..extract.docs import Doc, parse_docs
from ..extract.python_ast import CodeIndex, build_code_index, normalize_path, tokenize
from ..llm.reasoner import Reasoner
from ..models import (
    Action, CodeFact, Detection, DocClaim, Excerpt, Finding, Hunk, Person, ProposedChange,
    ScanReport, SideRef, VerifiedClaim,
)
from ..units import UNITS, convert, unit_of_constant

SEVERITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3}


@dataclass
class ScanResult:
    findings: list[Finding]
    verified: list[VerifiedClaim]
    unverified: list[DocClaim]
    report: ScanReport
    code: CodeIndex
    docs: list[Doc]
    claims: list[DocClaim] = field(default_factory=list)


def _fp(*parts: object) -> str:
    return hashlib.sha1("|".join(map(str, parts)).encode()).hexdigest()[:12]


def _segments(p: str) -> list[str]:
    return [s for s in p.strip("/").split("/") if s]


def _path_similarity(a: str, b: str) -> float:
    """Shared meaningful segments count most; version segments (v1, v2) and position count a little."""
    sa, sb = _segments(a), _segments(b)
    if not sa or not sb:
        return 0.0
    meaningful = lambda segs: {s for s in segs if not re.fullmatch(r"v\d+|\{\}", s)}
    shared = len(meaningful(sa) & meaningful(sb)) / max(1, len(meaningful(sa) | meaningful(sb)))
    positional = sum(1 for x, y in zip(sa, sb) if x == y) / max(len(sa), len(sb))
    return 0.7 * shared + 0.3 * positional


def _humanize_const(name: str) -> str:
    n = name
    for suf in ("_PER_MINUTE", "_DAYS", "_HOURS", "_MINUTES", "_SECONDS", "_CENTS", "_ENABLED", "_LENGTH"):
        n = n.removesuffix(suf)
    n = n.replace("_MAX_", "_").replace("_MIN_", "_").replace("MAX_", "").replace("_MAX", "").replace("MIN_", "")
    words = n.lower().split("_")
    s = " ".join(words)
    return s[:1].upper() + s[1:]


class Detector:
    def __init__(self, reasoner: Reasoner) -> None:
        self.r = reasoner

    # ======================================================================
    def scan(self, root: Path, cfg: dict[str, Any]) -> ScanResult:
        t0 = time.perf_counter()
        self.r.reset_counters()
        self.root, self.cfg = root, cfg
        self.services: dict[str, dict] = cfg["services"]
        code = build_code_index(root, self.services)
        docs = parse_docs(root, cfg.get("docs_dir", "docs"))
        self.code, self.docs = code, docs
        self.doc_by_path = {d.info.path: d for d in docs}

        # 3. LLM claim extraction from prose
        llm_claims: list[DocClaim] = []
        for d in docs:
            for block in d.prose:
                for c in self.r.extract_claims(d.info.title, block.section, block.lines):
                    llm_claims.append(DocClaim(
                        id=_fp(d.info.path, "rule", c["line"], c["quote"]), kind="rule", doc_path=d.info.path,
                        line=c["line"], section=block.section, text=c["quote"], data=c, source="llm",
                    ))
        parser_claims = [c for d in docs for c in d.claims]
        all_claims = parser_claims + llm_claims

        findings: list[Finding] = []
        verified: list[VerifiedClaim] = []
        unverified: list[DocClaim] = []
        documented_routes: set[str] = set()

        for c in parser_claims:
            d = self.doc_by_path[c.doc_path]
            if c.kind == "endpoint":
                findings += self._check_endpoint(d, c, verified, documented_routes)
            elif c.kind == "enum":
                findings += self._check_enum(d, c, verified, unverified)
            elif c.kind in ("event_produced", "event_consumed"):
                findings += self._check_event(d, c, verified)

        for c in llm_claims:
            f = self._check_rule(self.doc_by_path[c.doc_path], c, verified, unverified)
            if f:
                findings.append(f)

        findings += self._check_calls()
        findings += self._check_undocumented(documented_routes)

        # Summaries
        for f in findings:
            self._summarize(f)
        findings.sort(key=lambda f: (SEVERITY_ORDER[f.severity], f.category, f.title))
        self.r.save()

        facts_by_kind: dict[str, int] = {}
        for fct in code.facts:
            facts_by_kind[fct.kind] = facts_by_kind.get(fct.kind, 0) + 1
        sev: dict[str, int] = {}
        for f in findings:
            sev[f.severity] = sev.get(f.severity, 0) + 1
        report = ScanReport(
            scanned_at=datetime.now(timezone.utc).isoformat(),
            duration_ms=int((time.perf_counter() - t0) * 1000),
            codebase=cfg.get("name", root.name),
            llm_backend=self.r.backend.name,
            files_parsed=len(code.files),
            docs_parsed=len(docs),
            facts=facts_by_kind,
            claims={"from tables and lists (parser)": len(parser_claims), "from prose (LLM)": len(llm_claims)},
            llm_calls=dict(self.r.calls) | ({"cache hits": self.r.cache_hits} if self.r.cache_hits else {}),
            findings=sev,
            verified_claims=len(verified),
        )
        return ScanResult(findings, verified, unverified, report, code, docs, all_claims)

    # ======================================================================
    # Helpers
    def _owner(self, service: str) -> Person:
        s = self.services.get(service, {})
        return Person(name=s.get("owner", service), role=s.get("owner_role", ""), team=s.get("team", ""))

    def _doc_owner(self, d: Doc) -> Person:
        return Person(name=d.info.owner, role=d.info.owner_role, team=d.info.team)

    def _doc_side(self, d: Doc, line: int, before: int = 1, after: int = 1) -> SideRef:
        start = max(1, line - before)
        end = min(len(d.lines), line + after)
        return SideRef(
            path=d.info.path, line=line, label=d.info.title, owner=self._doc_owner(d),
            excerpt=Excerpt(path=d.info.path, start_line=start, highlight=[line], lines=d.lines[start - 1:end]),
        )

    def _code_side(self, f: CodeFact, extra_highlight: Optional[list[int]] = None, max_lines: int = 9) -> SideRef:
        lines = self.code.files[f.file]
        start = max(1, f.line - 1)
        end = min(len(lines), max(f.end_line, f.line) + 1, start + max_lines - 1)
        symbol = f.data.get("handler") or f.data.get("function") or f.name
        return SideRef(
            path=f.file, line=f.line, label=f"{f.service} · {symbol}", owner=self._owner(f.service),
            excerpt=Excerpt(path=f.file, start_line=start, highlight=[f.line] + (extra_highlight or []), lines=lines[start - 1:end]),
        )

    def _doc_services(self, d: Doc) -> list[str]:
        return [s for s in d.info.services if s in self.services] or list(self.services)

    def _route(self, services: list[str], method: str, path_norm: str) -> Optional[CodeFact]:
        for r in self.code.of("route"):
            if r.service in services and r.data["method"] == method and r.data["path_norm"] == path_norm:
                return r
        return None

    def _callers_of(self, service: str, method: str, path_norm: str) -> list[CodeFact]:
        return [c for c in self.code.of("http_call") if c.data["target_service"] == service
                and c.data["method"] == method and c.data["path_norm"] == path_norm]

    def _actions(self, kind: str, code_fix_label: Optional[str] = None) -> list[Action]:
        if kind == "undocumented_route":
            return [Action(id="update_doc", label="Document this route", primary=True),
                    Action(id="dismiss", label="Internal route: dismiss")]
        if kind == "broken_call":
            return [Action(id="update_code", label=code_fix_label or "Fix the caller", primary=True),
                    Action(id="dismiss", label="Not drift: dismiss")]
        return [Action(id="update_doc", label="Code is right: update the doc", primary=True),
                Action(id="update_code", label="Doc is right: fix the code"),
                Action(id="dismiss", label="Not drift: dismiss")]

    def _row_fix(self, d: Doc, line: int, transform) -> ProposedChange:
        old = d.lines[line - 1]
        return ProposedChange(target="doc", path=d.info.path, hunks=[Hunk(line=line, remove=[old], add=[transform(old)])],
                              reviewer=self._doc_owner(d))

    @staticmethod
    def _set_cell(row: str, idx: int, value: str) -> str:
        cells = row.strip().strip("|").split("|")
        cells[idx] = f" {value} "
        return "|" + "|".join(cells) + "|"

    def _table_col(self, d: Doc, row_line: int, name: str) -> Optional[int]:
        for hl, last in d.endpoint_tables:
            if hl < row_line <= last:
                header = [h.strip().lower() for h in d.lines[hl - 1].strip().strip("|").split("|")]
                return header.index(name) if name in header else None
        return None

    # ======================================================================
    # 4. Contract rules
    def _check_endpoint(self, d: Doc, c: DocClaim, verified: list, documented: set[str]) -> list[Finding]:
        services = self._doc_services(d)
        m, pn = c.data["method"], c.data["path_norm"]
        route = self._route(services, m, pn)
        out: list[Finding] = []
        if route:
            documented.add(route.id)
            ok = True
            if c.data.get("status") and c.data["status"] != route.data["status_code"]:
                ok = False
                col = self._table_col(d, c.line, "status")
                fix = self._row_fix(d, c.line, lambda r: self._set_cell(r, col, str(route.data["status_code"]))) if col is not None else None
                out.append(Finding(
                    id=_fp("status_changed", d.info.path, m, pn), kind="status_changed", category="contract", severity="high",
                    title="", impact="", doc_value=str(c.data["status"]), code_value=str(route.data["status_code"]), service=route.service,
                    doc=self._doc_side(d, c.line), code=self._code_side(route),
                    detection=Detection(engine="ast", rule="CONTRACT-STATUS", confidence=1.0, fact_ids=[route.id], claim_id=c.id,
                                        reasoning=f"The route decorator sets status_code={route.data['status_code']}."),
                    actions=self._actions("status_changed"), fixes={"update_doc": fix, "update_code": None},
                ))
            fields = c.data.get("fields") or []
            model = next((f for f in self.code.of("model", route.service) if f.name == route.data.get("response_model")), None)
            if fields and model:
                code_fields = [x["name"] for x in model.data["fields"]]
                missing = [x for x in fields if x not in code_fields]
                extra = [x for x in code_fields if x not in fields]
                if missing or extra:
                    ok = False
                    col = self._table_col(d, c.line, "response fields")
                    fix = self._row_fix(d, c.line, lambda r: self._set_cell(r, col, ", ".join(code_fields))) if col is not None else None
                    out.append(Finding(
                        id=_fp("fields_changed", d.info.path, m, pn), kind="fields_changed", category="contract",
                        severity="high" if missing else "low",   # promised-but-missing breaks clients; extra fields do not
                        title="", impact="", doc_value=", ".join(missing) or "(none)", code_value=", ".join(extra) or "(none)",
                        service=route.service, doc=self._doc_side(d, c.line), code=self._code_side(model),
                        callers=[f"{x.service} ({Path(x.file).name}:{x.line})" for x in self._callers_of(route.service, m, pn)],
                        detection=Detection(engine="ast", rule="CONTRACT-FIELDS", confidence=1.0, fact_ids=[route.id, model.id], claim_id=c.id,
                                            reasoning=f"{route.name} returns {model.name}, whose fields are {', '.join(code_fields)}."),
                        actions=self._actions("fields_changed"), fixes={"update_doc": fix, "update_code": None},
                    ))
            if ok:
                verified.append(VerifiedClaim(claim=c, doc_title=d.info.title, engine="ast",
                                              evidence=f"{route.service}: {route.name} ({Path(route.file).name}:{route.line}), status {route.data['status_code']}"))
            return out

        # Not found: renamed, or gone?
        same_method = [r for r in self.code.of("route") if r.service in services and r.data["method"] == m]
        best = max(same_method, key=lambda r: _path_similarity(pn, r.data["path_norm"]), default=None)
        stale = [x for x in self.code.of("http_call") if x.data["method"] == m and x.data["path_norm"] == pn]
        if best and _path_similarity(pn, best.data["path_norm"]) >= 0.4:
            documented.add(best.id)
            col = self._table_col(d, c.line, "path")
            fix = self._row_fix(d, c.line, lambda r: self._set_cell(r, col, best.data["path"])) if col is not None else None
            return [Finding(
                id=_fp("endpoint_changed", d.info.path, m, pn), kind="endpoint_changed", category="contract",
                severity="critical" if stale else "high", title="", impact="",
                doc_value=f"{m} {c.data['path']}", code_value=best.name, service=best.service,
                doc=self._doc_side(d, c.line), code=self._code_side(best),
                callers=[f"{x.service} ({Path(x.file).name}:{x.line})" for x in stale],
                detection=Detection(engine="ast", rule="CONTRACT-ROUTE", confidence=0.9, fact_ids=[best.id], claim_id=c.id,
                                    reasoning=f"No {m} route matches {c.data['path']}. The closest is {best.name} in {Path(best.file).name}"
                                              + (f": “{best.data['docstring']}”" if best.data.get("docstring") else ".")),
                actions=self._actions("endpoint_changed"), fixes={"update_doc": fix, "update_code": None},
            )]
        return [Finding(
            id=_fp("endpoint_missing", d.info.path, m, pn), kind="endpoint_missing", category="contract", severity="high",
            title="", impact="", doc_value=f"{m} {c.data['path']}", code_value="no such route", service=services[0],
            doc=self._doc_side(d, c.line),
            detection=Detection(engine="ast", rule="CONTRACT-ROUTE", confidence=0.95, claim_id=c.id,
                                reasoning=f"No route in {', '.join(services)} matches {m} {c.data['path']}."),
            actions=self._actions("endpoint_missing"),
            fixes={"update_doc": ProposedChange(target="doc", path=d.info.path, hunks=[Hunk(line=c.line, remove=[d.lines[c.line - 1]], add=[])], reviewer=self._doc_owner(d)), "update_code": None},
        )]

    def _check_enum(self, d: Doc, c: DocClaim, verified: list, unverified: list) -> list[Finding]:
        subj = set(t.rstrip("s") if len(t) > 4 else t for t in tokenize(c.data["subject"]))
        subj |= {"status" if t in ("statuse", "statu") else t for t in subj}
        best, score = None, 0
        for e in self.code.of("enum"):
            if e.service not in self._doc_services(d):
                continue
            s = len(subj & set(tokenize(e.name)))
            if s > score:
                best, score = e, s
        if not best or score < 2:
            unverified.append(c)
            return []
        doc_vals, code_vals = c.data["values"], best.data["members"]
        removed = [v for v in doc_vals if v not in code_vals]
        added = [v for v in code_vals if v not in doc_vals]
        if not removed and not added:
            verified.append(VerifiedClaim(claim=c, doc_title=d.info.title, engine="ast", evidence=f"{best.name} in {Path(best.file).name}:{best.line}"))
            return []
        line = d.lines[c.line - 1]
        new = re.sub(r"`[A-Z_]+`(?:\s*,\s*(?:and\s+|or\s+)?`[A-Z_]+`)+", ", ".join(f"`{v}`" for v in code_vals), line, count=1)
        return [Finding(
            id=_fp("enum_changed", d.info.path, best.name), kind="enum_changed", category="contract", severity="medium",
            title="", impact="", doc_value=", ".join(removed) or "(none removed)", code_value=", ".join(added) or "(none added)",
            service=best.service, doc=self._doc_side(d, c.line), code=self._code_side(best),
            detection=Detection(engine="ast", rule="CONTRACT-ENUM", confidence=0.9, fact_ids=[best.id], claim_id=c.id,
                                reasoning=f"{best.name} has {', '.join(code_vals)}."),
            actions=self._actions("enum_changed"),
            fixes={"update_doc": ProposedChange(target="doc", path=d.info.path, hunks=[Hunk(line=c.line, remove=[line], add=[new])], reviewer=self._doc_owner(d)),
                   "update_code": None},
        )]

    def _check_event(self, d: Doc, c: DocClaim, verified: list) -> list[Finding]:
        topic = c.data["topic"]
        services = self._doc_services(d)
        kind = "publish" if c.kind == "event_produced" else "subscribe"
        hit = next((f for f in self.code.of(kind) if f.service in services and f.data["topic"] == topic), None)
        if hit:
            verified.append(VerifiedClaim(claim=c, doc_title=d.info.title, engine="ast",
                                          evidence=f"{kind} “{topic}” in {hit.service} ({Path(hit.file).name}:{hit.line})"))
            return []
        producers = [f for f in self.code.of("publish") if f.data["topic"] == topic]
        fk = "event_not_produced" if kind == "publish" else "event_not_consumed"
        code_ref = self._code_side(producers[0]) if producers and fk == "event_not_consumed" else None
        return [Finding(
            id=_fp(fk, d.info.path, topic), kind=fk, category="events", severity="medium", title="", impact="",
            doc_value=f"{'publishes' if kind == 'publish' else 'listens to'} {topic}",
            code_value=f"no {'publisher' if kind == 'publish' else 'subscriber'} in {', '.join(services)}",
            service=services[0], doc=self._doc_side(d, c.line), code=code_ref,
            callers=[f"published by {p.service} ({Path(p.file).name}:{p.line})" for p in producers],
            detection=Detection(engine="ast", rule="EVENTS", confidence=0.95, fact_ids=[p.id for p in producers], claim_id=c.id,
                                reasoning=f"No @{kind}(“{topic}”) in {', '.join(services)}."
                                          + (f" {producers[0].service} does publish it." if producers else "")),
            actions=self._actions(fk),
            fixes={"update_doc": ProposedChange(target="doc", path=d.info.path, hunks=[Hunk(line=c.line, remove=[d.lines[c.line - 1]], add=[])], reviewer=self._doc_owner(d)),
                   "update_code": None},
        )]

    # ======================================================================
    # 5. Prose claims judged by the LLM
    def _candidates(self, services: list[str], keywords: list[str], vtype: str) -> list[dict[str, Any]]:
        kws = set(keywords)
        cands: list[tuple[int, dict]] = []
        used_by: dict[str, list[str]] = {}
        for r in self.code.of("route"):
            for cname in r.data.get("constants_used", {}):
                used_by.setdefault(f"{r.service}:{cname}", []).append(f"{r.data['handler']} ({Path(r.file).name}:{r.line})")
        for f in self.code.facts:
            if f.service not in services:
                continue
            if f.kind == "constant":
                d = {"id": f.id, "kind": "constant", "name": f.name, "value": f.data["value"], "comment": f.data.get("comment", ""),
                     "file": f.file, "line": f.line, "tokens": f.tokens, "used_by": used_by.get(f"{f.service}:{f.name}", [])}
                cands.append((len(kws & set(f.tokens)), d))
            elif f.kind == "route":
                for p in f.data["params"]:
                    if p.get("source") == "query" and (p.get("le") is not None or p.get("default") is not None):
                        toks = tokenize(p["name"], p.get("le_const"), p.get("default_const"), f.data["path"])
                        d = {"id": f"{f.id}#{p['name']}", "kind": "query_param", "name": p["name"], "route": f.name, "le": p.get("le"),
                             "default": p.get("default"), "file": f.file, "line": f.line, "tokens": toks}
                        cands.append((len(kws & set(toks)), d))
                    if p.get("source") == "header":
                        toks = tokenize(p["name"], p.get("alias"), f.data["path"])
                        d = {"id": f"{f.id}#{p['name']}", "kind": "header_param", "name": p["name"], "alias": p.get("alias"),
                             "required": p.get("required"), "route": f.name, "file": f.file, "line": f.line, "tokens": toks}
                        cands.append((len(kws & set(toks)) + (5 if vtype == "header" else 0), d))
            elif f.kind == "guard":
                d = {"id": f.id, "kind": "guard", "name": f.name, "condition": f.data["condition"], "detail": f.data["detail"],
                     "status": f.data["status"], "route": f.data["route"], "file": f.file, "line": f.line, "tokens": f.tokens}
                cands.append((len(kws & set(f.tokens)), d))
            elif f.kind == "http_call" and vtype == "absence":
                cands.append((10, {"id": f.id, "kind": "http_call", "name": f.name, "file": f.file, "line": f.line, "tokens": f.tokens}))
        cands.sort(key=lambda x: -x[0])
        return [d for s, d in cands if s > 0][:6]

    def _check_rule(self, d: Doc, c: DocClaim, verified: list, unverified: list) -> Optional[Finding]:
        services = self._doc_services(d)
        claim = {k: c.data[k] for k in ("subject", "keywords", "value", "quote")}
        vtype = claim["value"]["type"]
        cands = self._candidates(services, claim["keywords"], vtype)
        if not cands and vtype != "absence":
            unverified.append(c)
            return None
        j = self.r.judge(claim, cands)
        if j["verdict"] == "no_evidence":
            unverified.append(c)
            return None
        ev = next((x for x in cands if x["id"] == j.get("evidence_fact_id")), None)
        if j["verdict"] == "match":
            verified.append(VerifiedClaim(claim=c, doc_title=d.info.title, engine="ast+llm",
                                          evidence=f"{j['code_value']} ({Path(ev['file']).name}:{ev['line']})" if ev else j["code_value"]))
            return None

        fact = self.code.by_id(ev["id"].split("#")[0]) if ev else None
        const_name = None
        if ev and ev["kind"] == "constant":
            const_name = ev["name"]
        elif ev and ev["kind"] == "query_param":
            route = self.code.by_id(ev["id"].split("#")[0])
            p = next((p for p in route.data["params"] if p["name"] == ev["name"]), {}) if route else {}
            const_name = p.get("le_const") if claim["value"].get("bound") == "max" else p.get("default_const")
        const_fact = next((f for f in self.code.of("constant") if f.name == const_name and f.service in services), None) if const_name else None
        code_fact = const_fact or fact
        enforced = [g for g in self.code.of("guard") if const_name and const_name in g.data.get("constants_used", {})]
        code_side = self._code_side(code_fact) if code_fact else None

        # Drafted fixes
        line = d.lines[c.line - 1]
        new_line = self.r.rewrite_line(line, j["doc_value"], j["code_value"], claim)
        doc_fix = ProposedChange(target="doc", path=d.info.path, hunks=[Hunk(line=c.line, remove=[line], add=[new_line])], reviewer=self._doc_owner(d))
        code_fix = self._constant_fix(const_fact, claim["value"]) if const_fact else None

        v = claim["value"]
        sev = "high" if d.info.kind in ("policy", "prd") else "medium"
        f = Finding(
            id=_fp("rule_mismatch", d.info.path, const_name or c.data["subject"]), kind="rule_mismatch", category="behavior",
            severity=sev, title="", impact="", doc_value=j["doc_value"], code_value=j["code_value"],
            service=code_fact.service if code_fact else services[0],
            doc=self._doc_side(d, c.line), code=code_side,
            callers=[f"enforced in {g.data['route']} ({Path(g.file).name}:{g.line})" for g in enforced],
            detection=Detection(engine="ast+llm", rule="LLM-JUDGE", confidence=round(float(j["confidence"]), 2), reasoning=j["reasoning"],
                                fact_ids=list(dict.fromkeys(x for x in [ev["id"] if ev else None, const_fact.id if const_fact else None] if x)),
                                claim_id=c.id, llm_tasks=["extract_claims", "judge_claim", "rewrite_doc_line", "summarize_finding"]),
            actions=self._actions("rule_mismatch"), fixes={"update_doc": doc_fix, "update_code": code_fix},
        )
        f.__dict__["_ctx"] = {"subject": _humanize_const(const_name) if const_name else c.data["subject"], "bound": v.get("bound"),
                              "doc_number": v.get("amount"), "code_number": self._code_number(j, v), "bool_doc": v.get("value") if v["type"] == "bool" else None}
        return f

    @staticmethod
    def _code_number(j: dict, v: dict) -> Optional[float]:
        m = re.search(r"[\d,]+(?:\.\d+)?", j.get("code_value", "").replace("$", ""))
        return float(m.group(0).replace(",", "")) if m and v["type"] == "quantity" else None

    def _constant_fix(self, const: CodeFact, v: dict) -> Optional[ProposedChange]:
        lines = self.code.files[const.file]
        old = lines[const.line - 1]
        if v["type"] == "bool":
            new = re.sub(r"=\s*(True|False)", f"= {v['value']}", old, count=1)
        elif v["type"] == "quantity":
            cu = unit_of_constant(const.name) or v["unit"]
            val = convert(v["amount"], v["unit"], cu) if v["unit"] in UNITS and cu in UNITS else v["amount"]
            if val is None:
                return None
            lit = f"{int(val):_}" if float(val).is_integer() and abs(val) >= 10_000 else (str(int(val)) if float(val).is_integer() else str(val))
            new = re.sub(r"=\s*[\d_\.]+", f"= {lit}", old, count=1)
        else:
            return None
        return ProposedChange(target="code", path=const.file, hunks=[Hunk(line=const.line, remove=[old], add=[new])],
                              reviewer=self._owner(const.service))

    # ======================================================================
    # 6. Cross-service calls
    def _check_calls(self) -> list[Finding]:
        out = []
        for call in self.code.of("http_call"):
            target = call.data["target_service"]
            if target not in self.services:
                continue
            if self._route([target], call.data["method"], call.data["path_norm"]):
                continue
            same = [r for r in self.code.of("route", target) if r.data["method"] == call.data["method"]]
            best = max(same, key=lambda r: _path_similarity(call.data["path_norm"], r.data["path_norm"]), default=None)
            if best and _path_similarity(call.data["path_norm"], best.data["path_norm"]) < 0.3:
                best = None
            lines = self.code.files[call.file]
            # the literal may sit on the line after the call opens
            lit_line = next((i for i in range(call.line, min(call.end_line, call.line + 3) + 1) if call.data["path"] in lines[i - 1]), call.line)
            fix = None
            if best:
                old = lines[lit_line - 1]
                fix = ProposedChange(target="code", path=call.file, hunks=[Hunk(line=lit_line, remove=[old], add=[old.replace(call.data["path"], best.data["path"])])],
                                     reviewer=self._owner(call.service))
            f = Finding(
                id=_fp("broken_call", call.file, call.data["function"], call.data["path_norm"]), kind="broken_call", category="integration",
                severity="critical", title="", impact="", doc_value=call.name, code_value=best.name if best else "no matching route",
                service=call.service, code=self._code_side(call, [lit_line]),
                doc=None, related=self._code_side(best) if best else None,
                callers=[f"{call.service}.{call.data['function']} ({Path(call.file).name}:{call.line})"],
                detection=Detection(engine="ast", rule="INTEGRATION-CALL", confidence=0.95, fact_ids=[call.id] + ([best.id] if best else []),
                                    reasoning=f"{call.service} calls {call.name} on {target}, but {target} has no such route."
                                              + (f" {target} exposes {best.name}." if best else "")),
                actions=self._actions("broken_call", f"Point the caller at {best.data['path']}" if best else None),
                fixes={"update_code": fix, "update_doc": None},
            )
            f.__dict__["_ctx"] = {"caller": f"{call.service} ({call.data['function']})", "target": target, "subject": "Broken call"}
            out.append(f)
        return out

    # ======================================================================
    # 7. Undocumented routes, triaged by the LLM
    def _check_undocumented(self, documented: set[str]) -> list[Finding]:
        ignore = set(self.cfg.get("ignore_routes", []))
        out = []
        for r in self.code.of("route"):
            if r.id in documented or r.data["path"] in ignore:
                continue
            docs = [d for d in self.docs if r.service in d.info.services]
            policy = [t for d in docs for b in d.prose for _, t in b.lines]
            tri = self.r.triage_undocumented({k: r.data.get(k) for k in ("method", "path", "handler", "docstring", "dependencies")} | {"service": r.service}, policy)
            own = [d for d in docs if d.endpoint_tables and d.info.services == [r.service]]
            target = next((d for d in own if d.info.kind == "api"), None) or next(iter(own), None)
            if target:
                _, last = target.endpoint_tables[-1]
                new_row = f"| {r.data['method']} | {r.data['path']} | {r.data['status_code']} | |"
                fix = ProposedChange(target="doc", path=target.info.path, hunks=[Hunk(line=last + 1, remove=[], add=[new_row])],
                                     reviewer=self._doc_owner(target), notes=["Add a one-line description of what the route does."])
            else:
                path = f"{self.cfg.get('docs_dir', 'docs')}/api/{r.service}-api.md"
                fix = ProposedChange(target="doc", path=path, hunks=[Hunk(line=1, remove=[], add=[
                    "---", f"title: {r.service.title()} API reference", "kind: api", f"owner: {self._owner(r.service).name}",
                    f"team: {self._owner(r.service).team}", f"services: [{r.service}]", "---", "", f"# {r.service.title()} API", "",
                    "| Method | Path | Status | Response fields |", "| --- | --- | --- | --- |",
                    f"| {r.data['method']} | {r.data['path']} | {r.data['status_code']} | |",
                ])], reviewer=self._owner(r.service), creates_file=True, notes=[f"{r.service} has no API doc yet. This creates one."])
            f = Finding(
                id=_fp("undocumented_route", r.service, r.name), kind="undocumented_route", category="coverage",
                severity=tri["severity"], title="", impact="", doc_value="not in any doc", code_value=r.name, service=r.service,
                code=self._code_side(r), doc=self._doc_side(target, target.endpoint_tables[-1][1], 2, 0) if target else None,
                detection=Detection(engine="ast+llm", rule="COVERAGE-ROUTE", confidence=0.9, fact_ids=[r.id], reasoning=tri["reason"],
                                    llm_tasks=["triage_undocumented", "summarize_finding"]),
                actions=self._actions("undocumented_route"), fixes={"update_doc": fix},
            )
            f.__dict__["_ctx"] = {"reason": tri["reason"], "subject": "Undocumented route"}
            out.append(f)
        return out

    # ======================================================================
    # 8. Titles and impact
    def _summarize(self, f: Finding) -> None:
        ctx = f.__dict__.pop("_ctx", {})
        subject = ctx.get("subject") or {
            "endpoint_changed": "Route renamed", "endpoint_missing": "Route missing", "status_changed": "Status code",
            "fields_changed": "Response fields", "enum_changed": "Allowed values", "event_not_produced": "Event never published",
        }.get(f.kind, f.kind)
        if f.kind == "fields_changed" and f.code:
            subject = f"{f.code.label.split(' · ')[-1]} fields"
        if f.kind == "enum_changed" and f.code:
            subject = f.code.label.split(" · ")[-1]
        payload = {"kind": f.kind, "subject": subject, "doc_value": f.doc_value, "code_value": f.code_value, "service": f.service,
                   "doc_title": f.doc.label if f.doc else None, "missing": f.doc_value if f.kind == "fields_changed" else None,
                   "added": f.code_value if f.kind == "enum_changed" else None,
                   "detail": (f.doc.excerpt.lines[f.doc.excerpt.highlight[0] - f.doc.excerpt.start_line].split("|")[2].strip()
                              if f.kind == "event_not_consumed" and f.doc else None)} | ctx
        s = self.r.summarize(payload)
        f.title, f.impact = s["title"], s["impact"]
