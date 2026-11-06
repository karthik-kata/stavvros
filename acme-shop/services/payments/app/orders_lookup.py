"""Read-only view of orders used for refund checks."""
import httpx

ORDERS_URL = "http://orders:8000"


async def get_order(order_id: str):
    async with httpx.AsyncClient() as http:
        resp = await http.get(f"{ORDERS_URL}/orders/{order_id}")
        resp.raise_for_status()
        return resp.json()
