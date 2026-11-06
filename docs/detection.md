# Detection pipeline

All in `drift-service/stavvros_drift/detect/engine.py` (`Detector`), using the extractors in `extract/`.

## 1. Code facts (Python AST)

`extract/python_ast.py` parses every `.py` file under each service folder listed in `stavvros.json`. It never imports or runs the scanned code. Two passes per service: first collect module-level UPPER_CASE constants (so later expressions can be resolved), then extract facts.

| Fact kind | Source pattern | Key `data` fields |
| --- | --- | --- |
| `constant` | `NAME = <literal>` at module level | `value`, `comment` (trailing `#` comment) |
| `route` | `@router.get/post/...("/path", status_code=, response_model=)` where `router = APIRouter(prefix=...)` or `FastAPI()` | `method`, `path` (prefix + path), `path_norm`, `status_code` (default 200), `response_model`, `handler`, `params`, `dependencies`, `docstring`, `constants_used` |
| route `params` | handler arguments; `Header(...)`, `Query(DEFAULT, le=X)`, etc. | `source`, `required`, `default`, `alias`, `le`/`ge`/…, `le_const`, `default_const` (constant names are resolved to values) |
| `guard` | `if <cond>: raise HTTPException(status_code=, detail=)` inside a route handler | `condition`, `status`, `detail`, `route`, `constants_used` |
| `model` | `class X(BaseModel)` | `fields: [{name, type, required}]` |
| `enum` | class with an `*Enum` base | `members` |
| `publish` | `publish("topic", ...)` | `topic`, `function` |
| `subscribe` | `@subscribe("topic")` | `topic`, `handler` |
| `http_call` | `<client>.get/post/...("/path")` or `(f"{X_URL}/path")`, with base URL from `httpx.AsyncClient(base_url=X_URL)` or the f-string prefix | `method`, `path`, `path_norm`, `target_service` (host of the URL), `base_url`, `function` |

Every fact also has `tokens`: lower-case words from its names, paths, comments and docstrings (with a crude singular form added), used for retrieval. `normalize_path()` turns `{order_id}` into `{}` so paths compare by shape.

## 2. Doc claims (parser)

`extract/docs.py` reads each markdown file under `docs_dir`:

- **Front matter** (`--- key: value ---`): `title`, `kind` (`prd`, `api`, `architecture`, `policy`), `owner`, `owner_role`, `team`, `services: [a, b]`. `services` scopes which code a doc is checked against.
- **Endpoint tables**: any table with `Method` and `Path` columns → `endpoint` claims, plus optional `Status` and `Response fields` columns. Table positions are kept (`endpoint_tables`) so fixes can edit cells or append rows.
- **Event tables**: a table with an `Event` column → `event_produced` if a header contains "produced" or the section is not a subscriptions section, else `event_consumed`.
- **Enum lists**: a line like ``Order statuses: `A`, `B`, `C`.`` → `enum` claim.
- **Everything else** that is not a heading, table or blank becomes part of a `ProseBlock` (per section) for the LLM.

## 3. Prose claims (LLM: `extract_claims`)

Each prose block goes to the model with the doc title and section. The model returns claims with a `subject`, `keywords` (identifier-style words like `window`, `max`, `days`), a `value` and the exact `quote`. Value types:

| `value.type` | Example | Fields |
| --- | --- | --- |
| `quantity` | "within 30 days", "at most 50", "$500" | `amount`, `unit`, `bound` (`exact`/`max`/`min`/`default`) |
| `bool` | "Partial refunds are supported" | `value` |
| `header` | "must include an `Idempotency-Key` header" | `name`, `value` |
| `guard` | "Only orders that have not shipped can be cancelled" | `name` (the state word) |
| `absence` | "never calls other services directly" | `name: http_call` |

Goals, metrics and objectives are skipped (the mock skips sections named Objective, Success criteria, Goals, Metrics, Out of scope).

## 4. Contract rules (deterministic)

| Rule | Check | Finding kind | Severity |
| --- | --- | --- | --- |
| `CONTRACT-ROUTE` | Doc endpoint has a route with the same method + normalized path in the doc's services | none, or `endpoint_changed` when a similar route exists (`_path_similarity ≥ 0.4`), else `endpoint_missing` | `critical` if code elsewhere still calls the old path, else `high` |
| `CONTRACT-STATUS` | Doc status = decorator `status_code` | `status_changed` | high |
| `CONTRACT-FIELDS` | Doc response fields = `response_model` fields | `fields_changed` (`doc_value` = only in doc, `code_value` = only in code) | `high` if the doc promises fields the code lacks, `low` if code only adds fields |
| `CONTRACT-ENUM` | Enum list = members of the enum whose name best matches the subject (≥ 2 shared tokens) | `enum_changed` | medium |
| `EVENTS` | Produced topic has a `publish`; consumed topic has a `subscribe` in the doc's services | `event_not_produced` / `event_not_consumed` | medium |

`_path_similarity` weights shared meaningful segments (ignoring `v1`, `v2` and `{}`) at 0.7 and positional matches at 0.3.

## 5. Prose claims judged (retrieval + LLM: `judge_claim`)

`_candidates()` gathers code facts from the doc's services and scores each by keyword overlap with the claim: constants (with `comment` and `used_by`), route query params (`le`, `default`), header params (boosted for header claims), guards, and, for `absence` claims, every `http_call`. The top 6 go to the model.

The model returns `verdict` (`match` / `drift` / `no_evidence`), `evidence_fact_id`, `doc_value`, `code_value`, `reasoning`, `confidence`.

- `match` → a `VerifiedClaim` (shown under "Matches" in the UI).
- `no_evidence` → listed as "could not check".
- `drift` → `rule_mismatch` finding, rule `LLM-JUDGE`, engine `ast+llm`. Severity `high` for `prd`/`policy` docs, `medium` otherwise. The code side points at the constant (resolving `le_const`/`default_const` for query params). `callers` lists the guards that enforce it.

## 6. Cross-service checks (deterministic)

`INTEGRATION-CALL`: each `http_call` whose `target_service` is a known service must match a route there. If not → `broken_call`, severity `critical`, with the closest route as `related` and a drafted code fix that replaces the path literal in the caller.

## 7. Undocumented routes (AST + LLM: `triage_undocumented`)

`COVERAGE-ROUTE`: routes not matched by any doc endpoint (and not in `ignore_routes`). The model rates severity using the prose of the service's docs as policy context. The drafted fix appends a table row to the service's own doc (an `api` doc whose `services` is exactly that service, else any doc that is), or creates `docs/api/<service>-api.md` (`creates_file: true`).

## 8. Summaries and fixes (LLM: `summarize_finding`, `rewrite_doc_line`)

`_summarize()` sends a compact description (kind, subject, both values, extra context) and receives a `title` (≤ 60 chars, "Subject: doc → code") and an `impact` sentence. Subjects for rule findings come from the constant name (`REFUND_WINDOW_DAYS` → "Refund window").

Fixes are drafted per action and stored on the finding as `fixes[action_id]`:

| Kind | `update_doc` | `update_code` |
| --- | --- | --- |
| `rule_mismatch` | LLM rewrites the doc line | constant line with the doc's value converted to the constant's unit |
| `fields_changed`, `status_changed`, `endpoint_changed` | edit the table cell | none → an issue is opened |
| `enum_changed` | replace the backticked list | none → issue |
| `event_not_*`, `endpoint_missing` | delete the row | none → issue |
| `undocumented_route` | add a row / create a doc | — |
| `broken_call` | — | replace the path literal in the caller |

## Fingerprints

`_fp(kind, doc path, key...)` hashes to 12 hex chars. Keys: method + normalized path for endpoints; constant name for rule findings; enum name; topic; service + route for undocumented; caller file + function + path for broken calls. These must stay stable across scans for decisions to persist.

## Adding a rule

1. Extract any new fact kind in `python_ast.py` (add it to `FactKind` in `models.py`).
2. Add the check in `Detector.scan()` and a `_check_*` method returning `Finding`s with a new `kind` (add to `FindingKind`), a `category`, a `Detection(engine="ast", rule="...")`, `actions` and `fixes`.
3. Add a title/impact template in `MockLLM._summarize_finding`.
4. Plant an example in `acme-shop`, update `tests/test_detection.py` and `docs/acme-shop.md`.
5. If the UI needs different value labels, add the kind to `SIDE_LABELS` in `drift-ui/src/components/DriftView.tsx`.
