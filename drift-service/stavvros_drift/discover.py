"""Work out which services a repository has when it ships no `stavvros.json`.

Rules, deterministic: a service is the directory holding a Python file that calls `FastAPI(`; if none,
the top-level directory of any file that calls `APIRouter(`; if still none, the whole repository as one service.
Docs are read from `docs/` (or `doc/`, `documentation/`), else every markdown file under the root.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from .extract.python_ast import SKIP_DIRS

DOC_DIRS = ("docs", "doc", "documentation")


def load_config(root: Path) -> dict[str, Any]:
    f = root / "stavvros.json"
    if f.exists():
        try:
            return json.loads(f.read_text())
        except json.JSONDecodeError as e:
            raise ValueError(f"{f} is not valid JSON: {e}")
    return discover_config(root)


def _py_files(root: Path):
    for p in root.rglob("*.py"):
        if not SKIP_DIRS.intersection(p.relative_to(root).parts):
            yield p


def discover_config(root: Path) -> dict[str, Any]:
    apps: dict[str, Path] = {}
    routers: dict[str, Path] = {}
    for p in _py_files(root):
        try:
            src = p.read_text(errors="ignore")
        except OSError:
            continue
        rel = p.relative_to(root)
        if re.search(r"\bFastAPI\(", src):
            d = p.parent
            # `app/main.py` belongs to its parent: the service is the folder holding `app/`
            if d.name in ("app", "src") and d != root:
                d = d.parent
            apps[str(d.relative_to(root)) or "."] = d
        elif re.search(r"\bAPIRouter\(", src):
            top = rel.parts[0] if len(rel.parts) > 1 else "."
            routers[top] = root / top if top != "." else root
    found = apps or routers
    # nested hits collapse into their outermost folder
    paths = sorted(found, key=lambda x: (x.count("/"), x))
    keep: list[str] = []
    for rel in paths:
        if rel != "." and any(k != "." and rel.startswith(k + "/") for k in keep):
            continue
        keep.append(rel)
    if not keep:
        keep = ["."]
    services = {}
    for rel in keep:
        name = root.name if rel == "." else Path(rel).name
        services[name] = {"path": rel, "team": name, "owner": "Unassigned", "owner_role": ""}
    docs_dir = next((d for d in DOC_DIRS if (root / d).is_dir()), ".")
    return {"name": root.name, "docs_dir": docs_dir, "services": services, "ignore_routes": ["/healthz", "/health", "/docs", "/openapi.json"]}
