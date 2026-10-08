from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from app.state import app_state

router = APIRouter(tags=["greenwave"])


class GreenWavePatch(BaseModel):
    enabled: Optional[bool] = None
    radius: Optional[float] = None


@router.get("/api/greenwave/config")
def get_greenwave():
    return app_state.settings.greenwave.model_dump()


@router.patch("/api/greenwave/config")
def patch_greenwave(body: GreenWavePatch):
    if body.enabled is not None:
        app_state.settings.greenwave.enabled = body.enabled
    if body.radius is not None:
        app_state.settings.greenwave.radius = body.radius
    return app_state.settings.greenwave.model_dump()