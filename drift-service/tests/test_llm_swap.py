"""Swapping the model is one class: subclass LLMBackend, implement generate()."""
import json

from stavvros_drift.container import Settings, build_container, load_backend
from stavvros_drift.llm.base import LLMBackend, Prompt
from stavvros_drift.llm.mock import MockLLM


class RecordingBackend(LLMBackend):
    """A stand-in for a real model: sees exactly the prompts a real model would."""

    name = "recording"

    def __init__(self) -> None:
        self.prompts: list[Prompt] = []
        self._inner = MockLLM()

    def generate(self, prompt: Prompt) -> str:
        self.prompts.append(prompt)
        return self._inner.generate(prompt)


class ConservativeJudge(MockLLM):
    """A model that never calls anything drift: proves the verdict really comes from the backend."""

    name = "conservative"

    def generate(self, prompt: Prompt) -> str:
        out = json.loads(super().generate(prompt))
        if prompt.task == "judge_claim" and out["verdict"] == "drift":
            out["verdict"] = "no_evidence"
        return json.dumps(out)


def test_injected_backend_receives_real_prompts(tmp_path, container):
    rec = RecordingBackend()
    c = build_container(Settings(codebase=container.settings.codebase, data_dir=tmp_path / "d2", cache_llm=False), llm=rec)
    c.workflow.scan()
    tasks = {p.task for p in rec.prompts}
    assert {"extract_claims", "judge_claim", "triage_undocumented", "summarize_finding", "rewrite_doc_line"} <= tasks
    judge = next(p for p in rec.prompts if p.task == "judge_claim")
    assert "Claim:" in judge.user and judge.schema["required"]


def test_backend_decides_verdicts(tmp_path, container):
    c = build_container(Settings(codebase=container.settings.codebase, data_dir=tmp_path / "d3", cache_llm=False), llm=ConservativeJudge())
    kinds = {f.kind for f in c.workflow.scan().findings}
    assert "rule_mismatch" not in kinds            # LLM-judged findings gone
    assert "broken_call" in kinds                  # AST findings unaffected


def test_load_backend_from_spec():
    assert isinstance(load_backend("stavvros_drift.llm.mock:MockLLM"), MockLLM)
