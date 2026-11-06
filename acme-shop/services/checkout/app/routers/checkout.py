import uuid

from fastapi import APIRouter
from pydantic import BaseModel

from ..clients.orders_client import OrdersClient
from ..clients.payments_client import PaymentsClient

router = APIRouter(prefix="/checkout", tags=["checkout"])
payments = PaymentsClient()
orders = OrdersClient()


class PayRequest(BaseModel):
    payment_method_id: str


class RefundAsk(BaseModel):
    amount_cents: int


@router.post("/orders/{order_id}/pay", status_code=201)
async def pay(order_id: str, body: PayRequest):
    order = await orders.get(order_id)
    return await payments.charge(order_id, order["total_cents"], body.payment_method_id)


@router.post("/orders/{order_id}/refund", status_code=202)
async def request_refund(order_id: str, body: RefundAsk):
    """Customer-initiated refund from the order history page."""
    return await payments.request_refund(order_id, body.amount_cents, idempotency_key=uuid.uuid4().hex)
