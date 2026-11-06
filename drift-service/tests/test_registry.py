import shutil
import textwrap

import pytest
from fastapi.testclient import TestClient

from stavvros_drift.api import create_app
from stavvros_drift.container import Settings
from stavvros_drift.discover import discover_config
from stavvros_drift.registry import Registry, RepoError

from .conftest import ACME


def make_registry(tmp_path):
    code = tmp_path / "acme-shop"
    shutil.copytree(ACME, code, ignore=shutil.ignore_patterns("__pycache__"))
    return Registry(Settings(codebase=code, data_dir=tmp_path / "data", cache_llm=False)), code


def bare_repo(tmp_path):
    """A small repo with no stavvros.json: one FastAPI app and a doc that is wrong about it."""
    root = tmp_path / "bare"
    (root / "api").mkdir(parents=True)
    (root / "docs").mkdir()
    (root / "api/main.py").write_text(textwrap.dedent('''
        from fastapi import FastAPI
        app = FastAPI()

        @app.get("/widgets")
        def widgets():
            return []

        @app.get("/gadgets")
        def gadgets():
            return []
    '''))
    (root / "docs/api.md").write_text(textwrap.dedent('''
        ---
        title: Widget API
        kind: api
        services: [api]
        ---
        # Widget API

        | Method | Path | Description |
        | --- | --- | --- |
        | GET | /widgets | List widgets |
        | GET | /sprockets | List sprockets |
    '''))
    return root


def test_demo_repo_is_seeded_and_scans(tmp_path):
    reg, _ = make_registry(tmp_path)
    repos = reg.list()
    assert [r.id for r in repos] == ["acme-shop"] and repos[0].demo
    assert len(reg.workflow("acme-shop").scan().findings) == 12


def test_discovery_finds_services_without_config(tmp_path):
    cfg = discover_config(bare_repo(tmp_path))
    assert list(cfg["services"]) == ["api"] and cfg["docs_dir"] == "docs"


def test_add_real_folder_and_scan(tmp_path):
    reg, _ = make_registry(tmp_path)
    info = reg.add(str(bare_repo(tmp_path)))
    assert info.id == "bare" and info.source == "path"
    titles = " | ".join(f.title for f in reg.workflow("bare").scan().findings)
    assert "/sprockets" in titles and "/gadgets" in titles  # documented but missing, and exposed but undocumented


def test_add_rejects_bad_and_duplicate_locations(tmp_path):
    reg, _ = make_registry(tmp_path)
    with pytest.raises(RepoError):
        reg.add(str(tmp_path / "nowhere"))
    reg.add(str(bare_repo(tmp_path)))
    with pytest.raises(RepoError):
        reg.add(str(tmp_path / "bare"))


def test_results_survive_restart(tmp_path):
    reg, code = make_registry(tmp_path)
    wf = reg.workflow("acme-shop")
    first = wf.scan().findings[0]
    wf.decide(first.id, "dismiss", "intentional")
    again = Registry(Settings(codebase=code, data_dir=tmp_path / "data", cache_llm=False))
    info = again.get("acme-shop")
    assert info.last_scanned and info.open_drifts == 11
    assert again.workflow("acme-shop").get(first.id).state == "dismissed"


def test_remove_never_touches_the_folder(tmp_path):
    reg, _ = make_registry(tmp_path)
    root = bare_repo(tmp_path)
    reg.add(str(root))
    reg.remove("bare")
    assert root.exists() and [r.id for r in reg.list()] == ["acme-shop"]


def test_real_repo_cannot_be_reset(tmp_path):
    reg, _ = make_registry(tmp_path)
    reg.add(str(bare_repo(tmp_path)))
    api = TestClient(create_app(reg))
    assert api.post("/api/repos/bare/reset").status_code == 409


def test_api_adds_and_lists_repos(tmp_path):
    reg, _ = make_registry(tmp_path)
    api = TestClient(create_app(reg))
    assert api.post("/api/repos", json={"location": "/definitely/not/here"}).status_code == 422
    added = api.post("/api/repos", json={"location": str(bare_repo(tmp_path))}).json()
    assert {r["id"] for r in api.get("/api/repos").json()} == {"acme-shop", added["id"]}
    assert api.get(f"/api/repos/{added['id']}/drifts").json()  # first read scans
    assert api.get("/api/repos/nope/drifts").status_code == 404


def test_add_git_repo_clones_it(tmp_path):
    import subprocess
    reg, _ = make_registry(tmp_path)
    src = bare_repo(tmp_path)
    for cmd in (["init", "-q"], ["add", "."], ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "x"]):
        subprocess.run(["git", "-C", str(src), *cmd], check=True)
    info = reg.add(f"file://{src}", name="cloned")
    assert info.source == "git" and (tmp_path / "data/repos/cloned/src/api/main.py").exists()
    assert reg.workflow("cloned").scan().findings
    reg.refresh_source("cloned")  # pull is a no-op, must not raise
