"""
Data schemas for Payment Platform Service
"""

from pydantic import BaseModel
from typing import Optional

class LedgerEntry(BaseModel):
    entry_id: str
    account_id: str
    amount_cents: int
    entry_type: str  # CREDIT or DEBIT
    timestamp: str

class PaymentMethod(BaseModel):
    method_id: str
    brand: str
    last4: str
    exp_month: int
    exp_year: int
