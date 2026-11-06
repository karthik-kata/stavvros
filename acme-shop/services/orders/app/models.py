from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel


class OrderStatus(str, Enum):
    PENDING = "PENDING"
    PAID = "PAID"
    SHIPPED = "SHIPPED"
    DELIVERED = "DELIVERED"
    VOIDED = "VOIDED"
    REFUNDED = "REFUNDED"


class OrderLine(BaseModel):
    sku: str
    quantity: int
    unit_price_cents: int


class Order(BaseModel):
    order_id: str
    customer_id: str
    status: OrderStatus
    lines: list[OrderLine]
    total_cents: int
    created_at: datetime
    delivered_at: Optional[datetime] = None


class OrderPage(BaseModel):
    items: list[Order]
    next_cursor: Optional[str] = None
