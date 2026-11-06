"""What people do about drift: decide, draft a change, send it, merge it, dismiss.

State lives in a JSON file keyed by finding fingerprint, so decisions survive rescans.
Approving a change writes it into the scanned codebase and rescans, so a fixed drift
disappears because the docs and code really agree again.
"""
from __future__ import annotations

import shutil
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from .detect.engine import Detector, ScanResult
from .extract.docs import parse_doc
from .store import JsonStore, StateStore
from .models import DriftListItem, DriftRecord, Finding, Issue, Person, ProposedChange, TimelineEvent

ACTIVE = ("open", "change_drafted", "in_review", "issue_open")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class WorkflowError(ValueError):
    pass


class Workflow:
    def __init__(self, root: Path, cfg: dict[str, Any], detector: Detector, data_dir: Path, current_user: Person,
                 store: Optional[StateStore] = None, keep_pristine: bool = True) -> None:
        self.root, self.cfg, self.detector, self.data_dir, self.user = root, cfg, detector, data_dir, current_user
        self.store: StateStore = store or JsonStore(data_dir / "state.json")
        self.keep_pristine = keep_pristine
        self.pristine = data_dir / "pristine"
        self.lock = threading.RLock()
        self.records: dict[str, DriftRecord] = {}
        self.last: Optional[ScanResult] = None
        data_dir.mkdir(parents=True, exist_ok=True)
        if keep_pristine and not self.pristine.exists():
            shutil.copytree(root, self.pristine, ignore=shutil.ignore_patterns("__pycache__", ".git"))
        self.records = self.store.load()

    # ------------------------------------------------------------------ #
    def _save(self) -> None:
        self.store.save(self.records)

    def scan(self) -> ScanResult:
        with self.lock:
            res = self.detector.scan(self.root, self.cfg)
            seen = set()
            for f in res.findings:
                seen.add(f.id)
                rec = self.records.get(f.id)
                if rec is None or rec.state == "resolved":
                    # New, or came back after being fixed.
                    rec = DriftRecord(finding=f, first_seen=_now(), timeline=[TimelineEvent(at=_now(), label="Detected", detail=f.detection.rule)])
                    self.records[f.id] = rec
                else:
                    rec.finding = f
            for fid, rec in self.records.items():
                if fid not in seen and rec.state in ACTIVE:
                    rec.state = "resolved"
                    rec.timeline = [e for e in rec.timeline if not e.pending]
                    rec.timeline.append(TimelineEvent(at=_now(), label="No longer detected", detail="Docs and code agree after the latest scan"))
            self.last = res
            self.store.save_report(res.report)
            self._save()
            return res

    def ensure_scanned(self) -> ScanResult:
        return self.last or self.scan()

    # ------------------------------------------------------------------ #
    def list(self) -> list[DriftListItem]:
        self.ensure_scanned()
        order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
        items = [
            DriftListItem(
                id=r.finding.id, title=r.finding.title, severity=r.finding.severity, category=r.finding.category, state=r.state,
                service=r.finding.service, doc_title=r.finding.doc.label if r.finding.doc else None,
                doc_value=r.finding.doc_value, code_value=r.finding.code_value, engine=r.finding.detection.engine, first_seen=r.first_seen,
            )
            for r in self.records.values()
        ]
        return sorted(items, key=lambda i: (order[i.severity], i.title))

    def get(self, fid: str) -> DriftRecord:
        self.ensure_scanned()
        rec = self.records.get(fid)
        if not rec:
            raise KeyError(fid)
        return rec

    # ------------------------------------------------------------------ #
    def decide(self, fid: str, action: str, reason: Optional[str] = None) -> DriftRecord:
        with self.lock:
            rec = self.get(fid)
            if rec.state not in ("open", "change_drafted"):
                raise WorkflowError(f"This drift is {rec.state.replace('_', ' ')}; reopen it first.")
            f = rec.finding
            if action not in {a.id for a in f.actions}:
                raise WorkflowError(f"{action} is not available for this drift")
            rec.decision, rec.decided_by, rec.reason = action, self.user, reason
            if action == "dismiss":
                if not (reason or "").strip():
                    raise WorkflowError("Give a reason so the next person knows why")
                rec.state = "dismissed"
                rec.timeline.append(TimelineEvent(at=_now(), label=f"Dismissed by {self.user.name}", detail=reason or ""))
            else:
                change = f.fixes.get(action)
                if change:
                    rec.change = change.model_copy(deep=True)
                    rec.state = "change_drafted"
                    rec.timeline.append(TimelineEvent(at=_now(), label=f"Triaged by {self.user.name}",
                                                      detail="The code is right; the doc needs updating" if action == "update_doc" else "The doc is right; the code needs fixing"))
                else:
                    owner = f.code.owner if f.code else self.user
                    rec.issue = Issue(
                        title=f"{f.title} ({f.service})", team=owner.team,
                        body=f"The doc is correct and the code has drifted.\n\nDoc says: {f.doc_value}\nCode does: {f.code_value}\n\n{f.detection.reasoning}",
                    )
                    rec.state = "issue_open"
                    (self.data_dir / "issues").mkdir(exist_ok=True)
                    (self.data_dir / "issues" / f"{fid}.md").write_text(f"# {rec.issue.title}\n\nTeam: {rec.issue.team}\n\n{rec.issue.body}\n")
                    rec.timeline += [
                        TimelineEvent(at=_now(), label=f"Triaged by {self.user.name}", detail="The doc is right; the code needs fixing"),
                        TimelineEvent(at=_now(), label=f"Issue opened for {owner.team}"),
                        TimelineEvent(at=_now(), label="Code fixed", detail=f"Waiting on {owner.team}", pending=True),
                    ]
            self._save()
            return rec

    def send(self, fid: str, edited: Optional[dict[int, list[str]]] = None) -> DriftRecord:
        with self.lock:
            rec = self.get(fid)
            if rec.state != "change_drafted" or not rec.change:
                raise WorkflowError("Choose how to fix this drift first")
            if edited:
                for h in rec.change.hunks:
                    if h.line in edited:
                        h.add = edited[h.line]
            rec.state = "in_review"
            rec.timeline = [e for e in rec.timeline if not e.pending]
            rec.timeline += [
                TimelineEvent(at=_now(), label=f"Sent to {rec.change.reviewer.name} for review", detail=rec.change.path),
                TimelineEvent(at=_now(), label="Merged", detail=f"Waiting on {rec.change.reviewer.name}", pending=True),
            ]
            (self.data_dir / "changes").mkdir(exist_ok=True)
            (self.data_dir / "changes" / f"{fid}.diff").write_text(_as_diff(rec.change))
            self._save()
            return rec

    def approve(self, fid: str) -> DriftRecord:
        """Stand-in for the reviewer merging the change: write it to disk and rescan."""
        with self.lock:
            rec = self.get(fid)
            if rec.state != "in_review" or not rec.change:
                raise WorkflowError("Only a change that is in review can be approved")
            self._apply(rec.change)
            rec.timeline = [e for e in rec.timeline if not e.pending]
            rec.timeline.append(TimelineEvent(at=_now(), label=f"Approved by {rec.change.reviewer.name} and merged", detail=rec.change.path))
            rec.state = "resolved"
            self._save()
            self.scan()
            return self.records[fid]

    def reopen(self, fid: str) -> DriftRecord:
        with self.lock:
            rec = self.get(fid)
            if rec.state == "resolved":
                raise WorkflowError("This drift was fixed in the files. Use Reset demo to undo merged changes.")
            rec.state, rec.decision, rec.decided_by, rec.reason, rec.change, rec.issue = "open", None, None, None, None, None
            rec.timeline = [rec.timeline[0], TimelineEvent(at=_now(), label=f"Reopened by {self.user.name}")]
            self._save()
            return rec

    def reset(self) -> ScanResult:
        """Restore the scanned codebase from the pristine copy and forget all decisions."""
        if not self.keep_pristine:
            raise WorkflowError("Only the demo repository can be reset; this one is your real code.")
        with self.lock:
            for sub in self.pristine.iterdir():
                dest = self.root / sub.name
                if dest.is_dir():
                    shutil.rmtree(dest)
                elif dest.exists():
                    dest.unlink()
                if sub.is_dir():
                    shutil.copytree(sub, dest)
                else:
                    shutil.copy2(sub, dest)
            for extra in ("issues", "changes"):
                shutil.rmtree(self.data_dir / extra, ignore_errors=True)
            self.records = {}
            self.last = None
            return self.scan()

    # ------------------------------------------------------------------ #
    def _apply(self, change: ProposedChange) -> None:
        path = self.root / change.path
        if change.creates_file and path.exists():
            # Another change already created this doc: add just the new table row.
            doc = parse_doc(self.root, path)
            lines = doc.lines
            at = doc.endpoint_tables[-1][1] if doc.endpoint_tables else len(lines)
            lines.insert(at, change.hunks[0].add[-1])
            path.write_text("\n".join(lines))
            return
        if change.creates_file:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("\n".join(change.hunks[0].add) + "\n")
            return
        lines = path.read_text().split("\n")
        for h in sorted(change.hunks, key=lambda h: -h.line):
            current = lines[h.line - 1:h.line - 1 + len(h.remove)]
            if current != h.remove:
                raise WorkflowError(f"{change.path} changed since the fix was drafted (line {h.line}). Rescan and try again.")
            lines[h.line - 1:h.line - 1 + len(h.remove)] = h.add
        path.write_text("\n".join(lines))


def _as_diff(c: ProposedChange) -> str:
    out = [f"--- a/{c.path}", f"+++ b/{c.path}"]
    for h in c.hunks:
        out.append(f"@@ -{h.line},{len(h.remove)} +{h.line},{len(h.add)} @@")
        out += [f"-{x}" for x in h.remove] + [f"+{x}" for x in h.add]
    return "\n".join(out) + "\n"
