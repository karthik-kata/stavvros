import httpx

ORDERS_URL = "http://orders:8000"


class OrdersClient:
    def __init__(self) -> None:
        self._http = httpx.AsyncClient(base_url=ORDERS_URL, timeout=5.0)

    async def get(self, order_id: str) -> dict:
        resp = await self._http.get(f"/orders/{order_id}")
        resp.raise_for_status()
        return resp.json()
