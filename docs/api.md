# HTTP API

FastAPI app built by `create_app(container)` in `drift-service/stavvros_drift/api.py`. Run with `uvicorn stavvros_drift.api:create_app --factory --port 8100`. CORS is open; the UI reaches it through the Vite proxy at `/api`.

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| GET | `/api/health` | | `{ok, codebase, llm}` |
| GET | `/api/scan` | | Last `ScanReport` (scans if none yet) |
| POST | `/api/scan` | | Runs a scan → `ScanReport` |
| GET | `/api/drifts` | | `DriftListItem[]`, sorted by severity then title, all states |
| GET | `/api/drifts/{id}` | | `DriftRecord` |
| POST | `/api/drifts/{id}/decision` | `{action: "update_doc" \| "update_code" \| "dismiss", reason?}` | `DriftRecord` |
| POST | `/api/drifts/{id}/send` | `{edited?: {line: string[]}}` | `DriftRecord` (`in_review`) |
| POST | `/api/drifts/{id}/approve` | | `DriftRecord` (`resolved`); files written, rescanned |
| POST | `/api/drifts/{id}/reopen` | | `DriftRecord` (`open`) |
| GET | `/api/claims` | | `{verified: VerifiedClaim[], unverified: DocClaim[]}` |
| GET | `/api/graph` | | `{nodes: [{id, type: service\|route\|doc, label, detail, service?, services?, drift_ids}], edges: [{id, source, target, kind: exposes\|documents\|calls\|event\|drift, drift_id?, severity?, label?}]}` |
| POST | `/api/context` | `{question}` | `{question, services, answer[], drift_warnings: [{drift_id, title, severity, doc_says, code_does, doc, guidance}]}` (top 5 by severity) |
| POST | `/api/reset` | | Restores the codebase and clears decisions → `ScanReport` |

Errors: 404 unknown drift, 409 invalid transition (`detail` is a readable sentence).

`/api/context` is the prototype of the planned MCP tool: what an AI coding assistant would receive before writing code. `guidance` depends on state (e.g. "Follow the code. A fix to the doc is waiting on David."; for broken calls, "Do not copy this call. Use POST /v2/refunds instead.").
