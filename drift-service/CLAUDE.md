# drift-service

Backend for Stavvros drift detection. Read `../CLAUDE.md` first, then `../docs/detection.md` and `../docs/llm.md`.

- Run: `uvicorn stavvros_drift.api:create_app --factory --port 8100 --reload`
- Test: `pytest` (must stay green; `tests/test_detection.py` pins the 12 acme-shop findings)
- Entry points: `container.py` (wiring), `detect/engine.py` (rules), `workflow.py` (states), `api.py` (routes)
- Model calls only through `LLMBackend.generate()`; every new LLM task needs a `MockLLM` handler
- `.stavvros-data/` is runtime state; delete it to start fresh
