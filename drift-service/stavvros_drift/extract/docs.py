"""Parse markdown docs: front matter, sections, and the claims that have a fixed shape.

Tables of endpoints, event tables and lists of enum values are parsed here, deterministically.
Free prose ("refunds within 30 days") is handed to the LLM by the detector.
"""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from pathlib import Path

from ..models import DocClaim, DocInfo
from .python_ast import normalize_path

_endpoint = re.compile(r"\b(GET|POST|PUT|PATCH|DELETE)\b")
_ticks = re.compile(r"`([^`]+)`")


@dataclass
class ProseBlock:
    """Consecutive prose lines under one heading, sent to the LLM for claim extraction."""

    doc_path: str
    section: str
    lines: list[tuple[int, str]]


@dataclass
class Doc:
    info: DocInfo
    lines: list[str]
    claims: list[DocClaim] = field(default_factory=list)
    prose: list[ProseBlock] = field(default_factory=list)
    endpoint_tables: list[tuple[int, int]] = field(default_factory=list)  # (header line, last row line)


def _front_matter(lines: list[str]) -> tuple[dict, int]:
    if not lines or lines[0].strip() != "---":
        return {}, 0
    meta: dict = {}
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            return meta, i + 1
        if ":" in lines[i]:
            k, v = lines[i].split(":", 1)
            v = v.strip()
            meta[k.strip()] = [x.strip() for x in v[1:-1].split(",") if x.strip()] if v.startswith("[") else v
    return meta, 0


def _cells(row: str) -> list[str]:
    return [c.strip() for c in row.strip().strip("|").split("|")]


def _cid(*parts: object) -> str:
    return hashlib.sha1("|".join(map(str, parts)).encode()).hexdigest()[:10]


def parse_doc(root: Path, path: Path) -> Doc:
    rel = str(path.relative_to(root))
    lines = path.read_text().split("\n")
    meta, body_start = _front_matter(lines)
    title = meta.get("title") or next((l.lstrip("# ").strip() for l in lines if l.startswith("# ")), path.stem)
    info = DocInfo(
        path=rel, title=title, kind=meta.get("kind", "doc"), owner=meta.get("owner", "Unknown"),
        owner_role=meta.get("owner_role", ""), team=meta.get("team", ""), services=meta.get("services", []) or [],
    )
    doc = Doc(info=info, lines=lines)

    section = ""
    i = body_start
    prose: list[tuple[int, str]] = []

    def flush() -> None:
        nonlocal prose
        if prose:
            doc.prose.append(ProseBlock(rel, section, prose))
        prose = []

    while i < len(lines):
        raw = lines[i]
        s = raw.strip()
        ln = i + 1
        if s.startswith("#"):
            flush()
            section = s.lstrip("#").strip()
            i += 1
            continue
        if s.startswith("|") and i + 1 < len(lines) and re.match(r"^\|?\s*:?-{3,}", lines[i + 1].strip()):
            flush()
            header = [h.lower() for h in _cells(s)]
            j = i + 2
            rows: list[tuple[int, list[str]]] = []
            while j < len(lines) and lines[j].strip().startswith("|"):
                rows.append((j + 1, _cells(lines[j])))
                j += 1
            _table_claims(doc, section, ln, header, rows)
            i = j
            continue
        if not s:
            flush()
            i += 1
            continue
        # Enum lists: "Order statuses: `A`, `B`, `C`."
        m = re.match(r"^(?P<subject>[A-Za-z ]+?)\s*:\s*(?P<rest>(`[A-Z_]+`[,.\s]*(and|or)?\s*){2,})$", s)
        if m:
            vals = _ticks.findall(m.group("rest"))
            doc.claims.append(DocClaim(
                id=_cid(rel, "enum", m.group("subject")), kind="enum", doc_path=rel, line=ln, section=section,
                text=s, data={"subject": m.group("subject").strip(), "values": vals},
            ))
            i += 1
            continue
        prose.append((ln, s))
        i += 1
    flush()
    return doc


def _table_claims(doc: Doc, section: str, header_line: int, header: list[str], rows: list[tuple[int, list[str]]]) -> None:
    rel = doc.info.path
    col = {h: k for k, h in enumerate(header)}
    if "method" in col and "path" in col:
        doc.endpoint_tables.append((header_line, rows[-1][0] if rows else header_line + 1))
        for ln, c in rows:
            method, path = c[col["method"]].upper(), c[col["path"]].strip("` ")
            if not _endpoint.match(method):
                continue
            status = c[col["status"]] if "status" in col and col["status"] < len(c) else ""
            fcell = c[col["response fields"]] if "response fields" in col and col["response fields"] < len(c) else ""
            fields = [f.strip("` ") for f in fcell.split(",") if f.strip("` ")]
            doc.claims.append(DocClaim(
                id=_cid(rel, "endpoint", method, normalize_path(path)), kind="endpoint", doc_path=rel, line=ln,
                section=section, text=f"{method} {path}",
                data={"method": method, "path": path, "path_norm": normalize_path(path),
                      "status": int(status) if status.isdigit() else None, "fields": fields},
            ))
        return
    if "event" in col:
        produced = any("produced" in h for h in header) or "subscri" not in section.lower()
        kind = "event_produced" if produced else "event_consumed"
        for ln, c in rows:
            topic = c[col["event"]].strip("` ")
            other = c[1] if len(c) > 1 else ""
            doc.claims.append(DocClaim(
                id=_cid(rel, kind, topic), kind=kind, doc_path=rel, line=ln, section=section,
                text=f"{topic}: {other}", data={"topic": topic, "detail": other},
            ))


def parse_docs(root: Path, docs_dir: str) -> list[Doc]:
    return [parse_doc(root, p) for p in sorted((root / docs_dir).rglob("*.md"))]
