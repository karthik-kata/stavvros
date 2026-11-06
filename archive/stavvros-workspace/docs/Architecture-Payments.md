# Architecture Specification: Payments & Checkout System Boundaries

**Document ID**: ARCH-PAYMENTS-2025  
**Owning Team**: Payments Platform Team (#payments-core)  
**Status**: Active  

---

## 1. System Overview
The Payments Platform acts as the centralized accounting, processor abstraction (Stripe, Adyen), and ledger management gateway for the company. Downstream systems (such as `checkout-service` and `subscription-service`) must interact with the Payments Platform via defined public APIs.

---

## 2. Core Services
- **Checkout Service (`checkout-service`)**:
  - Owned by: Checkout Team
  - Responsibilities: Cart state, discount application, shipping address validation, order placement.
  - Dependencies: Invokes `payment-service` to authorize payments and initiate refunds.

- **Payment Service (`payment-service`)**:
  - Owned by: Payments Platform Team
  - Responsibilities: Card tokenization, merchant gateway dispatch, transaction ledger, compliance logging.
  - Exposed Routes:
    - `POST /v2/charges`: Authorize and capture customer charge.
    - `POST /v2/refunds/async`: Asynchronously initiate refund with Kafka event dispatch.
    - `GET /v2/transactions/{id}`: Query transaction ledger status.

---

## 3. Communication Patterns
All write-intensive payment and refund operations must use asynchronous idempotency workers via Kafka event bus `payment.events` to prevent database locking during high-traffic flash sales.
