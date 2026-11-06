# Data model

Defined in `drift-service/stavvros_drift/models.py` (Pydantic v2) and mirrored in `drift-ui/src/types.ts`.

## Inputs

**`CodeFact`**: `id` (`service:kind:name:line`), `kind`, `service`, `file` (relative to the codebase root), `line`, `end_line`, `name`, `data`, `tokens`. See `docs/detection.md` for `data` per kind.

**`DocInfo`**: `path`, `title`, `kind`, `owner`, `owner_role`, `team`, `services` (from front matter).

**`DocClaim`**: `id`, `kind` (`endpoint` | `enum` | `event_produced` | `event_consumed` | `rule`), `doc_path`, `line` (1-based), `section`, `text`, `data`, `source` (`parser` | `llm`).

## Findings

**`Finding`**: one drift.

| Field | Meaning | Shown at UI level |
| --- | --- | --- |
| `id` | Stable fingerprint | 3 |
| `kind` | `endpoint_changed`, `endpoint_missing`, `status_changed`, `fields_changed`, `enum_changed`, `event_not_produced`, `event_not_consumed`, `rule_mismatch`, `undocumented_route`, `broken_call` | — |
| `category` | `contract`, `behavior`, `events`, `coverage`, `integration` | 1 |
| `severity` | `critical`, `high`, `medium`, `low` | 0 |
| `title` | ≤ 60 chars, "Subject: doc → code" | 0 |
| `doc_value`, `code_value` | The two values, short | 1 |
| `impact` | One sentence | 1 |
| `service` | Service the drift belongs to | 0 |
| `doc`, `code`, `related` | `SideRef`: `path`, `line`, `label`, `owner: Person`, `excerpt: Excerpt` (`start_line`, `highlight[]`, `lines[]`). `related` is a second code location, e.g. the route a broken call should use | 2 |
| `callers` | Where the contract is used or enforced | 2 |
| `detection` | `engine` (`ast` / `ast+llm`), `rule`, `confidence`, `reasoning`, `fact_ids`, `claim_id`, `llm_tasks` | 3 |
| `actions` | Ordered buttons: `{id: update_doc \| update_code \| dismiss, label, primary}` | 1 |
| `fixes` | `{action_id: ProposedChange \| null}`; null means "open an issue instead" | 1 after deciding |

**`ProposedChange`**: `target` (`doc`/`code`), `path`, `hunks: [{line, remove[], add[]}]`, `reviewer: Person`, `notes[]`, `creates_file`.

**`VerifiedClaim`**: `claim`, `doc_title`, `evidence`, `engine`. A doc statement the code agrees with.

## Workflow

**`DriftRecord`**: what the API returns per drift: `finding`, `state`, `first_seen`, `decision`, `decided_by`, `reason`, `change` (the drafted or sent `ProposedChange`, possibly edited), `issue`, `timeline: [{at, label, detail, pending}]`.

**`DriftListItem`**: the slim row for the inbox: `id`, `title`, `severity`, `category`, `state`, `service`, `doc_title`, `doc_value`, `code_value`, `engine`, `first_seen`.

**`ScanReport`**: `scanned_at`, `duration_ms`, `codebase`, `llm_backend`, `files_parsed`, `docs_parsed`, `facts` (per kind), `claims` (parser vs LLM), `llm_calls` (per task, plus cache hits), `findings` (per severity), `verified_claims`.

## Config: `stavvros.json` in the scanned codebase root

```json
{
  "name": "acme-shop",
  "docs_dir": "docs",
  "services": {
    "payments": { "path": "services/payments", "team": "Payments Platform", "owner": "Priya", "owner_role": "Staff engineer" }
  },
  "ignore_routes": ["/healthz"]
}
```

Service names must match the hostnames used in base URLs (`http://payments:8000`) for broken-call detection, and the names in doc front matter `services: [...]`.
