"""
Payment Platform Service API
Owner: Payments Platform Team (#payments-core)
Repository: stavvros-workspace/services/payment-service
"""

from fastapi import FastAPI, Header, HTTPException, status
from pydantic import BaseModel
from typing import Optional

app = FastAPI(title="Payment Platform Service", version="2.1.0")

class ChargeRequest(BaseModel):
    account_id: str
    amount_cents: int
    currency: str = "USD"
    token: str

class RefundRequest(BaseModel):
    order_id: str
    amount_cents: int
    currency: str = "USD"
    reason: str
    manager_approval: Optional[bool] = False

@app.post("/v2/charges")
def create_charge(charge: ChargeRequest):
    """Processes credit card authorization and capture."""
    return {"charge_id": "ch_554129", "status": "CAPTURED", "amount_cents": charge.amount_cents}

@app.post("/v2/refunds/async", status_code=status.HTTP_202_ACCEPTED)
def initiate_refund_async(refund: RefundRequest, x_idempotency_key: str = Header(...)):
    """
    Asynchronously initiates customer refund.
    NOTE: Migrated from legacy /v1/refunds (synchronous) to /v2/refunds/async.
    Emits Kafka event 'payment.refund.initiated' for background processing.
    """
    # Event bus dispatch simulation: kafka_producer.send("payment.refund.initiated", payload)
    return {
        "refund_id": f"ref_async_{refund.order_id}",
        "status": "ACCEPTED_FOR_PROCESSING",
        "protocol": "kafka_event_stream",
        "idempotency_key": x_idempotency_key
    }

@app.get("/v2/transactions/{transaction_id}")
def get_transaction_status(transaction_id: str):
    """Fetches transaction ledger status from database."""
    return {"transaction_id": transaction_id, "state": "SETTLED"}
