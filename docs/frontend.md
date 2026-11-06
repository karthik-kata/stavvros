# Frontend (`drift-ui/`)

React 18 + TypeScript + Vite 5 + Tailwind 3 + Cytoscape 3 + lucide-react. Dev server on :5175 proxies `/api` to `STAVVROS_API` (default `http://localhost:8100`). No state library: `App.tsx` holds state and passes props.

## Files

| File | Role |
| --- | --- |
| `src/api.ts` | Typed fetch client for every endpoint in `docs/api.md`. Turns network failures into a message telling you to start the backend |
| `src/types.ts` | Mirrors `models.py`. Update by hand when the backend models change |
| `src/App.tsx` | Top bar (logo, views, scan status, Reset (LLM name only in the scan popover)), view switching, list tab, selection, refresh after every change |
| `components/DriftList.tsx` | Level 0: summary sentence, tabs (To decide / In progress / Closed / Matches), rows grouped by severity |
| `components/DriftView.tsx` | Levels 1–3 for one drift: verdict, actions, drafted change, progress, collapsible Evidence / How found / History |
| `components/Matches.tsx` | Verified doc claims grouped by doc, plus claims that could not be checked |
| `components/ScanStatus.tsx` | "Scanned 2 min ago" + Scan button; popover with the pipeline numbers (AST facts, parser/LLM claims, LLM calls per task, results) |
| `components/SystemMap.tsx` | Secondary view. Cytoscape graph laid out in columns: docs on top, one column per service with its routes below. Nodes show only a heading; clicking expands a card with details and the node's drifts |
| `components/Assistant.tsx` | Secondary view. Ask a task, see the drift warnings and facts `/api/context` returns, optionally the raw payload |
| `components/ui.tsx` | Severity and state labels/colours, `Disclosure`, `CodeExcerpt`, `Spinner`, time helpers |
| `tailwind.config.js` | Dark theme. Colour tokens (RGB channels live as CSS variables in `index.css`; `onink` = text on an `ink` fill): `ink`, `muted`, `line`, `canvas`, `panel`, `sunken`, `accent`, `drift`, `crit`, `warn`, `ok`. Fonts: Bricolage Grotesque (display), IBM Plex Sans, IBM Plex Mono (Google Fonts, system fallbacks) |
| `src/index.css` | `btn`, `btn-primary`, `btn-ghost`, `chip`, `eyebrow`, `card`, `codebox` component classes |

## Layout modes

One draggable divider (`components/SplitPane.tsx`) between the list and the detail. Where you drop it picks the mode; it snaps within 150px of either edge. Position is saved in localStorage as `drift-split` (fraction of the width).

| Divider at | Mode | Layout |
| --- | --- | --- |
| Far right | List | Full-width table: severity bar, title, service, doc, state. Clicking a row opens Focus, like a GitHub issue |
| Middle | Split | Narrow list beside the detail. List rows morph continuously from sidebar rows into table rows between 520 and 740px (the muted line collapses while service / doc / state columns grow in; `DriftList` measures its own width) |
| Far left | Focus | Detail only, with "← All drifts" (returns to the previous width, or `Esc`), `n of m`, and prev/next (`k` / `j`) |

Double-click the divider to toggle Split and List. With the divider focused, Left/Right arrows step Focus ← Split → List. The tabs apply in every mode.

## Information hierarchy

User research said the earlier UI had too much text for a quick look. Each level answers one question; deeper levels are opt-in.

| Level | Question | What is shown | Where |
| --- | --- | --- | --- |
| 0 | What needs me? | "N drifts to decide", critical count; one row per drift: title + `service · doc` | `DriftList` |
| 1 | What is wrong and what do I do? | Severity, category, title; **Doc says** vs **Code does** in large type; one impact sentence; "Which is right?" buttons from `finding.actions` | top of `DriftView` |
| 2 | Show me | Doc and code excerpts with highlighted lines, owners, callers, link to the map | `Disclosure "Evidence"` (closed) |
| 3 | Can I trust it? | Reasoning, step list (Parser / AST / LLM), engine, confidence, rule, fingerprint; history | `Disclosure "How Stavvros found this"`, `"History"` (closed) |

After a decision the action area becomes the drafted change (diff, reviewer, Send / Edit / Change decision), then a three-step progress strip (Decided → With reviewer → Merged) with one sentence about what AI assistants are told meanwhile.

Guidelines: keep level 0–1 text to what is listed above; put anything new in level 2 or 3. Value labels per finding kind live in `SIDE_LABELS` in `DriftView.tsx`.

## Known quirk

Cytoscape 3.30 leaves edges unrendered when a `preset` layout is the first layout run, so `SystemMap` runs a `grid` layout and then the `preset` one. Keep both calls.
