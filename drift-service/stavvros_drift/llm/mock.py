"""A deterministic stand-in for a language model.

It answers the same prompts a real model gets, using `prompt.inputs` and simple rules
instead of reading `prompt.user`. Good enough to drive the full pipeline in tests and
demos; a real model will extract more claims and write better prose.
"""
from __future__ import annotations

import json
import re
from typing import Any, Optional

from .base import LLMBackend, Prompt

STOP = set(
    "a an the of to for in on at by and or be is are can cannot must may per from with within than that this "
    "these those it its as into after before every any each one single only no not up our your their".split()
)
SKIP_SECTIONS = ("objective", "success", "goal", "metric", "out of scope", "risk", "timeline")
SYNONYMS = {
    "within": "window", "exceed": "max", "most": "max", "maximum": "max", "least": "min", "minimum": "min",
    "limited": "limit", "attempts": "rate", "passwords": "password", "characters": "length",
    "sessions": "session", "inactivity": "idle", "expire": "timeout", "links": "token", "valid": "ttl",
    "refunds": "refund", "orders": "order", "returns": "list", "parameter": "param",
}
from ..units import NAME_UNITS, UNITS, fmt as _fmt


def _words(s: str) -> list[str]:
    return [w for w in re.findall(r"[a-z]+", s.lower()) if w not in STOP]


def _keywords(sentence: str) -> list[str]:
    out: list[str] = []
    for w in _words(sentence):
        out.append(SYNONYMS.get(w, w.rstrip("s") if len(w) > 4 else w))
    return list(dict.fromkeys(out))


def _unit(word: str) -> Optional[str]:
    w = word.lower().rstrip("s")
    return w if w in UNITS else None


class MockLLM(LLMBackend):
    name = "mock-llm (deterministic)"

    def generate(self, prompt: Prompt) -> str:
        handler = getattr(self, f"_{prompt.task}", None)
        if handler is None:
            raise ValueError(f"MockLLM has no answer for task {prompt.task!r}")
        return json.dumps(handler(prompt.inputs))

    # ------------------------------------------------------------------ #
    def _extract_claims(self, inp: dict[str, Any]) -> dict[str, Any]:
        if any(s in inp["section"].lower() for s in SKIP_SECTIONS):
            return {"claims": []}
        claims = []
        for row in inp["lines"]:
            text = re.sub(r"^\s*(?:[-*]|\d+\.)\s*", "", row["text"])
            for sentence in re.split(r"(?<=[.!?])\s+", text):
                c = self._claim(sentence)
                if c:
                    c.update(line=row["line"], quote=sentence)
                    claims.append(c)
        return {"claims": claims}

    def _claim(self, s: str) -> Optional[dict[str, Any]]:
        low = s.lower()
        if "http://" in low or "https://" in low:
            return None
        kw = _keywords(s)
        m = re.search(r"`([A-Za-z-]+)`\s+header", s)
        if m and re.search(r"\b(must|required|requires)\b", low):
            return {"subject": f"{m.group(1)} header", "keywords": kw, "value": {"type": "header", "name": m.group(1), "value": True}}
        m = re.search(r"^(?P<subj>[A-Z][\w ]+?) (?:are|is) (?P<neg>not )?(?:supported|enabled|allowed|available)", s)
        if m:
            return {"subject": m.group("subj"), "keywords": kw, "value": {"type": "bool", "value": not m.group("neg")}}
        m = re.search(r"^Only (?P<what>.+?) that (?:have|has|are|is) not (?P<state>\w+) can be (?P<act>\w+)", s)
        if m:
            return {"subject": f"{m.group('act')} rule", "keywords": kw, "value": {"type": "guard", "name": m.group("state")}}
        if re.search(r"never (?:calls|contacts) other services", low):
            return {"subject": "outbound calls", "keywords": ["outbound", "call", "http"], "value": {"type": "absence", "name": "http_call"}}
        m = re.search(r"\$(?P<usd>[\d,]+)", s)
        if m:
            amount, unit = float(m.group("usd").replace(",", "")), "usd"
        else:
            m = re.search(r"\b(?P<n>\d+)\b\s*(?P<unit>[a-z]+)?", low)
            if not m:
                return None
            amount = float(m.group("n"))
            unit = _unit(m.group("unit") or "") or ("per_minute" if "per minute" in low else None)
            if "per minute" in low:
                unit = "per_minute"
            if unit is None:
                if "%" in s:
                    return None
                unit = "order"
        bound = "exact"
        if re.search(r"at most|cannot exceed|up to|maximum|limited to|within|no more than", low):
            bound = "max"
        elif re.search(r"at least|minimum", low):
            bound = "min"
        elif "default" in low:
            bound = "default"
        if bound == "max":
            kw.append("max")
        if bound == "default":
            kw.append("default")
        if unit in UNITS:
            kw.append({"time": unit + "s", "money": "cents", "count": "limit", "rate": "minute"}[UNITS[unit][0]])
        return {"subject": " ".join(kw[:3]), "keywords": list(dict.fromkeys(kw)),
                "value": {"type": "quantity", "amount": amount, "unit": unit, "bound": bound}}

    # ------------------------------------------------------------------ #
    def _judge_claim(self, inp: dict[str, Any]) -> dict[str, Any]:
        claim, cands = inp["claim"], inp["candidates"]
        v = claim["value"]
        kws = set(claim["keywords"])

        def overlap(c: dict) -> int:
            return len(kws & set(c.get("tokens", [])))

        none = {"verdict": "no_evidence", "evidence_fact_id": None, "doc_value": claim["quote"], "code_value": "",
                "reasoning": "None of the code facts found is about this claim.", "confidence": 0.3}

        if v["type"] == "quantity":
            dim, factor = UNITS[v["unit"]]
            want = v["amount"] * factor
            best, best_score, best_val, best_unit = None, 0, None, None
            for c in cands:
                options = []
                if c["kind"] == "constant" and isinstance(c.get("value"), (int, float)) and not isinstance(c.get("value"), bool):
                    u = next((u for suf, u in NAME_UNITS if c["name"].endswith(suf)), None)
                    if u:
                        options.append((c["value"], u, 0))
                if c["kind"] == "query_param":
                    if c.get("le") is not None:
                        options.append((c["le"], "order", 2 if v["bound"] == "max" else -2))
                    if c.get("default") is not None:
                        options.append((c["default"], "order", 2 if v["bound"] == "default" else -2))
                for val, u, bonus in options:
                    if UNITS[u][0] != dim:
                        continue
                    name = c["name"].upper()
                    if v["bound"] == "max" and "MAX" in name:
                        bonus += 1
                    if v["bound"] == "default" and "DEFAULT" in name:
                        bonus += 1
                    if v["bound"] != "max" and "MAX" in name:
                        bonus -= 1
                    if v["bound"] != "default" and "DEFAULT" in name:
                        bonus -= 1
                    score = overlap(c) + bonus
                    if score > best_score:
                        best, best_score, best_val, best_unit = c, score, val, u
            if not best or best_score < 2:
                return none
            got = best_val * UNITS[best_unit][1]
            same = abs(got - want) < 1e-9
            doc_s = _fmt(v["amount"], v["unit"])
            code_s = _fmt(got / factor, v["unit"]) if (got / factor).is_integer() else _fmt(best_val, best_unit)
            where = f"{best['name']} = {best_val}" if best["kind"] == "constant" else f"`{best['name']}` (default {best.get('default')}, max {best.get('le')})"
            reason = f"{where} in {best['file']}."
            if best.get("comment"):
                reason += f" The comment there says: “{best['comment']}”."
            if best.get("used_by"):
                reason += f" It is enforced in {', '.join(best['used_by'])}."
            return {"verdict": "match" if same else "drift", "evidence_fact_id": best["id"], "doc_value": doc_s,
                    "code_value": code_s, "reasoning": reason, "confidence": min(0.95, 0.6 + 0.08 * best_score)}

        if v["type"] == "bool":
            for c in sorted(cands, key=overlap, reverse=True):
                if c["kind"] == "constant" and isinstance(c.get("value"), bool) and overlap(c) >= 2:
                    same = c["value"] == v["value"]
                    word = lambda b: "enabled" if b else "disabled"
                    reason = f"{c['name']} = {c['value']} in {c['file']}."
                    if c.get("comment"):
                        reason += f" The comment there says: “{c['comment']}”."
                    if c.get("used_by"):
                        reason += f" Checked in {', '.join(c['used_by'])}."
                    return {"verdict": "match" if same else "drift", "evidence_fact_id": c["id"],
                            "doc_value": word(v["value"]), "code_value": word(c["value"]), "reasoning": reason,
                            "confidence": min(0.95, 0.65 + 0.08 * overlap(c))}
            return none

        if v["type"] == "header":
            for c in cands:
                if c["kind"] == "header_param" and (c.get("alias") or "").lower() == v["name"].lower():
                    same = bool(c.get("required")) == bool(v.get("value", True))
                    return {"verdict": "match" if same else "drift", "evidence_fact_id": c["id"],
                            "doc_value": f"{v['name']} required", "code_value": f"{v['name']} {'required' if c.get('required') else 'optional'}",
                            "reasoning": f"{c['route']} declares Header(..., alias=\"{c['alias']}\").", "confidence": 0.9}
            return none

        if v["type"] == "guard":
            for c in sorted(cands, key=overlap, reverse=True):
                if c["kind"] == "guard" and v["name"].lower() in c.get("condition", "").lower() + c.get("detail", "").lower():
                    return {"verdict": "match", "evidence_fact_id": c["id"], "doc_value": claim["quote"],
                            "code_value": f"rejects when {c['condition']}", "reasoning": f"{c['route']} returns {c['status']} “{c['detail']}”.",
                            "confidence": 0.7}
            return none

        if v["type"] == "absence":
            calls = [c for c in cands if c["kind"] == "http_call"]
            if not calls:
                return {"verdict": "match", "evidence_fact_id": None, "doc_value": "no outbound calls",
                        "code_value": "no outbound HTTP calls found", "reasoning": "Static analysis found no HTTP client calls in this service.", "confidence": 0.85}
            return {"verdict": "drift", "evidence_fact_id": calls[0]["id"], "doc_value": "no outbound calls",
                    "code_value": ", ".join(c["name"] for c in calls), "reasoning": "The service makes HTTP calls.", "confidence": 0.85}
        return none

    # ------------------------------------------------------------------ #
    def _triage_undocumented(self, inp: dict[str, Any]) -> dict[str, Any]:
        r = inp["route"]
        text = " ".join(str(x) for x in (r.get("path"), r.get("handler"), r.get("docstring"), r.get("dependencies")))
        policy = " ".join(inp["policy_lines"]).lower()
        if re.search(r"impersonat|admin|sudo|superuser|role", text, re.I):
            reason = "This route grants staff elevated access."
            if "act as a customer" in policy or "must be listed" in policy:
                quote = next((p for p in inp["policy_lines"] if "listed" in p.lower() or "act as" in p.lower()), "")
                reason += f" The security policy says: “{quote.strip()}”"
            return {"severity": "high", "reason": reason}
        if re.search(r"refund|charge|pay", text, re.I):
            return {"severity": "low", "reason": "Customer-facing route in a money flow with no documentation."}
        return {"severity": "low", "reason": "Internal route with no documentation."}

    # ------------------------------------------------------------------ #
    def _summarize_finding(self, inp: dict[str, Any]) -> dict[str, Any]:
        f = inp["finding"]
        k, subj, d, c = f["kind"], f.get("subject", ""), f.get("doc_value", ""), f.get("code_value", "")
        title = f"{subj}: {d} → {c}" if d and c else subj
        impact = {
            "rule_mismatch": self._rule_impact(f),
            "endpoint_changed": "Clients that follow the doc call a route that no longer exists.",
            "endpoint_missing": "Clients that follow the doc call a route that does not exist.",
            "status_changed": "Clients that check the status code from the doc will treat success as an error.",
            "fields_changed": f"Clients reading {f.get('missing') or 'the documented fields'} from the response will not find {'it' if ',' not in (f.get('missing') or '') else 'them'}.",
            "enum_changed": f"Code written from the doc will not handle {f.get('added') or 'the new values'}.",
            "event_not_consumed": f"Customers never get the “{f.get('detail', '')}” email.",
            "event_not_produced": "Nothing publishes this event, so listeners never fire.",
            "undocumented_route": f.get("reason") or "Nobody outside the owning team knows this route exists.",
            "broken_call": f"{f.get('caller', 'The caller')} gets a 404 every time; the request never reaches {f.get('target', 'the service')}.",
        }.get(k, "")
        if k == "fields_changed" and d == "(none)":
            n = len([x for x in c.split(",") if x.strip()])
            title = f"{subj}: {n} field{'s' if n != 1 else ''} not in the doc"
            impact = "The response has more than the doc lists. Nothing breaks, but readers miss part of the contract."
        if k == "endpoint_changed":
            a, b = d.split(" ", 1)[-1].strip("/").split("/"), c.split(" ", 1)[-1].strip("/").split("/")
            i = 0
            while i < min(len(a), len(b)) and a[i] == b[i]:
                i += 1
            title = f"Route renamed: /{'/'.join(a[i:])} \u2192 /{'/'.join(b[i:])}"
        if k == "undocumented_route":
            title = f"Undocumented route: {c}"
        if k == "broken_call":
            title = f"Broken call: {d} does not exist"
        if k == "event_not_consumed":
            title = f"Email never sent: {f.get('detail', d)}"
        if len(title) > 64:
            title = title[:61] + "…"
        return {"title": title, "impact": impact}

    def _rule_impact(self, f: dict[str, Any]) -> str:
        d, c = f.get("doc_number"), f.get("code_number")
        bound = f.get("bound")
        if f.get("bool_doc") is not None:
            return "The doc promises something the code switches off." if f["bool_doc"] else "The code allows something the doc rules out."
        if d is None or c is None:
            return "The doc and the code disagree."
        if bound == "max":
            return "Requests the doc says are allowed will be rejected." if c < d else "The code allows more than the doc says. Check that this is intended."
        if bound == "min":
            return "The code accepts less than the doc requires." if c < d else "Requests the doc says are allowed will be rejected."
        return "Anyone relying on the doc gets a different value."

    # ------------------------------------------------------------------ #
    def _rewrite_doc_line(self, inp: dict[str, Any]) -> dict[str, Any]:
        line, d, c, claim = inp["line"], inp["doc_value"], inp["code_value"], inp["claim"]
        v = claim["value"]
        if v["type"] == "bool":
            new = re.sub(r"\b(are|is) (not )?(supported|enabled|allowed|available)", lambda m: f"{m.group(1)} {'' if c == 'enabled' else 'not '}{m.group(3)}", line, count=1)
            new = re.sub(r",\s*for example.*?(\.)\s*$", r"\1", new)
            return {"new_line": new}
        if v["type"] == "quantity":
            dn = re.match(r"\$?([\d,]+)", d)
            cn = re.match(r"\$?([\d,]+)", c)
            if dn and cn:
                pattern = (r"\$" if d.startswith("$") else r"(?<![\d$])") + re.escape(dn.group(1)) + r"(?!\d)"
                return {"new_line": re.sub(pattern, ("$" if c.startswith("$") else "") + cn.group(1), line, count=1)}
        return {"new_line": line}
