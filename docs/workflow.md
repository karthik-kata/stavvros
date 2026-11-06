# Decision workflow

`drift-service/stavvros_drift/workflow.py`.

## States

```
open ──decide(update_doc | update_code, fix drafted)──► change_drafted ──send()──► in_review ──approve()──► resolved
open ──decide(update_code, no code patch possible)────► issue_open
open ──decide(dismiss, reason)────────────────────────► dismissed

reopen(): change_drafted | in_review | issue_open | dismissed ──► open
any active state ──(next scan no longer finds the drift)──► resolved
resolved ──(a later scan finds it again)──► new record in open
```

Active states: `open`, `change_drafted`, `in_review`, `issue_open`.

| Call | Allowed from | Effect |
| --- | --- | --- |
| `decide(id, action, reason)` | `open`, `change_drafted` | `dismiss` needs a reason → `dismissed`. Otherwise copies `finding.fixes[action]` into `record.change` → `change_drafted`; if that fix is null, writes `issues/<id>.md` → `issue_open` |
| `send(id, edited)` | `change_drafted` | Applies optional line edits to `change.hunks[*].add`, writes `changes/<id>.diff` → `in_review` |
| `approve(id)` | `in_review` | Writes the change into the scanned codebase (`_apply`), marks `resolved`, rescans. Stand-in for a reviewer merging a PR |
| `reopen(id)` | anything except `resolved` | Clears decision, change and issue → `open` |
| `reset()` | — | Restores every top-level entry of the codebase from `pristine/`, deletes issues and changes, clears records, rescans |

The current user (`Settings.user_name`, default Alex) is recorded on decisions.

## Persistence and rescans

`Workflow.scan()` merges each scan with the stored records (`store.py`) by fingerprint:

- new fingerprint (or one previously `resolved`) → new record, `open`, timeline "Detected";
- known fingerprint → keep state and history, refresh `finding`;
- known, active, and missing from this scan → `resolved` ("No longer detected").

So a dismissal persists across scans and restarts, and an issue closes itself once the code changes.

## Applying changes (`_apply`)

- Hunks are applied bottom-up. Each hunk's `remove` lines must still match the file, otherwise `WorkflowError` ("changed since the fix was drafted"); rescan and redraft.
- `creates_file`: write the new doc; if another approved change already created it, only the new table row is appended after the doc's last endpoint table.

Fixing one drift can surface another. Example: approving the `/cancel → /void` doc fix makes the route match, which then reveals that the doc lists 2 of the 7 response fields (a new low-severity `fields_changed`). This is expected and makes a good demo moment.

## Errors

`WorkflowError` → HTTP 409 with a readable message; unknown id → 404. The UI shows the message above the action area.

## Not built yet

- Real review: sending creates a diff file, not a PR. Approval is a demo button. A Git integration would open a PR to the doc or code repo and resolve on merge via webhook.
- Notifications to owners.
- Multi-user identity (one configured user).
