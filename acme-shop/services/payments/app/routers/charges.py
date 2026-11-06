from fastapi import APIRouter

from ..models import Charge, ChargeRequest

router = APIRouter(prefix="/v1/charges", tags=["charges"])


@router.post("", status_code=201, response_model=Charge)
async def create_charge(body: ChargeRequest):
    """Charge a stored payment method."""
    ...


@router.get("/{charge_id}", response_model=Charge)
async def get_charge(charge_id: str):
    ...
