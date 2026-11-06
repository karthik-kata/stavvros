"""HTTP API for the drift UI.

Run with: uvicorn stavvros_drift.api:create_app --factory --port 8100 --reload
"""
from __future__ import annotations

from typing import Optional, Union

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import views
from .container import Container
from .models import DriftListItem, DriftRecord, RepoInfo, ScanReport
from .registry import Registry, RepoError
from .workflow import Workflow, WorkflowError


class DecisionBody(BaseModel):
    action: str
    reason: Optional[str] = None


class SendBody(BaseModel):
    edited: Optional[dict[int, list[str]]] = None


class QuestionBody(BaseModel):
    question: str


class RepoBody(BaseModel):
    location: str          # folder path or git URL
    name: Optional[str] = None


def create_app(source: Union[Registry, Container, None] = None) -> FastAPI:
    """`source` is a Registry (the service), a Container (tests: one repo called "default"), or None (build from env)."""
    reg = source if isinstance(source, Registry) else Registry.single(source) if isinstance(source, Container) else Registry()
    app = FastAPI(title="Stavvros drift service")
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

    def guard(fn, *a, **kw):
        try:
            return fn(*a, **kw)
        except RepoError as e:
            raise HTTPException(422, str(e))
        except KeyError:
            raise HTTPException(404, "Not found. A drift may have been fixed by the last scan, or the repository was removed.")
        except WorkflowError as e:
            raise HTTPException(409, str(e))

    def wf(rid: str) -> Workflow:
        return guard(reg.workflow, rid)

    def scanned(rid: str):
        """A scan that reports problems with the repository (not a crash) as 422."""
        try:
            return guard(lambda: wf(rid).scan())
        except HTTPException:
            raise
        except Exception as e:  # unparseable or unusual repos should say so, not 500
            raise HTTPException(422, f"Could not scan this repository: {e}")

    @app.get("/api/health")
    def health():
        return {"ok": True, "llm": reg.llm.name, "repos": len(reg.list())}

    # ---- repositories -------------------------------------------------
    @app.get("/api/repos", response_model=list[RepoInfo])
    def repos():
        return reg.list()

    @app.post("/api/repos", response_model=RepoInfo)
    def add_repo(body: RepoBody):
        return guard(reg.add, body.location, body.name)

    @app.delete("/api/repos/{rid}")
    def remove_repo(rid: str):
        guard(reg.remove, rid)
        return {"ok": True}

    # ---- one repository ------------------------------------------------
    @app.get("/api/repos/{rid}/scan", response_model=ScanReport)
    def last_scan(rid: str):
        wf_ = wf(rid)
        if wf_.last is None:
            return scanned(rid).report
        return wf_.last.report

    @app.post("/api/repos/{rid}/scan", response_model=ScanReport)
    def scan(rid: str):
        guard(reg.refresh_source, rid)
        return scanned(rid).report

    @app.get("/api/repos/{rid}/drifts", response_model=list[DriftListItem])
    def drifts(rid: str):
        w = wf(rid)
        if w.last is None:
            scanned(rid)
        return w.list()

    @app.get("/api/repos/{rid}/drifts/{fid}", response_model=DriftRecord)
    def drift(rid: str, fid: str):
        return guard(wf(rid).get, fid)

    @app.post("/api/repos/{rid}/drifts/{fid}/decision", response_model=DriftRecord)
    def decide(rid: str, fid: str, body: DecisionBody):
        return guard(wf(rid).decide, fid, body.action, body.reason)

    @app.post("/api/repos/{rid}/drifts/{fid}/send", response_model=DriftRecord)
    def send(rid: str, fid: str, body: SendBody):
        return guard(wf(rid).send, fid, body.edited)

    @app.post("/api/repos/{rid}/drifts/{fid}/approve", response_model=DriftRecord)
    def approve(rid: str, fid: str):
        return guard(wf(rid).approve, fid)

    @app.post("/api/repos/{rid}/drifts/{fid}/reopen", response_model=DriftRecord)
    def reopen(rid: str, fid: str):
        return guard(wf(rid).reopen, fid)

    @app.get("/api/repos/{rid}/claims")
    def claims(rid: str):
        w = wf(rid)
        res = w.last or scanned(rid)
        return {
            "verified": [v.model_dump() for v in res.verified],
            "unverified": [u.model_dump() for u in res.unverified],
        }

    @app.get("/api/repos/{rid}/graph")
    def graph(rid: str):
        w = wf(rid)
        if w.last is None:
            scanned(rid)
        return views.graph(w)

    @app.post("/api/repos/{rid}/context")
    def context(rid: str, body: QuestionBody):
        w = wf(rid)
        if w.last is None:
            scanned(rid)
        return views.assistant_context(w, body.question)

    @app.post("/api/repos/{rid}/reset", response_model=ScanReport)
    def reset(rid: str):
        return guard(wf(rid).reset).report

    return app
