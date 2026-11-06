# Stavvros drift service

Finds places where docs and code disagree, using the Python AST together with an LLM, and tracks what people decide to do about each one.

It scans `../acme-shop`, a mock five-service FastAPI codebase with 12 planted drifts, and serves the drift UI in `../drift-ui`.

## Run it

You need Python 3.10+ and Node 18+. Use two terminals.

```bash
# 1. Backend (port 8100)
cd drift-service
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn stavvros_drift.api:create_app --factory --port 8100 --reload

# 2. UI (port 5175)
cd drift-ui
npm install
npm run dev
```

Open http://localhost:5175.

**Reset** in the UI restores `acme-shop` to how it was when the service first started, and clears all decisions. Approving a fix really edits the files in `acme-shop`. To make your own edits to `acme-shop` permanent, delete `drift-service/.stavvros-data/` so the next start takes a fresh snapshot.

Run the tests with `pytest`. They cover detection, the fix workflow, swapping the model, and the API.

## How detection works

| Step | What happens | Engine |
| --- | --- | --- |
| 1 | Parse every service: routes, response models, enums, constants, guard conditions, outbound HTTP calls, events published and consumed | Python `ast` (`extract/python_ast.py`) |
| 2 | Parse every doc: front matter, endpoint tables, enum lists, event tables | Markdown parser (`extract/docs.py`) |
| 3 | Pull checkable claims out of prose ("refunds within 30 days") | LLM: `extract_claims` |
| 4 | Compare doc tables with routes and models: missing or renamed routes, status codes, response fields, enum values | Deterministic rules |
| 5 | For each prose claim, find related code facts by keyword and ask the model whether they agree | Retrieval, then LLM: `judge_claim` |
| 6 | Check every outbound call against the target service's routes, and every documented event against publishers and subscribers | Deterministic rules |
| 7 | Rate routes that no doc mentions, using the service's docs as policy context | LLM: `triage_undocumented` |
| 8 | Write a short title and impact for each finding, and draft the doc or code fix | LLM: `summarize_finding`, `rewrite_doc_line` |

Each finding records how it was found (rule, engine, confidence, reasoning, the facts used). The UI shows this under "How Stavvros found this".

Findings have stable fingerprints. Decisions are saved in `.stavvros-data/stavvros.db`, so a dismissal survives rescans and restarts. A drift is resolved when a rescan no longer finds it.

## Swapping the model

All LLM work goes through one interface:

```python
# stavvros_drift/llm/base.py
class LLMBackend(ABC):
    name: str
    def generate(self, prompt: Prompt) -> str: ...   # return JSON matching prompt.schema
```

`Prompt` carries `system` and `user` text for a real model, a JSON `schema` for the answer, and the same material as structured `inputs`. The mock uses `inputs`; a real model uses the text. The `Reasoner` validates each answer against the schema, retries once, and caches answers on disk.

The mock (`llm/mock.py`) is deterministic and needs no network.

To use a real model, write one class and point `STAVVROS_LLM` at it. Two sketches follow. Neither has been run: the repo only ships the mock, so test any real backend before relying on it.

**Claude API** (`pip install anthropic`, set `ANTHROPIC_API_KEY`). Check Anthropic's docs for current model IDs.

```python
# my_models/claude.py
import anthropic
from stavvros_drift.llm.base import LLMBackend, Prompt

class ClaudeBackend(LLMBackend):
    name = "claude-sonnet"

    def __init__(self):
        self.client = anthropic.Anthropic()

    def generate(self, prompt: Prompt) -> str:
        msg = self.client.messages.create(
            model="claude-sonnet-5-5",  # check Anthropic's docs for current model IDs
            max_tokens=prompt.max_tokens,
            temperature=prompt.temperature,
            system=prompt.system + "\nReturn only JSON matching this schema:\n" + str(prompt.schema),
            messages=[{"role": "user", "content": prompt.user}],
        )
        return msg.content[0].text
```

**Local model with Ollama** (`ollama run llama3.1`):

```python
# my_models/ollama.py
import json, urllib.request
from stavvros_drift.llm.base import LLMBackend, Prompt

class OllamaBackend(LLMBackend):
    name = "ollama-llama3.1"

    def generate(self, prompt: Prompt) -> str:
        body = {"model": "llama3.1", "stream": False, "format": prompt.schema,
                "messages": [{"role": "system", "content": prompt.system},
                             {"role": "user", "content": prompt.user}],
                "options": {"temperature": prompt.temperature}}
        req = urllib.request.Request("http://localhost:11434/api/chat", json.dumps(body).encode(),
                                     {"Content-Type": "application/json"})
        return json.loads(urllib.request.urlopen(req).read())["message"]["content"]
```

Then start the service with:

```bash
STAVVROS_LLM=my_models.claude:ClaudeBackend uvicorn stavvros_drift.api:create_app --factory --port 8100
```

In code and tests, pass an instance instead: `build_container(llm=ClaudeBackend())`. `tests/test_llm_swap.py` shows this.

## Settings

| Variable | Default | Meaning |
| --- | --- | --- |
| `STAVVROS_CODEBASE` | `../acme-shop` | First repository, registered on first start (the demo). More are added from the UI or `POST /api/repos`. |
| `STAVVROS_DATA` | `.stavvros-data` | Decisions, the pristine snapshot, drafted diffs, issues, LLM cache |
| `STAVVROS_LLM` | `stavvros_drift.llm.mock:MockLLM` | `module:Class` of the model backend |
| `STAVVROS_LLM_CACHE` | `1` | Cache real-model answers on disk (the mock is never cached) |
| `STAVVROS_USER` | `Alex` | Name recorded on decisions |

`stavvros.json` lists each service's folder, team and owner, the docs folder, and routes to ignore (such as `/healthz`).

## API

| Method | Path | |
| --- | --- | --- |
| GET | `/api/drifts` | Inbox: one short row per drift |
| GET | `/api/drifts/{id}` | Full record: values, evidence, detection, actions, drafted fixes, history |
| POST | `/api/drifts/{id}/decision` | `{action: update_doc \| update_code \| dismiss, reason?}` |
| POST | `/api/drifts/{id}/send` | Send the drafted change for review, optionally with `edited` lines |
| POST | `/api/drifts/{id}/approve` | Stand-in for the reviewer merging: writes the change and rescans |
| POST | `/api/drifts/{id}/reopen` | Undo a decision that has not been merged |
| POST | `/api/scan` · GET `/api/scan` | Run a scan · last scan report |
| GET | `/api/claims` | Doc claims that matched the code, and ones that could not be checked |
| GET | `/api/graph` | Services, routes, docs and drift edges for the system map |
| POST | `/api/context` | `{question}`: what an AI assistant would get (the planned MCP tool) |
| POST | `/api/reset` | Restore the codebase and clear decisions |

## Planted drifts in acme-shop

| Drift | Found by |
| --- | --- |
| Checkout calls `POST /v1/refunds`; payments only has `/v2/refunds` | AST: outbound call vs routes |
| PRD: refunds within 30 days; `REFUND_WINDOW_DAYS = 14` | AST + LLM |
| PRD: partial refunds supported; `PARTIAL_REFUNDS_ENABLED = False` | AST + LLM |
| Security policy: 5 logins per minute; code allows 10 | AST + LLM |
| Orders API: `limit` at most 50; code allows 100 | AST + LLM |
| PRD response has `estimated_completion`; model returns `eta_seconds` | AST: table vs response model |
| Orders API: `/cancel`; code renamed it `/void` | AST: route similarity |
| Order statuses: doc has `CANCELLED`; enum has `VOIDED`, `REFUNDED` | AST: enum members |
| Notifications doc: emails on `payments.refund.requested`; no subscriber | AST: event subscriptions |
| `POST /auth/impersonate` exists and the security policy says it must be listed | AST + LLM triage |
| Two checkout routes with no doc at all | AST + LLM triage |

The same scan confirms 23 claims that do match (for example the $500 refund cap, the 12-character password minimum, and the required `Idempotency-Key` header).
