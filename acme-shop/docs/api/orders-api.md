---
title: Orders API reference
kind: api
owner: Marcus
owner_role: Engineering manager
team: Orders
services: [orders]
---

# Orders API

## Endpoints
| Method | Path | Status | Response fields |
| --- | --- | --- | --- |
| GET | /orders | 200 | items, next_cursor |
| GET | /orders/{order_id} | 200 | order_id, customer_id, status, lines, total_cents, created_at, delivered_at |
| POST | /orders/{order_id}/cancel | 200 | order_id, status |

## Listing orders
`GET /orders` returns 20 orders by default. The `limit` parameter accepts at most 50.

## Order statuses
Order statuses: `PENDING`, `PAID`, `SHIPPED`, `DELIVERED`, `CANCELLED`.

Only orders that have not shipped can be cancelled.
