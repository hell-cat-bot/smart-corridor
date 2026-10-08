from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from app.state import app_state
from app.config import PriorityWeights, SeverityMultiplier, SeverityBoost, GreenWaveConfig

router = APIRouter(tags=["settings"])


class SettingsPatch(BaseModel):
    congestionFactor: Optional[float] = None
    priorityWeights: Optional[PriorityWeights] = None
    severityMultiplier: Optional[SeverityMultiplier] = None
    severityBoost: Optional[SeverityBoost] = None
    replanCooldown: Optional[float] = None
    replanImprovement: Optional[float] = None
    civilianCount: Optional[int] = None
    congestionSmoothing: Optional[float] = None
    densitySaturation: Optional[float] = None
    autoApprove: Optional[bool] = None
    dwellScale: Optional[float] = None
    preemptRadius: Optional[float] = None
    releaseDelay: Optional[float] = None
    signalCycle: Optional[float] = None
    maxDisasters: Optional[int] = None
    greenwave: Optional[GreenWaveConfig] = None


@router.get("/api/settings")
def get_settings():
    return app_state.settings.model_dump()


@router.patch("/api/settings")
def patch_settings(patch: SettingsPatch):
    # NOTE: takes effect on the NEXT plan only — never retroactively rewrites existing routes,
    # per the contract. We simply mutate the live Settings object; in-flight routes are untouched
    # because they were already computed and stored on the unit/mission.
    data = patch.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(app_state.settings, k, v)
    return app_state.settings.model_dump()