# Repositories and storage

The service can watch many repositories. `registry.py` owns them; `store.py` keeps the results.

## Adding a repository

`POST /api/repos {location}` (or *Add repository* in the top-bar picker):

- **Folder path** (`~/Code/my-service`): scanned in place. Stavvros never deletes or moves it; *approving a fix writes into it*, exactly as with the demo.
- **Git URL** (`https://…`, `git@…`, `file://…`, `*.git`): shallow-cloned to `.stavvros-data/repos/<id>/src`. Each scan runs `git pull --ff-only` first. Approved fixes are written to the clone, not pushed.

The id is a slug of the name (`-2`, `-3` on clashes). The same location can't be added twice.

## Finding services without `stavvros.json`

If the repo has a `stavvros.json` it is used as is (see `docs/acme-shop.md`). Otherwise `discover.py` guesses, deterministically:

1. Services = folders holding a file that calls `FastAPI(` (`app/` and `src/` fold into their parent).
2. Else the top-level folder of any file calling `APIRouter(`.
3. Else the whole repo is one service.
4. Docs = `docs/`, `doc/` or `documentation/`; else every `.md` under the root. `.git`, `.venv`, `node_modules`, `dist` etc. are skipped.

Owners and teams are `Unassigned` until a `stavvros.json` says otherwise. Python/FastAPI only (see roadmap).

## Storage

One SQLite file, `.stavvros-data/stavvros.db`:

| Table | Holds |
| --- | --- |
| `repos` | id, name, source, location, root, demo, added_at |
| `records` | one `DriftRecord` (JSON) per repo + finding fingerprint: decisions, drafted changes, timeline |
| `reports` | the last `ScanReport` per repo, so the picker shows "N to decide, scanned 3 min ago" without scanning |

Removing a repository deletes its rows and `.stavvros-data/repos/<id>/`. Claims and the graph are not stored: they are rebuilt by a scan, which happens on first read after a restart.

Per-repo files (`pristine/` for the demo's reset, `issues/`, `changes/`, the LLM cache) live in `.stavvros-data/repos/<id>/`. Only the demo repo keeps a `pristine/` copy, so **Reset applies to the demo only**; a real repository can't be reset.

The first start after upgrading moves the old `state.json` and `pristine/` into the demo repo's rows and folder.

## Not built yet: incremental scans

Every scan re-reads all code and docs and re-runs the LLM steps (cached by input, so unchanged prose is cheap with a real model, but the AST pass and judging still run in full). The planned design:

1. Store a content hash per file at each scan (`files` table: repo, path, hash).
2. On rescan, diff hashes. Re-extract only changed code files and changed docs.
3. Re-judge only claims whose doc lines changed or whose candidate facts changed; reuse the stored verdict otherwise.
4. Findings stay keyed by fingerprint, so decisions are unaffected.

Tracked in `docs/roadmap.md`.
