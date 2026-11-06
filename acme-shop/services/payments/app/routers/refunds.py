"""Customer refunds. Refunds are processed asynchronously by the ledger worker."""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Header, HTTPException

from ..config import MAX_REFUND_CENTS, PARTIAL_REFUNDS_ENABLED, REFUND_WINDOW_DAYS
from ..events import publish
from ..models import RefundAccepted, RefundDetail, RefundRequest, RefundStatus
from ..orders_lookup import get_order

router = APIRouter(prefix="/v2/refunds", tags=["refunds"])


@router.post("", status_code=202, response_model=RefundAccepted)
async def create_refund(body: RefundRequest, idempotency_key: str = Header(..., alias="Idempotency-Key")):
    """Accept a refund request and hand it to the ledger worker."""
    order = await get_order(body.order_id)

    age_days = (datetime.now(timezone.utc) - order.delivered_at).days
    if age_days > REFUND_WINDOW_DAYS:
        raise HTTPException(status_code=422, detail="Refund window has closed")

    if body.amount_cents > MAX_REFUND_CENTS:
        raise HTTPException(status_code=422, detail="Refund exceeds the maximum amount")

    if not PARTIAL_REFUNDS_ENABLED and body.amount_cents != order.total_cents:
        raise HTTPException(status_code=422, detail="Partial refunds are not supported")

    refund_id = f"rf_{uuid.uuid4().hex[:12]}"
    publish("payments.refund.requested", {"refund_id": refund_id, "order_id": body.order_id})
    return RefundAccepted(refund_id=refund_id, status=RefundStatus.PENDING, eta_seconds=900)


@router.get("/{refund_id}", response_model=RefundDetail)
async def get_refund(refund_id: str):
    """Current state of a refund."""
    ...


def on_ledger_settled(refund_id: str) -> None:
    """Called by the ledger worker when money has moved."""
    publish("payments.refund.completed", {"refund_id": refund_id})
