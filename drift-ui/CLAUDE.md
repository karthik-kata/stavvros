# drift-ui

React UI for Stavvros. Read `../CLAUDE.md` and `../docs/frontend.md` first.

- Run: `npm run dev` (needs the backend on :8100). Type-check: `npx tsc --noEmit`
- Keep `src/types.ts` in sync with `../drift-service/stavvros_drift/models.py`
- Respect the information hierarchy: no new text at levels 0–1; details go in the collapsed sections
- Colours and fonts come from `tailwind.config.js` tokens; don't hard-code hex values in components
