---
title: Payments API reference
kind: api
owner: Priya
owner_role: Staff engineer
team: Payments Platform
services: [payments]
---

# Payments API

Base URL inside the cluster: `http://payments:8000`

## Charges
| Method | Path | Status | Response fields |
| --- | --- | --- | --- |
| POST | /v1/charges | 201 | charge_id, order_id, amount_cents, currency |
| GET | /v1/charges/{charge_id} | 200 | charge_id, order_id, amount_cents, currency |

## Refunds
| Method | Path | Status | Response fields |
| --- | --- | --- | --- |
| POST | /v2/refunds | 202 | refund_id, status, eta_seconds |
| GET | /v2/refunds/{refund_id} | 200 | refund_id, order_id, amount_cents, status, created_at |

Refund statuses: `PENDING`, `PROCESSING`, `SUCCEEDED`, `FAILED`.

## Events
| Event | Produced when |
| --- | --- |
| payments.refund.requested | A refund request is accepted |
| payments.refund.completed | The ledger has moved the money |
