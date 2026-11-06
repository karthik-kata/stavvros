from fastapi import FastAPI

from .routers import orders

app = FastAPI(title="orders")
app.include_router(orders.router)


@app.get("/healthz")
async def healthz():
    return {"ok": True}
