from fastapi import APIRouter
from app.state import app_state

router = APIRouter(tags=["analytics"])


@router.get("/api/analytics/summary")
def analytics_summary():
    store = app_state.store
    metrics = app_state.sim.metrics.as_dict()
    return {
        "simTime": store.simTime,
        "unitCount": len(store.units),
        "activeMissions": len([m for m in store.missions.values()
                                if m.status in ("assigned", "en_route_scene", "on_scene", "transporting")]),
        "disasterCount": len(store.disasters),
        "metrics": metrics,
    }