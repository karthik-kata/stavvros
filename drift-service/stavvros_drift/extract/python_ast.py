"""Extract facts from Python/FastAPI services with the standard-library AST.

Everything here is deterministic: no LLM, no imports of the scanned code.
"""
from __future__ import annotations

import ast
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable, Optional

from ..models import CodeFact

HTTP_METHODS = {"get", "post", "put", "patch", "delete"}
_camel = re.compile(r"(?<=[a-z0-9])(?=[A-Z])")


def tokenize(*parts: Any) -> list[str]:
    """Lower-case word tokens from identifiers, paths and prose."""
    out: list[str] = []
    for p in parts:
        if p is None:
            continue
        s = _camel.sub(" ", str(p))
        for t in re.split(r"[^a-zA-Z0-9]+", s.lower()):
            if t and not t.isdigit():
                out.append(t)
                if len(t) > 4 and t.endswith("s") and not t.endswith("ss"):
                    out.append(t[:-1])  # crude singular: "refunds" -> "refund"
    return out


def normalize_path(path: str) -> str:
    """'/orders/{order_id}/void' -> '/orders/{}/void'."""
    p = re.sub(r"\{[^}]*\}", "{}", path.strip())
    return p.rstrip("/") or "/"


@dataclass
class CodeIndex:
    root: Path
    facts: list[CodeFact] = field(default_factory=list)
    files: dict[str, list[str]] = field(default_factory=dict)   # rel path -> source lines

    def of(self, kind: str, service: Optional[str] = None) -> list[CodeFact]:
        return [f for f in self.facts if f.kind == kind and (service is None or f.service == service)]

    def by_id(self, fid: str) -> Optional[CodeFact]:
        return next((f for f in self.facts if f.id == fid), None)


def _lit(node: Optional[ast.AST]) -> Any:
    if node is None:
        return None
    try:
        return ast.literal_eval(node)
    except Exception:
        return None


def _name(node: ast.AST) -> str:
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return node.attr
    return ""


def _kw(call: ast.Call, key: str) -> Optional[ast.AST]:
    return next((k.value for k in call.keywords if k.arg == key), None)


def _names_in(node: ast.AST) -> set[str]:
    return {n.id for n in ast.walk(node) if isinstance(n, ast.Name)}


class _ServiceScanner:
    def __init__(self, root: Path, service: str, service_dir: Path, index: CodeIndex) -> None:
        self.root, self.service, self.dir, self.index = root, service, service_dir, index
        self.constants: dict[str, Any] = {}
        self.trees: list[tuple[str, ast.Module]] = []

    # -- helpers ----------------------------------------------------------
    def _add(self, kind: str, rel: str, node: ast.AST, name: str, data: dict, tokens: Iterable[str]) -> CodeFact:
        line = getattr(node, "lineno", 1)
        end = getattr(node, "end_lineno", line) or line
        fid = re.sub(r"[^A-Za-z0-9_.:/{}-]", "_", f"{self.service}:{kind}:{name}:{line}")
        fact = CodeFact(
            id=fid, kind=kind, service=self.service, file=rel, line=line, end_line=end,
            name=name, data=data, tokens=sorted(set(tokens)),
        )
        self.index.facts.append(fact)
        return fact

    def _resolve(self, node: Optional[ast.AST]) -> Any:
        """Literal value, or the value of a constant the expression names."""
        if node is None:
            return None
        v = _lit(node)
        if v is not None:
            return v
        if isinstance(node, ast.Name) and node.id in self.constants:
            return self.constants[node.id]
        return None

    # -- passes -----------------------------------------------------------
    def load(self) -> None:
        for path in sorted(self.dir.rglob("*.py")):
            rel = str(path.relative_to(self.root))
            src = path.read_text()
            self.index.files[rel] = src.split("\n")
            try:
                tree = ast.parse(src, filename=rel)
            except SyntaxError:
                continue
            self.trees.append((rel, tree))
            for node in tree.body:
                if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
                    nm = node.targets[0].id
                    if nm.isupper():
                        val = _lit(node.value)
                        if val is not None:
                            self.constants[nm] = val

    def scan(self) -> None:
        for rel, tree in self.trees:
            self._scan_module(rel, tree)

    def _scan_module(self, rel: str, tree: ast.Module) -> None:
        lines = self.index.files[rel]
        prefixes: dict[str, str] = {}
        url_consts: dict[str, str] = {}
        default_base: Optional[str] = None

        for node in tree.body:
            if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
                nm, val = node.targets[0].id, node.value
                if isinstance(val, ast.Call) and _name(val.func) in ("APIRouter", "FastAPI"):
                    prefixes[nm] = _lit(_kw(val, "prefix")) or ""
                if nm.isupper():
                    lit = _lit(val)
                    if lit is not None:
                        comment = lines[node.lineno - 1].split("#", 1)[1].strip() if "#" in lines[node.lineno - 1] else ""
                        self._add("constant", rel, node, nm, {"value": lit, "comment": comment}, tokenize(nm, comment))
                        if nm.endswith("_URL") and isinstance(lit, str):
                            url_consts[nm] = lit

        for n in ast.walk(tree):
            if isinstance(n, ast.Call) and _name(n.func) == "AsyncClient":
                b = _kw(n, "base_url")
                if isinstance(b, ast.Name) and b.id in url_consts:
                    default_base = url_consts[b.id]

        for node in ast.walk(tree):
            if isinstance(node, ast.ClassDef):
                self._class(rel, node)
            elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                self._function(rel, node, prefixes)
                self._calls(rel, node, url_consts, default_base)

    def _class(self, rel: str, node: ast.ClassDef) -> None:
        bases = {_name(b) for b in node.bases}
        if "BaseModel" in bases:
            fields = []
            for st in node.body:
                if isinstance(st, ast.AnnAssign) and isinstance(st.target, ast.Name):
                    has_default = st.value is not None and not (
                        isinstance(st.value, ast.Call) and _name(st.value.func) == "Field" and not st.value.args
                    )
                    fields.append({"name": st.target.id, "type": ast.unparse(st.annotation), "required": not has_default})
            self._add("model", rel, node, node.name, {"fields": fields}, tokenize(node.name, *[f["name"] for f in fields]))
        elif any("Enum" in b for b in bases):
            members = [t.id for st in node.body if isinstance(st, ast.Assign) for t in st.targets if isinstance(t, ast.Name)]
            self._add("enum", rel, node, node.name, {"members": members}, tokenize(node.name, *members))

    def _function(self, rel: str, fn: ast.FunctionDef | ast.AsyncFunctionDef, prefixes: dict[str, str]) -> None:
        # Event subscriptions: @subscribe("topic")
        for d in fn.decorator_list:
            if isinstance(d, ast.Call) and _name(d.func) == "subscribe" and d.args:
                topic = _lit(d.args[0])
                if isinstance(topic, str):
                    self._add("subscribe", rel, d, topic, {"topic": topic, "handler": fn.name}, tokenize(topic, fn.name))

        # Routes: @router.post("/path", status_code=..., response_model=...)
        for d in fn.decorator_list:
            if not (isinstance(d, ast.Call) and isinstance(d.func, ast.Attribute) and d.func.attr in HTTP_METHODS):
                continue
            owner = _name(d.func.value)
            if owner not in prefixes:
                continue
            sub = _lit(d.args[0]) if d.args else ""
            path = (prefixes[owner] + (sub or "")) or "/"
            method = d.func.attr.upper()
            status = _lit(_kw(d, "status_code")) or 200
            rm = _kw(d, "response_model")
            deps = _kw(d, "dependencies")
            params = self._params(fn)
            used = sorted((_names_in(fn) | (_names_in(deps) if deps is not None else set())) & set(self.constants))
            data = {
                "method": method,
                "path": path,
                "path_norm": normalize_path(path),
                "status_code": status,
                "response_model": ast.unparse(rm) if rm is not None else None,
                "handler": fn.name,
                "params": params,
                "dependencies": ast.unparse(deps) if deps is not None else None,
                "docstring": ast.get_docstring(fn) or "",
                "constants_used": {c: self.constants[c] for c in used},
            }
            self._add("route", rel, fn, f"{method} {path}", data,
                      tokenize(path, fn.name, data["docstring"], data["dependencies"], *used))

            # Guards inside the handler: if <cond>: raise HTTPException(status_code=..., detail=...)
            for st in ast.walk(fn):
                if isinstance(st, ast.If):
                    for r in st.body:
                        if isinstance(r, ast.Raise) and isinstance(r.exc, ast.Call) and _name(r.exc.func) == "HTTPException":
                            detail = _lit(_kw(r.exc, "detail")) or ""
                            cond = ast.unparse(st.test)
                            c_used = sorted(_names_in(st.test) & set(self.constants))
                            self._add("guard", rel, st, f"{fn.name}: {detail}", {
                                "condition": cond, "status": _lit(_kw(r.exc, "status_code")), "detail": detail,
                                "route": f"{method} {path}", "constants_used": {c: self.constants[c] for c in c_used},
                            }, tokenize(cond, detail, fn.name, *c_used))

    def _params(self, fn: ast.FunctionDef | ast.AsyncFunctionDef) -> list[dict]:
        args = fn.args.args
        defaults = [None] * (len(args) - len(fn.args.defaults)) + list(fn.args.defaults)
        out = []
        for a, d in zip(args, defaults):
            if a.arg == "self":
                continue
            p: dict[str, Any] = {"name": a.arg, "annotation": ast.unparse(a.annotation) if a.annotation else None}
            if isinstance(d, ast.Call) and _name(d.func) in ("Header", "Query", "Path", "Body", "Cookie"):
                p["source"] = _name(d.func).lower()
                first = d.args[0] if d.args else None
                p["required"] = isinstance(first, ast.Constant) and first.value is Ellipsis
                p["default"] = None if p["required"] else self._resolve(first)
                p["alias"] = _lit(_kw(d, "alias"))
                for bound in ("le", "ge", "lt", "gt", "max_length", "min_length"):
                    v = _kw(d, bound)
                    if v is not None:
                        p[bound] = self._resolve(v)
                        if isinstance(v, ast.Name):
                            p[f"{bound}_const"] = v.id
                if isinstance(first, ast.Name):
                    p["default_const"] = first.id
            else:
                p["source"] = "auto"
                p["required"] = d is None
                p["default"] = _lit(d) if d is not None else None
            out.append(p)
        return out

    def _calls(self, rel: str, fn: ast.FunctionDef | ast.AsyncFunctionDef, url_consts: dict[str, str], default_base: Optional[str]) -> None:
        for n in ast.walk(fn):
            if not isinstance(n, ast.Call):
                continue
            fname = _name(n.func)
            # Event publishing: publish("topic", ...)
            if fname == "publish" and n.args and isinstance(_lit(n.args[0]), str):
                topic = _lit(n.args[0])
                self._add("publish", rel, n, topic, {"topic": topic, "function": fn.name}, tokenize(topic, fn.name))
                continue
            # Outbound HTTP: <client>.post("/path") or .get(f"{X_URL}/path")
            if not (isinstance(n.func, ast.Attribute) and n.func.attr in HTTP_METHODS and n.args):
                continue
            arg = n.args[0]
            base, path = default_base, None
            if isinstance(arg, ast.Constant) and isinstance(arg.value, str):
                path = arg.value
            elif isinstance(arg, ast.JoinedStr):
                parts = []
                for i, v in enumerate(arg.values):
                    if isinstance(v, ast.Constant):
                        parts.append(str(v.value))
                    elif i == 0 and isinstance(v, ast.FormattedValue) and isinstance(v.value, ast.Name) and v.value.id in url_consts:
                        base = url_consts[v.value.id]
                    else:
                        parts.append("{}")
                path = "".join(parts)
            if not path or not path.startswith("/") or not base:
                continue
            host = re.sub(r"^https?://", "", base).split(":")[0].split("/")[0]
            method = n.func.attr.upper()
            self._add("http_call", rel, n, f"{method} {path}", {
                "method": method, "path": path, "path_norm": normalize_path(path),
                "target_service": host, "base_url": base, "function": fn.name,
            }, tokenize(path, fn.name, host))


def build_code_index(root: Path, services: dict[str, dict]) -> CodeIndex:
    index = CodeIndex(root=root)
    scanners = []
    for name, cfg in services.items():
        s = _ServiceScanner(root, name, root / cfg["path"], index)
        s.load()
        scanners.append(s)
    for s in scanners:
        s.scan()
    return index
