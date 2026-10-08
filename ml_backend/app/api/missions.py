import json
import urllib.request
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from app.state import app_state
from app.engine.missions import create_mission
from app.engine.lifecycle import approve_mission, cancel_mission

router = APIRouter(tags=["missions"])


class CreateMissionBody(BaseModel):
    id: Optional[str] = None
    service: str
    emergencyClass: str
    sceneNode: str
    priority: Optional[int] = None
    note: str = ""
    emergencyLabel: Optional[str] = None
    dwellSeconds: Optional[float] = None
    sourceDisasterId: Optional[str] = None  # links a call created because of a raised disaster


@router.post("/api/missions")
async def post_mission(body: CreateMissionBody):
    mission = create_mission(
        app_state.store, app_state.settings, body.service, body.emergencyClass, body.sceneNode,
        priority=body.priority, note=body.note, emergency_label=body.emergencyLabel,
        dwell_seconds=body.dwellSeconds, source_disaster_id=body.sourceDisasterId,
        mission_id=body.id,
    )
    if app_state.settings.autoApprove:
        approve_mission(app_state.store, app_state.settings, app_state.log_store, mission.id)
        mission = app_state.store.missions[mission.id]
    return mission.model_dump()


@router.get("/api/missions")
async def list_missions(status: Optional[str] = None, limit: int = 100):
    missions = list(app_state.store.missions.values())
    if status:
        missions = [m for m in missions if m.status == status]
    missions.sort(key=lambda m: m.createdAt, reverse=True)
    return [m.model_dump() for m in missions[:limit]]


@router.get("/api/missions/{mission_id}")
async def get_mission(mission_id: str):
    m = app_state.store.missions.get(mission_id)
    if not m:
        raise HTTPException(404, "mission not found")
    return m.model_dump()


@router.post("/api/missions/{mission_id}/approve")
async def approve(mission_id: str, unit_id: Optional[str] = None):
    if mission_id not in app_state.store.missions:
        try:
            req = urllib.request.Request(f"http://localhost:4000/api/citizen-reports/{mission_id}")
            with urllib.request.urlopen(req, timeout=2.0) as resp:
                data = json.loads(resp.read().decode())
                create_mission(
                    app_state.store, app_state.settings,
                    data.get("service", "medical"),
                    data.get("emergencyClass", "general_emergency"),
                    data.get("sceneNode", "J0001"),
                    priority=data.get("priority", 2),
                    note=data.get("note", ""),
                    emergency_label=data.get("emergencyLabel", "Citizen Call"),
                    mission_id=mission_id,
                )
        except Exception:
            pass

    if mission_id not in app_state.store.missions:
        raise HTTPException(404, "mission not found")

    mission = approve_mission(app_state.store, app_state.settings, app_state.log_store, mission_id, unit_id)
    if mission is None:
        raise HTTPException(409, "no available unit to dispatch")

    # Start simulation running so vehicle immediately advances along the route
    app_state.store.running = True
    return mission.model_dump()


@router.post("/api/missions/{mission_id}/cancel")
async def cancel(mission_id: str):
    if mission_id not in app_state.store.missions:
        raise HTTPException(404, "mission not found")
    cancel_mission(app_state.store, app_state.log_store, mission_id)
    return app_state.store.missions[mission_id].model_dump()