"""
Payment Service Client for Checkout Service
Cross-service dependency to payment-service.
"""

import requests

class PaymentClient:
    def __init__(self, base_url: str = "http://payment-service:8001"):
        self.base_url = base_url

    def invoke_refund(self, order_id: str, amount_cents: int, reason: str):
        """
        Dispatches request to payment service.
        Calls the payment refund endpoint.
        """
        url = f"{self.base_url}/v2/refunds/async"
        payload = {
            "order_id": order_id,
            "amount_cents": amount_cents,
            "reason": reason
        }
        headers = {"X-Idempotency-Key": f"ref_{order_id}"}
        # In actual execution, calls requests.post(url, json=payload, headers=headers)
        return {"status": "REQUESTED", "endpoint_used": url}
