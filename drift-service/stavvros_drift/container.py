"""Dependency injection: build the object graph from settings.

Swap the language model without touching the engine:

    STAVVROS_LLM=stavvros_drift.llm.mock:MockLLM          # default
    STAVVROS_LLM=my_models.anthropic_backend:ClaudeBackend
    STAVVROS_LLM=my_models.ollama_backend:OllamaBackend

or, in code and tests, pass an instance: build_container(llm=MyBackend()).
"""
from __future__ import annotations

import importlib
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from .detect.engine import Detector
from .llm.base import LLMBackend
from .llm.reasoner import Reasoner
from .models import Person
from .workflow import Workflow

HERE = Path(__file__).resolve().parent.parent


@dataclass
class Settings:
    codebase: Path = Path(os.environ.get("STAVVROS_CODEBASE", HERE.parent / "acme-shop"))
    data_dir: Path = Path(os.environ.get("STAVVROS_DATA", HERE / ".stavvros-data"))
    llm: str = os.environ.get("STAVVROS_LLM", "stavvros_drift.llm.mock:MockLLM")
    cache_llm: bool = os.environ.get("STAVVROS_LLM_CACHE", "1") == "1"
    user_name: str = os.environ.get("STAVVROS_USER", "Alex")
    user_team: str = os.environ.get("STAVVROS_USER_TEAM", "Checkout")


def load_backend(spec: str) -> LLMBackend:
    """'package.module:ClassName' -> instance. The class reads its own config (API keys, URLs) from env."""
    module_name, _, cls_name = spec.partition(":")
    cls = getattr(importlib.import_module(module_name), cls_name)
    backend = cls()
    if not isinstance(backend, LLMBackend):
        raise TypeError(f"{spec} must subclass stavvros_drift.llm.base.LLMBackend")
    return backend


@dataclass
class Container:
    settings: Settings
    llm: LLMBackend
    reasoner: Reasoner
    detector: Detector
    workflow: Workflow


def build_container(settings: Optional[Settings] = None, llm: Optional[LLMBackend] = None) -> Container:
    s = settings or Settings()
    cfg_file = s.codebase / "stavvros.json"
    if not cfg_file.exists():
        raise FileNotFoundError(f"No stavvros.json in {s.codebase}. Set STAVVROS_CODEBASE to the codebase to scan.")
    cfg = json.loads(cfg_file.read_text())
    backend = llm or load_backend(s.llm)
    cache = s.data_dir / f"llm-cache-{backend.name.split()[0]}.json" if s.cache_llm and not backend.name.startswith("mock") else None
    reasoner = Reasoner(backend, cache_file=cache)
    detector = Detector(reasoner)
    workflow = Workflow(s.codebase, cfg, detector, s.data_dir, Person(name=s.user_name, team=s.user_team, role="Tech lead"))
    return Container(s, backend, reasoner, detector, workflow)
