# Stavvros drift UI

The drift inbox, built for a quick look first and detail on demand:

1. **List**: one line per drift, grouped by severity.
2. **Verdict**: what the doc says next to what the code does, one sentence of impact, and the decision buttons.
3. **Evidence** (collapsed): the doc and code excerpts.
4. **How Stavvros found this** (collapsed): AST and LLM steps, confidence and rule.

The system map and the assistant preview are secondary views.

Needs the drift service on port 8100. See `../drift-service/README.md`.

```bash
npm install
npm run dev     # http://localhost:5175
```
