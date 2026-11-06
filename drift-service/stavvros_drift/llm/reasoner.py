"""Calls the LLM backend for each reasoning task, checks the answer, and caches it."""
from __future__ import annotations

import hashlib
import json
from collections import Counter
from pathlib import Path
from typing import Any, Optional

from . import prompts
from .base import LLMBackend, LLMError, Prompt


def _check(schema: dict[str, Any], value: Any, path: str = "$") -> None:
    """Minimal JSON-schema check: types of objects/arrays and required keys."""
    t = schema.get("type")
    if t == "object" or "properties" in schema:
        if not isinstance(value, dict):
            raise LLMError(f"{path} should be an object")
        for k in schema.get("required", []):
            if k not in value:
                raise LLMError(f"{path}.{k} is missing")
        for k, sub in schema.get("properties", {}).items():
            if k in value and value[k] is not None:
                _check(sub, value[k], f"{path}.{k}")
    elif t == "array":
        if not isinstance(value, list):
            raise LLMError(f"{path} should be an array")
        for i, item in enumerate(value):
            _check(schema.get("items", {}), item, f"{path}[{i}]")
    elif "enum" in schema and value not in schema["enum"]:
        raise LLMError(f"{path} must be one of {schema['enum']}")


class Reasoner:
    def __init__(self, backend: LLMBackend, cache_file: Optional[Path] = None, retries: int = 1) -> None:
        self.backend = backend
        self.cache_file = cache_file
        self.retries = retries
        self.calls: Counter[str] = Counter()
        self.cache_hits = 0
        self._cache: dict[str, Any] = {}
        if cache_file and cache_file.exists():
            try:
                self._cache = json.loads(cache_file.read_text())
            except json.JSONDecodeError:
                self._cache = {}

    def reset_counters(self) -> None:
        self.calls.clear()
        self.cache_hits = 0

    def _run(self, p: Prompt) -> dict[str, Any]:
        key = hashlib.sha256(f"{self.backend.name}|{p.task}|{json.dumps(p.inputs, sort_keys=True, default=str)}".encode()).hexdigest()
        if key in self._cache:
            self.cache_hits += 1
            return self._cache[key]
        last: Exception | None = None
        for _ in range(self.retries + 1):
            self.calls[p.task] += 1
            raw = self.backend.generate(p)
            try:
                text = raw.strip()
                if text.startswith("```"):
                    text = text.strip("`").split("\n", 1)[1] if "\n" in text else text
                out = json.loads(text)
                _check(p.schema, out)
                self._cache[key] = out
                return out
            except (json.JSONDecodeError, LLMError) as e:
                last = e
        raise LLMError(f"{self.backend.name} gave an invalid answer for {p.task}: {last}")

    def save(self) -> None:
        if self.cache_file:
            self.cache_file.parent.mkdir(parents=True, exist_ok=True)
            self.cache_file.write_text(json.dumps(self._cache))

    # Tasks ------------------------------------------------------------------
    def extract_claims(self, doc_title: str, section: str, lines: list[tuple[int, str]]) -> list[dict[str, Any]]:
        return self._run(prompts.extract_claims(doc_title, section, lines))["claims"]

    def judge(self, claim: dict[str, Any], candidates: list[dict[str, Any]]) -> dict[str, Any]:
        return self._run(prompts.judge_claim(claim, candidates))

    def triage_undocumented(self, route: dict[str, Any], policy_lines: list[str]) -> dict[str, Any]:
        return self._run(prompts.triage_undocumented(route, policy_lines))

    def summarize(self, finding: dict[str, Any]) -> dict[str, Any]:
        return self._run(prompts.summarize(finding))

    def rewrite_line(self, line: str, doc_value: str, code_value: str, claim: dict[str, Any]) -> str:
        return self._run(prompts.rewrite_line(line, doc_value, code_value, claim))["new_line"]
