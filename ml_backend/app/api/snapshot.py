from fastapi import APIRouter
from app.state import app_state

router = APIRouter(tags=["snapshot"])


@router.get("/api/world/snapshot")
def get_snapshot():
    store = app_state.store
    return {
        "simTime": store.simTime, "tick": store.tick, "running": store.running, "speed": store.speed,
        "nodes": [n.model_dump() for n in store.nodes.values()],
        "units": [u.model_dump() for u in store.units.values()],
        "missions": [m.model_dump() for m in store.missions.values()],
        "disasters": [d.model_dump() for d in store.disasters.values()],
        "lights": {k: v.model_dump() for k, v in store.lights.items()},
        "congestionHistory": store.congestionHistory,
        "metrics": app_state.sim.metrics.as_dict(),
    }