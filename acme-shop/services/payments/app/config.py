"""Payments service settings. Values are in code so changes go through review."""

SERVICE_NAME = "payments"

# Refund policy
REFUND_WINDOW_DAYS = 14            # was 30 until the Q3 fraud review
MAX_REFUND_CENTS = 50_000          # $500 per refund
PARTIAL_REFUNDS_ENABLED = False    # disabled while ledger reconciliation is rebuilt
REFUND_IDEMPOTENCY_TTL_HOURS = 24

# Charges
CHARGE_CURRENCY = "USD"
