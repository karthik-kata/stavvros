# HTTP API

FastAPI app built by `create_app(registry)` in `drift-service/stavvros_drift/api.py`. Run with `uvicorn stavvros_drift.api:create_app --factory --port 8100`. Every per-repo path lives under `/api/repos/{rid}/` (shown abbreviated below the first four rows). The first `GET` of a repo's drifts, scan, claims or graph scans it. A git repo is pulled before each `POST …/scan`. CORS is open; the UI reaches it through the Vite proxy at `/api`.

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| GET | `/api/health` | | `{ok, llm, repos}` |
| GET | `/api/repos` | | `RepoInfo[]` (id, name, source `path`\|`git`, location, demo, last_scanned, open_drifts) |
| POST | `/api/repos` | `{location, name?}` | `RepoInfo`. `location` is a folder on the server's machine or a git URL (cloned shallow). 422 with a readable reason if it can't be added |
| DELETE | `/api/repos/{rid}` | | Stops watching: deletes stored results and any clone. A folder's files are never touched |
| GET | `/api/repos/{rid}/scan` | | Last `ScanReport` (scans if none yet) |
| POST | `/api/repos/{rid}/scan` | | Runs a scan → `ScanReport` |
| GET | `/api/repos/{rid}/drifts` | | `DriftListItem[]`, sorted by severity then title, all states |
| GET | `/api/repos/{rid}/drifts/{id}` | | `DriftRecord` |
| POST | `/api/repos/{rid}/drifts/{id}/decision` | `{action: "update_doc" \| "update_code" \| "dismiss", reason?}` | `DriftRecord` |
| POST | `/api/repos/{rid}/drifts/{id}/send` | `{edited?: {line: string[]}}` | `DriftRecord` (`in_review`) |
| POST | `/api/repos/{rid}/drifts/{id}/approve` | | `DriftRecord` (`resolved`); files written, rescanned |
| POST | `/api/repos/{rid}/drifts/{id}/reopen` | | `DriftRecord` (`open`) |
| GET | `/api/repos/{rid}/claims` | | `{verified: VerifiedClaim[], unverified: DocClaim[]}` |
| GET | `/api/repos/{rid}/graph` | | `{nodes: [{id, type: service\|route\|doc, label, detail, service?, services?, drift_ids}], edges: [{id, source, target, kind: exposes\|documents\|calls\|event\|drift, drift_id?, severity?, label?}]}` |
| POST | `/api/repos/{rid}/context` | `{question}` | `{question, services, answer[], drift_warnings: [{drift_id, title, severity, doc_says, code_does, doc, guidance}]}` (top 5 by severity) |
| POST | `/api/repos/{rid}/reset` | | Demo repo only (409 otherwise): restores the codebase and clears decisions → `ScanReport` |

Errors: 404 unknown repository or drift, 409 invalid transition (`detail` is a readable sentence), 422 the repository can't be read or scanned.

`/api/context` is the prototype of the planned MCP tool: what an AI coding assistant would receive before writing code. `guidance` depends on state (e.g. "Follow the code. A fix to the doc is waiting on David."; for broken calls, "Do not copy this call. Use POST /v2/refunds instead.").
