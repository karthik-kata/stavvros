"""
Checkout Service API
Owner: Checkout Team (#checkout-devs)
Repository: stavvros-workspace/services/checkout-service
"""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="Checkout Service", version="1.0.0")

class CartItem(BaseModel):
    item_id: str
    quantity: int
    price_cents: int

class CheckoutRequest(BaseModel):
    cart_id: str
    user_id: str
    items: list[CartItem]
    currency: str = "USD"

@app.post("/api/checkout/cart")
def submit_cart(request: CheckoutRequest):
    """Submits customer shopping cart for checkout processing."""
    total = sum(i.price_cents * i.quantity for i in request.items)
    return {"status": "CHECKOUT_INITIATED", "cart_id": request.cart_id, "total_cents": total}

@app.get("/api/checkout/orders/{order_id}")
def get_order(order_id: str):
    """Retrieves order summary and eligibility status for returns."""
    return {"order_id": order_id, "status": "DELIVERED", "eligible_for_refund": True}

@app.post("/api/checkout/request-refund")
def trigger_refund(order_id: str, amount_cents: int, reason: str):
    """
    Triggers refund workflow by calling the Payments Platform.
    Note: Depends on payment-service to process money movements.
    """
    from client import PaymentClient
    client = PaymentClient()
    result = client.invoke_refund(order_id=order_id, amount_cents=amount_cents, reason=reason)
    return {"order_id": order_id, "refund_status": result}
