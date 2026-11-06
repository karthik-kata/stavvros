from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from ..config import ORDER_LIST_DEFAULT_LIMIT, ORDER_LIST_MAX_LIMIT
from ..models import Order, OrderPage, OrderStatus

router = APIRouter(prefix="/orders", tags=["orders"])


@router.get("", response_model=OrderPage)
async def list_orders(
    customer_id: str,
    limit: int = Query(ORDER_LIST_DEFAULT_LIMIT, le=ORDER_LIST_MAX_LIMIT),
    cursor: Optional[str] = None,
):
    """Orders for a customer, newest first."""
    ...


@router.get("/{order_id}", response_model=Order)
async def get_order(order_id: str):
    ...


@router.post("/{order_id}/void", response_model=Order)
async def void_order(order_id: str):
    """Void an unpaid or unshipped order. Renamed from /cancel to match finance terminology."""
    order = await get_order(order_id)
    if order.status in (OrderStatus.SHIPPED, OrderStatus.DELIVERED):
        raise HTTPException(status_code=409, detail="Shipped orders cannot be voided")
    ...
