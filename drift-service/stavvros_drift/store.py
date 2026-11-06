"""Where results live.

`JsonStore` is the single-repo file used by tests and quick scripts. `SqliteStore` keeps every repository's
decisions and last scan report in one database (`stavvros.db`), so the service can hold many repositories
and survive restarts. Both hold the same two things: drift records keyed by finding fingerprint, and the last report.
"""
from __future__ import annotations

import json
import sqlite3
import threading
from contextlib import closing
from pathlib import Path
from typing import Optional, Protocol

from .models import DriftRecord, RepoInfo, ScanReport


class StateStore(Protocol):
    def load(self) -> dict[str, DriftRecord]: ...
    def save(self, records: dict[str, DriftRecord]) -> None: ...
    def save_report(self, report: ScanReport) -> None: ...
    def load_report(self) -> Optional[ScanReport]: ...


class JsonStore:
    def __init__(self, path: Path) -> None:
        self.path = path

    def load(self) -> dict[str, DriftRecord]:
        if not self.path.exists():
            return {}
        raw = json.loads(self.path.read_text())
        return {k: DriftRecord.model_validate(v) for k, v in raw.get("records", {}).items()}

    def save(self, records: dict[str, DriftRecord]) -> None:
        self.path.write_text(json.dumps({"records": {k: v.model_dump() for k, v in records.items()}}, indent=1))

    def save_report(self, report: ScanReport) -> None:
        pass

    def load_report(self) -> Optional[ScanReport]:
        return None


SCHEMA = """
CREATE TABLE IF NOT EXISTS repos (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, source TEXT NOT NULL, location TEXT NOT NULL,
  root TEXT NOT NULL, demo INTEGER NOT NULL DEFAULT 0, added_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS records (
  repo_id TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE, finding_id TEXT NOT NULL, json TEXT NOT NULL,
  PRIMARY KEY (repo_id, finding_id)
);
CREATE TABLE IF NOT EXISTS reports (
  repo_id TEXT PRIMARY KEY REFERENCES repos(id) ON DELETE CASCADE, scanned_at TEXT NOT NULL, json TEXT NOT NULL
);
"""


class Db:
    """SQLite file shared by all repositories. One short-lived connection per call keeps it thread-safe."""

    def __init__(self, path: Path) -> None:
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        self.lock = threading.Lock()
        with self.conn() as c:
            c.executescript(SCHEMA)

    def conn(self) -> sqlite3.Connection:
        c = sqlite3.connect(self.path)
        c.execute("PRAGMA foreign_keys = ON")
        c.row_factory = sqlite3.Row
        return c

    # -- repositories --------------------------------------------------
    def repos(self) -> list[sqlite3.Row]:
        with closing(self.conn()) as c:
            return c.execute("SELECT * FROM repos ORDER BY added_at, id").fetchall()

    def repo(self, rid: str) -> Optional[sqlite3.Row]:
        with closing(self.conn()) as c:
            return c.execute("SELECT * FROM repos WHERE id = ?", (rid,)).fetchone()

    def add_repo(self, info: RepoInfo, root: Path) -> None:
        with self.lock, closing(self.conn()) as c, c:
            c.execute("INSERT INTO repos (id, name, source, location, root, demo, added_at) VALUES (?,?,?,?,?,?,?)",
                      (info.id, info.name, info.source, info.location, str(root), int(info.demo), info.added_at))

    def remove_repo(self, rid: str) -> None:
        with self.lock, closing(self.conn()) as c, c:
            c.execute("DELETE FROM repos WHERE id = ?", (rid,))


class SqliteStore:
    def __init__(self, db: Db, repo_id: str) -> None:
        self.db, self.rid = db, repo_id

    def load(self) -> dict[str, DriftRecord]:
        with closing(self.db.conn()) as c:
            rows = c.execute("SELECT finding_id, json FROM records WHERE repo_id = ?", (self.rid,)).fetchall()
        return {r["finding_id"]: DriftRecord.model_validate_json(r["json"]) for r in rows}

    def save(self, records: dict[str, DriftRecord]) -> None:
        with self.db.lock, closing(self.db.conn()) as c, c:
            c.execute("DELETE FROM records WHERE repo_id = ?", (self.rid,))
            c.executemany("INSERT INTO records (repo_id, finding_id, json) VALUES (?,?,?)",
                          [(self.rid, k, v.model_dump_json()) for k, v in records.items()])

    def save_report(self, report: ScanReport) -> None:
        with self.db.lock, closing(self.db.conn()) as c, c:
            c.execute("INSERT OR REPLACE INTO reports (repo_id, scanned_at, json) VALUES (?,?,?)",
                      (self.rid, report.scanned_at, report.model_dump_json()))

    def load_report(self) -> Optional[ScanReport]:
        with closing(self.db.conn()) as c:
            row = c.execute("SELECT json FROM reports WHERE repo_id = ?", (self.rid,)).fetchone()
        return ScanReport.model_validate_json(row["json"]) if row else None
