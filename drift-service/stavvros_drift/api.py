"""HTTP API for the drift UI.

Run with: uvicorn stavvros_drift.api:create_app --factory --port 8100 --reload
"""
from __future__ import annotations

from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import views
from .container import Container, build_container
from .models import DriftListItem, DriftRecord, ScanReport
from .workflow import WorkflowError


class DecisionBody(BaseModel):
    action: str
    reason: Optional[str] = None


class SendBody(BaseModel):
    edited: Optional[dict[int, list[str]]] = None


class QuestionBody(BaseModel):
    question: str


def create_app(container: Optional[Container] = None) -> FastAPI:
    c = container or build_container()
    wf = c.workflow
    app = FastAPI(title="Stavvros drift service")
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

    def guard(fn, *a, **kw):
        try:
            return fn(*a, **kw)
        except KeyError:
            raise HTTPException(404, "Drift not found. It may have been fixed by the last scan.")
        except WorkflowError as e:
            raise HTTPException(409, str(e))

    @app.get("/api/health")
    def health():
        return {"ok": True, "codebase": str(c.settings.codebase), "llm": c.llm.name}

    @app.get("/api/scan", response_model=ScanReport)
    def last_scan():
        return wf.ensure_scanned().report

    @app.post("/api/scan", response_model=ScanReport)
    def scan():
        return wf.scan().report

    @app.get("/api/drifts", response_model=list[DriftListItem])
    def drifts():
        return wf.list()

    @app.get("/api/drifts/{fid}", response_model=DriftRecord)
    def drift(fid: str):
        return guard(wf.get, fid)

    @app.post("/api/drifts/{fid}/decision", response_model=DriftRecord)
    def decide(fid: str, body: DecisionBody):
        return guard(wf.decide, fid, body.action, body.reason)

    @app.post("/api/drifts/{fid}/send", response_model=DriftRecord)
    def send(fid: str, body: SendBody):
        return guard(wf.send, fid, body.edited)

    @app.post("/api/drifts/{fid}/approve", response_model=DriftRecord)
    def approve(fid: str):
        return guard(wf.approve, fid)

    @app.post("/api/drifts/{fid}/reopen", response_model=DriftRecord)
    def reopen(fid: str):
        return guard(wf.reopen, fid)

    @app.get("/api/claims")
    def claims():
        res = wf.ensure_scanned()
        return {
            "verified": [v.model_dump() for v in res.verified],
            "unverified": [u.model_dump() for u in res.unverified],
        }

    @app.get("/api/graph")
    def graph():
        return views.graph(wf)

    @app.post("/api/context")
    def context(body: QuestionBody):
        return views.assistant_context(wf, body.question)

    @app.post("/api/reset", response_model=ScanReport)
    def reset():
        return wf.reset().report

    return app

