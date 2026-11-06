from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..config import LOGIN_RATE_LIMIT_PER_MINUTE, PASSWORD_MIN_LENGTH, RESET_TOKEN_TTL_MINUTES
from ..security import rate_limit, require_role

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


class PasswordResetRequest(BaseModel):
    email: str


class ImpersonateRequest(BaseModel):
    customer_id: str


@router.post("/login", dependencies=[Depends(rate_limit(LOGIN_RATE_LIMIT_PER_MINUTE))])
async def login(body: LoginRequest):
    if len(body.password) < PASSWORD_MIN_LENGTH:
        raise HTTPException(status_code=422, detail="Password too short")
    ...


@router.post("/logout", status_code=204)
async def logout():
    ...


@router.post("/password-reset", status_code=202)
async def password_reset(body: PasswordResetRequest):
    """Email a reset link valid for RESET_TOKEN_TTL_MINUTES."""
    ...


@router.post("/impersonate", dependencies=[Depends(require_role("support_admin"))])
async def impersonate(body: ImpersonateRequest):
    """Support staff sign in as a customer to reproduce issues."""
    ...
