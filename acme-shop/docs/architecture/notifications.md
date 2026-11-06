---
title: Customer notifications
kind: architecture
owner: Lena
owner_role: Tech lead
team: Growth
services: [notifications]
---

# Customer notifications

The notifications service listens to events from other services and sends templated emails. It never calls other services directly.

## Subscriptions
| Event | Email template |
| --- | --- |
| payments.refund.requested | refund_received |
| payments.refund.completed | refund_sent |
| orders.order.shipped | order_shipped |
