# Acme Shop (mock codebase)

A small e-commerce backend used to exercise Stavvros drift detection. Five FastAPI services and the docs that describe them.

| Service | What it does | Owner |
| --- | --- | --- |
| payments | Charges and refunds | Payments Platform |
| orders | Order lifecycle | Orders |
| checkout | Cart payment and customer refund requests | Checkout |
| notifications | Customer emails driven by events | Growth |
| auth | Login, sessions, password reset | Identity |

The docs in `docs/` were accurate when written. The code has moved on in places. Nothing here runs in production; the services are complete enough to read and parse, not to deploy.
