"""Customer emails triggered by events from other services."""
from .bus import subscribe
from .mailer import send_template


@subscribe("payments.refund.completed")
def on_refund_completed(event: dict) -> None:
    send_template("refund_sent", to=event["customer_email"], refund_id=event["refund_id"])


@subscribe("orders.order.shipped")
def on_order_shipped(event: dict) -> None:
    send_template("order_shipped", to=event["customer_email"], order_id=event["order_id"])
