# acme-shop: the mock codebase

A pretend online store's backend, written to give Stavvros something realistic to scan. The services are complete enough to parse, not to run (no database, queue or real HTTP clients behind them).

## Services (`acme-shop/services/<name>/app/`)

| Service | Team · owner | Key files |
| --- | --- | --- |
| payments | Payments Platform · Priya | `config.py` (refund constants), `models.py`, `routers/refunds.py` (`/v2/refunds`, guards, events), `routers/charges.py`, `orders_lookup.py` |
| orders | Orders · Marcus | `config.py` (list limits), `models.py` (`OrderStatus`), `routers/orders.py` (`/orders`, `/void`) |
| checkout | Checkout · Alex | `clients/payments_client.py` (calls payments), `clients/orders_client.py`, `routers/checkout.py` |
| notifications | Growth · Lena | `bus.py` (`@subscribe`), `consumers.py` |
| auth | Identity · Sam | `config.py` (login, password, session constants), `routers/auth.py` (incl. `/impersonate`), `security.py` |

## Docs (`acme-shop/docs/`)

| Doc | Kind · owner | Covers |
| --- | --- | --- |
| `prd/refunds-self-service.md` | prd · David | payments, checkout, notifications |
| `api/payments-api.md` | api · Priya | payments |
| `api/orders-api.md` | api · Marcus | orders |
| `architecture/notifications.md` | architecture · Lena | notifications |
| `policies/auth-security.md` | policy · Sam | auth |

## Planted drifts (12)

| # | Title (as produced by the mock) | Severity | Engine | Where |
| --- | --- | --- | --- | --- |
| 1 | Broken call: POST /v1/refunds does not exist | critical | AST | `checkout/.../payments_client.py` vs payments routes |
| 2 | Login rate limit: 5 per minute → 10 per minute | high | AST+LLM | `auth-security.md` vs `LOGIN_RATE_LIMIT_PER_MINUTE` |
| 3 | Partial refunds: enabled → disabled | high | AST+LLM | PRD vs `PARTIAL_REFUNDS_ENABLED` |
| 4 | Refund window: 30 days → 14 days | high | AST+LLM | PRD vs `REFUND_WINDOW_DAYS` |
| 5 | RefundAccepted fields: estimated_completion → eta_seconds | high | AST | PRD table vs `RefundAccepted` |
| 6 | Route renamed: /cancel → /void | high | AST | `orders-api.md` vs `routers/orders.py` |
| 7 | Undocumented route: POST /auth/impersonate | high | AST+LLM | no doc; policy requires listing |
| 8 | Order list limit: 50 → 100 | medium | AST+LLM | `orders-api.md` vs `Query(le=ORDER_LIST_MAX_LIMIT)` |
| 9 | OrderStatus: CANCELLED → VOIDED, REFUNDED | medium | AST | `orders-api.md` vs `OrderStatus` |
| 10 | Email never sent: refund_received | medium | AST | `notifications.md` vs `consumers.py` |
| 11 | Undocumented route: POST /checkout/orders/{order_id}/pay | low | AST+LLM | checkout has no doc |
| 12 | Undocumented route: POST /checkout/orders/{order_id}/refund | low | AST+LLM | checkout has no doc |

Claims that are true and should be verified, not flagged (23 total), include the $500 refund cap, the 12-character password minimum, the 30-minute session timeout, the 60-minute reset link, the required `Idempotency-Key` header, "only unshipped orders can be cancelled", and "notifications never calls other services".

## Changing scenarios

Edit the service code or docs, then update `drift-service/tests/test_detection.py` (it asserts these titles and `len(findings) == 12`) and this table. If the running service already took its `pristine/` snapshot, delete `drift-service/.stavvros-data/repos/acme-shop/pristine/` so Reset uses your new version.
