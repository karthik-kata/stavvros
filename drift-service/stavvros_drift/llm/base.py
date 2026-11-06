"""The one seam between Stavvros and a language model.

To use a real model, write one class that subclasses `LLMBackend` and implements
`generate()`: send `prompt.system` and `prompt.user` to the model and return its
text, which must be JSON matching `prompt.schema`. Then point STAVVROS_LLM at it:

    STAVVROS_LLM=my_package.my_module:MyBackend

Nothing else changes. See README.md for Anthropic and Ollama examples.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class Prompt:
    task: str                    # "extract_claims", "judge_claim", ...
    system: str                  # instructions for a real model
    user: str                    # the material, rendered as text
    schema: dict[str, Any]       # JSON Schema the answer must satisfy
    inputs: dict[str, Any] = field(default_factory=dict)  # the same material, structured
    temperature: float = 0.0
    max_tokens: int = 1200


class LLMBackend(ABC):
    """Implement `generate` to plug in any model: a hosted API, a local server, or a test double."""

    #: Shown in scan reports and the UI.
    name: str = "unnamed-llm"

    @abstractmethod
    def generate(self, prompt: Prompt) -> str:
        """Return the model's answer as a JSON string matching `prompt.schema`."""
        raise NotImplementedError


class LLMError(RuntimeError):
    """The model returned something that does not match the schema."""
