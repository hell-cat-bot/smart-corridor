from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.state import app_state

router = APIRouter(tags=["sim"])


@router.post("/api/sim/start")
def sim_start():
    app_state.store.running = True
    return {"running": True}


@router.post("/api/sim/pause")
def sim_pause():
    app_state.store.running = False
    return {"running": False}


class StepBody(BaseModel):
    seconds: Optional[float] = 1.0


@router.post("/api/sim/step")
def sim_step(body: StepBody):
    app_state.sim.step_seconds(body.seconds or 1.0)
    return {"simTime": app_state.store.simTime, "tick": app_state.store.tick}


class SpeedBody(BaseModel):
    speed: int


@router.post("/api/sim/speed")
def sim_speed(body: SpeedBody):
    if body.speed not in (1, 2, 4, 8):
        raise HTTPException(400, "speed must be one of 1, 2, 4, 8")
    app_state.store.speed = body.speed
    return {"speed": app_state.store.speed}


@router.post("/api/sim/reset")
def sim_reset():
    app_state.reset()
    return {"reset": True}