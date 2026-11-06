# The LLM layer

## The seam

```python
# stavvros_drift/llm/base.py
@dataclass(frozen=True)
class Prompt:
    task: str                  # "extract_claims" | "judge_claim" | "triage_undocumented" | "summarize_finding" | "rewrite_doc_line"
    system: str                # instructions for a real model
    user: str                  # the material as text
    schema: dict               # JSON Schema the answer must satisfy
    inputs: dict = {}          # the same material, structured (what the mock reads)
    temperature: float = 0.0
    max_tokens: int = 1200

class LLMBackend(ABC):
    name: str                  # shown in scan reports and the UI
    @abstractmethod
    def generate(self, prompt: Prompt) -> str: ...   # JSON text matching prompt.schema
```

A backend only turns a prompt into JSON text. It knows nothing about drift. Everything else (building prompts, validating answers, caching) is in `Reasoner`.

## Reasoner (`llm/reasoner.py`)

- One method per task: `extract_claims`, `judge`, `triage_undocumented`, `summarize`, `rewrite_line`.
- Strips ``` fences, parses JSON, checks it with a minimal schema validator (`_check`: object/array types, required keys, enums). Retries once, then raises `LLMError`.
- Caches by `sha256(backend name | task | inputs)`, in memory and, for non-mock backends, on disk at `.stavvros-data/llm-cache-<name>.json`.
- Counts calls per task and cache hits; these appear in the scan report.

## Tasks and schemas (`llm/prompts.py`)

| Task | Input | Output |
| --- | --- | --- |
| `extract_claims` | doc title, section, numbered lines | `claims: [{line, subject, keywords[], value{type,...}, quote}]` |
| `judge_claim` | one claim + up to 6 candidate code facts | `{verdict, evidence_fact_id, doc_value, code_value, reasoning, confidence}` |
| `triage_undocumented` | route (method, path, handler, docstring, dependencies, service) + policy lines | `{severity, reason}` |
| `summarize_finding` | kind, subject, values, context | `{title, impact}` |
| `rewrite_doc_line` | line, doc value, code value, claim | `{new_line}` |

Prompts share `SYSTEM_BASE` (careful, literal, JSON only, say when evidence is insufficient). The system texts are written for a real model; review them when you first switch.

## The mock (`llm/mock.py`)

`MockLLM.generate()` dispatches on `prompt.task` to `_<task>(prompt.inputs)` and returns `json.dumps(...)`. It is deterministic and rule-based:

- `extract_claims`: regexes per sentence for headers, "X are (not) supported", "Only … that have not … can be …", "never calls other services", money (`$500`) and number + unit, with bound words (at most, within, at least, by default). Keywords come from the sentence via a synonym table (`within → window`, `attempts → rate`, …).
- `judge_claim`: picks the candidate with the best keyword overlap and a compatible unit (constant-name suffix `_DAYS`, `_MINUTES`, `_CENTS`, `_PER_MINUTE`, `_LENGTH`, `_LIMIT`), compares normalized values, quotes the constant's comment.
- `triage_undocumented`: `high` for impersonate/admin/role routes (quotes the policy line), `low` otherwise.
- `summarize_finding` / `rewrite_doc_line`: templates.

It is tuned to how the acme-shop docs are written. It will miss claims a real model would catch on other codebases. Use it for tests and offline demos.

## Swapping in a real model

1. Write one class:

   ```python
   class ClaudeBackend(LLMBackend):
       name = "claude-sonnet"
       def __init__(self):
           import anthropic
           self.client = anthropic.Anthropic()          # reads ANTHROPIC_API_KEY
       def generate(self, prompt):
           msg = self.client.messages.create(
               model="claude-sonnet-5-5",               # check Anthropic's docs for current model IDs
               max_tokens=prompt.max_tokens, temperature=prompt.temperature,
               system=prompt.system + "\nReturn only JSON matching this schema:\n" + json.dumps(prompt.schema),
               messages=[{"role": "user", "content": prompt.user}])
           return msg.content[0].text
   ```

   An Ollama version is in `drift-service/README.md` (uses `format: prompt.schema` for constrained JSON).

2. Run with `STAVVROS_LLM=my_models.claude:ClaudeBackend`, or in code `build_container(llm=ClaudeBackend())`.

Neither example has been run yet. Expect to tune prompts: run `pytest` with the new backend injected (see `tests/test_llm_swap.py` for the pattern) and compare findings with the mock's. `test_detection.py` asserts exact mock titles, so a real model needs its own looser test.

## Adding an LLM task

1. Builder in `prompts.py` returning a `Prompt` with a schema.
2. Method on `Reasoner` calling `self._run(...)`.
3. `_<task>` handler in `MockLLM`.
4. Call it from the engine and add the task name to `Detection.llm_tasks` where relevant.
