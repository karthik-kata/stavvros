from fastapi import FastAPI

from .routers import checkout

app = FastAPI(title="checkout")
app.include_router(checkout.router)
