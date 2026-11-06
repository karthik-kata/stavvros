# Known gaps and next steps

## Limitations today

- **Mock LLM only.** The real-model classes in `docs/llm.md` are sketches that have not been run. The mock's regexes are tuned to acme-shop's wording.
- **Python/FastAPI only.** The extractor understands FastAPI routers, Pydantic models, `Enum`s, `httpx` clients, `publish(...)` and `@subscribe(...)`. Other frameworks and languages need new extractors producing the same `CodeFact` kinds.
- **Markdown docs only**, with endpoint tables in a fixed column format and enum lists in one line. No Google Docs, Notion or Confluence.
- **Retrieval is keyword overlap.** Fine for a small codebase; a large one needs embeddings or symbol-aware search.
- **One constant per claim.** Rules implemented across several values or functions are judged only through the best-matching fact.
- **Review is simulated.** "Send" writes a diff file; "Approve" writes to disk. No PRs, webhooks or notifications.
- **Single user**, configured by env var. No auth on the API.
- **Path-parameter names** are ignored when matching routes (`{id}` = `{order_id}`), which avoids the false positives of the old engine but would miss a genuine parameter rename.

## Next steps, roughly in order

1. Implement and evaluate a real backend (Claude API or a local model) against acme-shop; write a looser test suite for it.
2. Expose `/api/context` as an MCP tool so coding assistants get drift warnings while they work.
3. Git integration: scan on push, open the drafted change as a PR, resolve on merge.
4. Doc sources beyond markdown (Google Docs via API, Notion).
5. A second language extractor (TypeScript/Express) behind the same `CodeFact` schema.
6. Usage signal: count how often assistants read each stale doc and use it in severity.
7. Evaluate with users: walk developers and PMs through the inbox and measure time to understand and decide a drift (see the storyboards and test questions in `archive/mentor-demo/drift-ux.html`).

## Prior work (in `archive/`)

- `backend/`, `frontend/`: the first prototype: knowledge graph of teams/services/APIs/docs, four regex/AST drift rules, one-click reconcile. Its drift engine had known bugs (0-based doc line numbers, node drift status never reaching the API, reconcile not persisting).
- `frontend-demo/`: static mock of the wireflow UI shown to the mentor on Oct 30.
- `mentor-demo/`: storyboards, wireflow and "how drift detection works today" page.
- `problem.md`, `USER_STORIES_AND_WIREFRAMES.md`, `CURRENT_PROCESS.md`: problem statement, interview notes, personas and user stories, and the old process description.
