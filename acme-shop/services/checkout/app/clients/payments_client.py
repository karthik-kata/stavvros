"""HTTP client for the payments service."""
import httpx

PAYMENTS_URL = "http://payments:8000"


class PaymentsClient:
    def __init__(self) -> None:
        self._http = httpx.AsyncClient(base_url=PAYMENTS_URL, timeout=5.0)

    async def charge(self, order_id: str, amount_cents: int, payment_method_id: str) -> dict:
        resp = await self._http.post(
            "/v1/charges",
            json={"order_id": order_id, "amount_cents": amount_cents, "payment_method_id": payment_method_id},
        )
        resp.raise_for_status()
        return resp.json()

    async def request_refund(self, order_id: str, amount_cents: int, idempotency_key: str) -> dict:
        resp = await self._http.post(
            "/v1/refunds",
            json={"order_id": order_id, "amount_cents": amount_cents},
            headers={"Idempotency-Key": idempotency_key},
        )
        resp.raise_for_status()
        return resp.json()
