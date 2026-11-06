---
title: Self-service refunds
kind: prd
owner: David
owner_role: Product manager
team: Checkout
services: [payments, checkout, notifications]
---

# PRD: Self-service refunds

## 1. Objective
Let customers request a refund from their order history without contacting support, and cut refund-related support tickets by 40%.

## 2. Scope
- Customers can request a refund within 30 days of delivery.
- Partial refunds are supported, for example refunding one item from a multi-item order.
- A single refund cannot exceed $500. Larger refunds go to the support queue.
- Out of scope: cash on delivery, gift card balances.

## 3. Customer experience
1. The customer selects an order and chooses "Request refund".
2. Checkout sends the request to the payments service.
3. The customer receives an email confirming the request, and a second email when the money is sent.

## 4. API
| Method | Path | Status | Response fields |
| --- | --- | --- | --- |
| POST | /v2/refunds | 202 | refund_id, status, estimated_completion |
| GET | /v2/refunds/{refund_id} | 200 | refund_id, order_id, amount_cents, status, created_at |

Every refund request must include an `Idempotency-Key` header.

## 5. Success criteria
1. 40% fewer refund tickets within one quarter of launch.
2. 95% of refunds settle within 24 hours.
