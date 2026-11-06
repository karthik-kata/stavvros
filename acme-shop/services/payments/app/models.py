from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class RefundStatus(str, Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"


class RefundRequest(BaseModel):
    order_id: str
    amount_cents: int = Field(gt=0)
    reason: Optional[str] = None


class RefundAccepted(BaseModel):
    refund_id: str
    status: RefundStatus
    eta_seconds: int


class RefundDetail(BaseModel):
    refund_id: str
    order_id: str
    amount_cents: int
    status: RefundStatus
    created_at: datetime


class ChargeRequest(BaseModel):
    order_id: str
    amount_cents: int = Field(gt=0)
    payment_method_id: str


class Charge(BaseModel):
    charge_id: str
    order_id: str
    amount_cents: int
    currency: str
