# Stavvros

Stavvros finds places where engineering docs (PRDs, API references, policies) no longer match the code, and helps people fix them. It is an I2P (Idea to Product) student project. The current focus is **drift detection**; the knowledge-graph view is kept but secondary.

## Repository layout

| Path | What it is | Edit? |
| --- | --- | --- |
| `drift-service/` | Python backend: AST extraction, doc parsing, LLM reasoning, drift rules, workflow, FastAPI | Yes |
| `drift-ui/` | React + Vite + Tailwind UI for the drift inbox, system map, assistant preview | Yes |
| `acme-shop/` | Mock e-commerce codebase (5 FastAPI services + 5 docs) with 12 planted drifts. The thing being scanned | Only to add or change test scenarios |
| `docs/` | Architecture docs for this repo. Start with `docs/overview.md` | Keep in sync with code |
| `archive/` | Earlier prototypes (old backend/frontend, last week's static demo, interview notes, mentor deck material) | No. Reference only |

## Commands

```bash
# Backend: http://localhost:8100
cd drift-service && source .venv/bin/activate   # first time: python3 -m venv .venv && pip install -r requirements.txt
uvicorn stavvros_drift.api:create_app --factory --port 8100 --reload
pytest                                           # 23 tests: detection, workflow, LLM swap, API, repositories

# UI: http://localhost:5175 (proxies /api to :8100)
cd drift-ui && npm install && npm run dev
npx tsc --noEmit                                 # type-check
```

## Rules for working in this repo

- **Run `pytest` in `drift-service` after any backend change.** `tests/test_detection.py` pins the exact titles and counts of the 12 planted drifts; if you change detection on purpose, update the test and `docs/acme-shop.md` together.
- **The LLM is injected.** All model calls go through `LLMBackend.generate(prompt)` in `stavvros_drift/llm/base.py`. Never call a model SDK from the engine. New task = new prompt builder in `llm/prompts.py` + method on `Reasoner` + handler `_<task>` in `llm/mock.py`. See `docs/llm.md`.
- **Deterministic first.** If the AST can settle a question exactly, write a rule in `detect/engine.py`; use the LLM only for prose and judgement. Every finding must say which it used (`Detection.engine`).
- **Never edit `acme-shop/` from the service in tests.** Tests copy it to a temp dir (`tests/conftest.py`). The running service *does* edit it when a fix is approved; `POST /api/reset` restores it from `drift-service/.stavvros-data/pristine/`.
- **Finding IDs are fingerprints** (`_fp(...)` in `engine.py`). Changing what goes into a fingerprint orphans saved decisions in `.stavvros-data/state.json`.
- **UI hierarchy is deliberate.** Level 0 list row = title + one muted line. Level 1 = verdict (two values, one impact sentence, actions). Evidence and "How Stavvros found this" stay collapsed by default. Don't add text to levels 0–1. See `docs/frontend.md`.
- Keep `drift-ui/src/types.ts` in sync with `drift-service/stavvros_drift/models.py` by hand.
- Python 3.10+ syntax only (no 3.12 f-string features). Pydantic v2.

## Where to read next

- `docs/overview.md`: components and how a scan flows end to end
- `docs/detection.md`: the pipeline, every rule, severity, fingerprints
- `docs/llm.md`: the LLM seam, prompts, mock, swapping in Claude or a local model
- `docs/data-model.md`: facts, claims, findings, records
- `docs/repositories.md`: adding repos, service discovery, SQLite storage, planned incremental scans
- `docs/workflow.md`: decision states, persistence, applying fixes, reset
- `docs/api.md`: HTTP endpoints
- `docs/frontend.md`: UI structure and the information hierarchy
- `docs/acme-shop.md`: the mock codebase and its planted drifts
- `docs/roadmap.md`: known gaps and next steps
