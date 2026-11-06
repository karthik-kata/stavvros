"""The repositories Stavvros watches, and the results stored for each.

A repository is added by a folder path on this machine (scanned in place) or a git URL (cloned into the data
directory, pulled before each scan). Everything learned about it (decisions, last scan report) lives in
SQLite (`store.py`), so the service restarts without losing work.
"""
from __future__ import annotations

import re
import shutil
import subprocess
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from .container import Container, Settings, load_backend, make_workflow
from .discover import load_config
from .llm.base import LLMBackend
from .models import RepoInfo
from .store import Db, JsonStore, SqliteStore
from .workflow import Workflow

GIT_URL = re.compile(r"^(https?://|git@|ssh://|git://|file://)|\.git$")


class RepoError(ValueError):
    pass


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-") or "repo"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Registry:
    def __init__(self, settings: Optional[Settings] = None, llm: Optional[LLMBackend] = None) -> None:
        self.settings = settings or Settings()
        self.data_dir = self.settings.data_dir
        self.llm = llm or load_backend(self.settings.llm)
        self.db = Db(self.data_dir / "stavvros.db")
        self._wf: dict[str, Workflow] = {}
        self._lock = threading.RLock()
        if not self.db.repos() and (self.settings.codebase / "stavvros.json").exists():
            self._seed_demo()

    # -- the single-container shortcut tests use ---------------------------
    @classmethod
    def single(cls, container: Container) -> "Registry":
        """Wrap an already-built container as the only repository, with its own in-memory bookkeeping."""
        r = cls.__new__(cls)
        r.settings, r.data_dir, r.llm = container.settings, container.settings.data_dir, container.llm
        r.db = Db(r.data_dir / "stavvros.db")
        r._wf, r._lock = {}, threading.RLock()
        info = RepoInfo(id="default", name=container.workflow.cfg.get("name", "default"), source="path",
                        location=str(container.settings.codebase), demo=True, added_at=_now())
        r.db.add_repo(info, container.settings.codebase)
        r._wf["default"] = container.workflow
        return r

    def _seed_demo(self) -> None:
        root = self.settings.codebase
        info = RepoInfo(id=_slug(root.name), name=root.name, source="path", location=str(root), demo=True, added_at=_now())
        self.db.add_repo(info, root)
        # carry over decisions made before the registry existed
        old_pristine, old_state = self.data_dir / "pristine", self.data_dir / "state.json"
        rdir = self.repo_dir(info.id)
        rdir.mkdir(parents=True, exist_ok=True)
        if old_pristine.exists():
            shutil.move(str(old_pristine), str(rdir / "pristine"))
        if old_state.exists():
            SqliteStore(self.db, info.id).save(JsonStore(old_state).load())
            old_state.rename(old_state.with_suffix(".json.migrated"))

    # -- queries ---------------------------------------------------------
    def repo_dir(self, rid: str) -> Path:
        return self.data_dir / "repos" / rid

    def _info(self, row) -> RepoInfo:
        store = SqliteStore(self.db, row["id"])
        report = store.load_report()
        recs = store.load()
        return RepoInfo(
            id=row["id"], name=row["name"], source=row["source"], location=row["location"], demo=bool(row["demo"]),
            added_at=row["added_at"], last_scanned=report.scanned_at if report else None,
            open_drifts=sum(1 for r in recs.values() if r.state == "open") if report else None,
        )

    def list(self) -> list[RepoInfo]:
        return [self._info(r) for r in self.db.repos()]

    def get(self, rid: str) -> RepoInfo:
        row = self.db.repo(rid)
        if not row:
            raise KeyError(rid)
        return self._info(row)

    def workflow(self, rid: str) -> Workflow:
        with self._lock:
            if rid in self._wf:
                return self._wf[rid]
            row = self.db.repo(rid)
            if not row:
                raise KeyError(rid)
            root = Path(row["root"])
            if not root.is_dir():
                raise RepoError(f"{root} no longer exists. Remove this repository or restore the folder.")
            try:
                cfg = load_config(root)
            except ValueError as e:
                raise RepoError(str(e))
            rdir = self.repo_dir(rid)
            rdir.mkdir(parents=True, exist_ok=True)
            _, _, wf = make_workflow(self.settings, self.llm, root, cfg, rdir, store=SqliteStore(self.db, rid), keep_pristine=bool(row["demo"]))
            self._wf[rid] = wf
            return wf

    # -- changes ---------------------------------------------------------
    def add(self, location: str, name: Optional[str] = None) -> RepoInfo:
        location = location.strip()
        if not location:
            raise RepoError("Enter a folder path or a git URL.")
        existing = {r["location"]: r["id"] for r in self.db.repos()}
        if GIT_URL.search(location):
            source, root_name = "git", re.sub(r"\.git$", "", location.rstrip("/")).rsplit("/", 1)[-1].rsplit(":", 1)[-1]
        else:
            path = Path(location).expanduser().resolve()
            if not path.is_dir():
                raise RepoError(f"{path} is not a folder on this machine.")
            location, source, root_name = str(path), "path", path.name
        if location in existing:
            raise RepoError(f"Already added as “{existing[location]}”.")
        base = _slug(name or root_name)
        rid, n = base, 2
        while self.db.repo(rid):
            rid, n = f"{base}-{n}", n + 1
        rdir = self.repo_dir(rid)
        if source == "git":
            root = rdir / "src"
            rdir.mkdir(parents=True, exist_ok=True)
            proc = subprocess.run(["git", "clone", "--depth", "1", location, str(root)], capture_output=True, text=True, timeout=300)
            if proc.returncode != 0:
                shutil.rmtree(rdir, ignore_errors=True)
                raise RepoError("git clone failed: " + (proc.stderr.strip().splitlines() or ["unknown error"])[-1])
        else:
            root = Path(location)
        try:
            load_config(root)
        except ValueError as e:
            shutil.rmtree(rdir, ignore_errors=True)
            raise RepoError(str(e))
        info = RepoInfo(id=rid, name=name or root_name, source=source, location=location, added_at=_now())
        self.db.add_repo(info, root)
        return info

    def remove(self, rid: str) -> None:
        row = self.db.repo(rid)
        if not row:
            raise KeyError(rid)
        with self._lock:
            self._wf.pop(rid, None)
            self.db.remove_repo(rid)
            shutil.rmtree(self.repo_dir(rid), ignore_errors=True)  # only our own copy; a path repo's files are never touched

    def refresh_source(self, rid: str) -> None:
        """Before a scan: bring a git clone up to date. A folder on disk is already current."""
        row = self.db.repo(rid)
        if row and row["source"] == "git":
            subprocess.run(["git", "-C", row["root"], "pull", "--ff-only", "--depth", "1"], capture_output=True, text=True, timeout=300)
