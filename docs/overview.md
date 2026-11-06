# Architecture overview

## What the system does

1. **Scan.** Read every service's Python source with the standard-library AST and every markdown doc. Turn both into structured facts and claims.
2. **Compare.** Check each doc claim against the code. Exact questions (does this route exist? which fields does it return?) are answered by deterministic rules. Questions written in prose ("refunds within 30 days") go to an LLM together with the code facts that could settle them.
3. **Report.** Each disagreement becomes a *finding* with a short title, the two values side by side, a one-line impact, evidence excerpts, how it was detected, and drafted fixes.
4. **Resolve.** A person decides which side is right. Stavvros drafts the doc or code change, routes it to the owner, writes it to disk when approved, and rescans. A drift is resolved when the next scan no longer finds it.

## Components

```
                 ┌───────────────────────── drift-service (FastAPI, :8100) ─────────────────────────┐
 acme-shop/      │                                                                                  │
 ├ services/*.py ─┼─► extract/python_ast.py ──► CodeIndex (CodeFact[])  ─┐                           │
 ├ docs/*.md ─────┼─► extract/docs.py ────────► Doc (DocClaim[], prose) ─┤                           │
 └ stavvros.json ─┼─► container.py (Settings)                            ▼                           │
                 │                                     detect/engine.py  Detector.scan()            │
                 │                                        │  rules (deterministic)                   │
                 │                                        │  Reasoner ──► LLMBackend.generate()      │
                 │                                        ▼              (llm/mock.py by default)    │
                 │                                     ScanResult: Finding[], VerifiedClaim[]       │
                 │                                        ▼                                         │
                 │                                     workflow.py  Workflow (state.json, apply, reset)
                 │                                        ▼                                         │
                 │                                     api.py / views.py  (REST, graph, assistant)  │
                 └──────────────────────────────────────────┬───────────────────────────────────────┘
                                                            │ /api (Vite proxy)
                                                  drift-ui (React, :5175)
                                    Drift inbox · System map · Assistant preview
```

## Module map (`drift-service/stavvros_drift/`)

| Module | Responsibility |
| --- | --- |
| `container.py` | Dependency injection. `Settings` from env vars; `load_backend("module:Class")`; `build_container(settings, llm=None)` wires LLM → Reasoner → Detector → Workflow |
| `extract/python_ast.py` | `build_code_index(root, services)` → `CodeIndex` of `CodeFact`s. Also `tokenize()` and `normalize_path()` |
| `extract/docs.py` | `parse_docs(root, docs_dir)` → `Doc`s with front matter, parser claims (tables, enum lists, event tables) and `ProseBlock`s for the LLM |
| `llm/base.py` | `Prompt` dataclass and the `LLMBackend` ABC: the only model interface |
| `llm/prompts.py` | One builder per LLM task: system text, user text, JSON schema, structured inputs |
| `llm/reasoner.py` | `Reasoner`: runs a prompt, parses and validates JSON against the schema, retries once, caches, counts calls |
| `llm/mock.py` | `MockLLM`: deterministic answers from `prompt.inputs`. Default backend |
| `units.py` | Unit table and conversions shared by the engine and the mock (days, minutes, cents, per-minute, counts) |
| `detect/engine.py` | `Detector.scan()`: the 8-step pipeline, all rules, severity, drafted fixes, summaries |
| `workflow.py` | `Workflow`: merges scans with saved decisions, the decision state machine, applying changes, reset |
| `views.py` | Read models: `graph()` for the system map, `assistant_context()` for the assistant preview / future MCP tool |
| `models.py` | Pydantic models shared by everything above and returned by the API |
| `api.py` | `create_app(container)` FastAPI factory |

## One scan, end to end

1. `Workflow.scan()` calls `Detector.scan(root, cfg)`.
2. The AST index and doc parse run (no LLM).
3. The LLM extracts claims from each prose block (`extract_claims`).
4. Parser claims go through contract and event rules; LLM claims go through retrieval + `judge_claim`.
5. Outbound HTTP calls are checked against target routes; undocumented routes are triaged by the LLM.
6. Each finding gets a title and impact (`summarize_finding`).
7. `Workflow` matches findings to saved records by fingerprint: new ones start `open`, known ones keep their state, ones that disappeared while active become `resolved`.
8. State is written to `.stavvros-data/state.json`. The UI reads `/api/drifts`.

A scan of acme-shop takes ~20 ms with the mock.

## Runtime data (`drift-service/.stavvros-data/`, git-ignored)

| Path | Contents |
| --- | --- |
| `state.json` | Every `DriftRecord` keyed by fingerprint |
| `pristine/` | Copy of the codebase taken at first start; used by reset |
| `changes/<id>.diff` | Drafted changes that were sent for review |
| `issues/<id>.md` | Issues opened when the doc is right and no code patch could be drafted |
| `llm-cache-<backend>.json` | Cached answers from real model backends (the mock is never cached on disk) |

Delete the folder to start fresh (new snapshot, no decisions).
