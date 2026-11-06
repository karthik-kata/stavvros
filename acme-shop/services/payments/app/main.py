from fastapi import FastAPI

from .routers import charges, refunds

app = FastAPI(title="payments")
app.include_router(refunds.router)
app.include_router(charges.router)


@app.get("/healthz")
async def healthz():
    return {"ok": True}
