from fastapi import FastAPI

from .routers import auth

app = FastAPI(title="auth")
app.include_router(auth.router)
