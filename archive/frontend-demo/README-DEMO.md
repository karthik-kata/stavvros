# Stavvros demo frontend

The drift-detection UI from the wireflow (drift inbox, drift detail with a decision, suggested doc fix, status, AI assistant view, system map with expandable nodes), running on a mock backend. The original `frontend/` is unchanged.

## Run it

```bash
cd frontend-demo
npm install
npm run dev            # http://localhost:5174, mock backend
npm run dev:live       # same UI against FastAPI on :8000 (start the backend first)
npm run build:single   # dist-single/index.html: one file you can open or share for demos
```

`dist-single/index.html` is already built and opens directly in a browser with no server.

## How the mock works

- `src/api/types.ts` is the only contract between UI and backend (`StavvrosApi`). Components import `api` from `src/api/index.ts` and never call `fetch` themselves.
- `src/api/mock/fixtures.json` is a real snapshot of the engine: `GET /api/graph`, `GET /api/workspace` and `GET /api/nodes/{id}` for every node, taken from the current backend against `stavvros-workspace`. Re-generate it after engine changes (script at the bottom).
- `src/api/mock/sampleData.ts` holds what the engine does not produce yet: people (Alex, David, Priya), the commit that caused the refund drift, AI-usage counts. The UI underlines these with a dotted line ("sample data").
- `src/lib/driftBuilder.ts` turns a raw `DriftAlert` into a `DriftItem` (both excerpts, owners, callers, drafted doc fix). Both the mock and the live client use it, so the logic can move into the backend later without changing the UI.

## Backend work to go live

Existing endpoints already used: `/api/workspace`, `/api/graph`, `/api/nodes/{id}`, `/api/graph/edge`, `/api/graph/rebuild`, `/api/drift/reconcile/{id}`.

New endpoints the UI expects (shapes are in `src/types.ts`):

| Endpoint | Body | Returns |
| --- | --- | --- |
| `GET /api/drift` | | `DriftItem[]` (falls back to building them client-side if missing) |
| `POST /api/drift/{id}/decision` | `{ decision: "code_correct" \| "doc_correct" \| "not_drift", reason? }` | `DriftItem` with `proposed_fix`, `issue`, or `state: "dismissed"` |
| `POST /api/drift/{id}/doc-fix` | `{ edited_lines?: { [line]: string[] } }` | `DriftItem` with `state: "fix_in_review"` (open a PR in a real setup) |
| `POST /api/drift/{id}/reopen` | | `DriftItem` |
| `POST /api/context` | `{ question }` | `AssistantContext` (the same payload the MCP tool should return) |

Merging a doc fix should close the drift from a Git webhook. In live mode the "approve" step falls back to `/api/drift/reconcile/{id}`.

## Engine issues found while building the mock

1. Doc line numbers are 0-based. `markdown_parser.py` stores `line_number=idx`, so alerts say "Doc line 55" for line 56. Use `idx + 1`.
2. Node drift status never reaches the API. `graph_builder.py` sets `self.graph.nodes[id]["status"] = "drift"`, but node data lives in `self.graph.nodes[id]["data"]`, so every node comes back `"active"`. The demo works out drift status from open alerts instead.
3. Only the refund drift gets a graph edge. Drift edges need `contract.domain_tag in ep.path`, and `GET /v2/transactions/{id}` gets the tag `"order"`. `alert_map` is also keyed by `api_id`, so a second alert on the same endpoint overwrites the first.
4. A path-parameter rename (`{id}` vs `{transaction_id}`) raises a critical version drift and a phantom-route warning for the same line. Normalising path parameters before comparing would remove both.
5. Reconcile closes an alert without recording which side was correct, so the next scan raises it again unless the doc changed.

## Regenerating fixtures

```bash
cd backend && source .venv/bin/activate && PYTHONPATH=. python - <<'PY'
import json; from fastapi.testclient import TestClient; from app.main import app
c = TestClient(app); g = c.get('/api/graph').json()
nodes = {n['id']: c.get('/api/nodes/' + n['id']).json() for n in g['nodes']}
out = json.dumps({'workspace': c.get('/api/workspace').json(), 'graph': g, 'nodes': nodes}, indent=1)
import os; root = os.path.abspath('..') + '/'
open('../frontend-demo/src/api/mock/fixtures.json', 'w').write(out.replace(root, ''))
PY
```
