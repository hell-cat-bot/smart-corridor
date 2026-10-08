from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from app.state import app_state
from app.engine.pathfinding import plan_route

router = APIRouter(tags=["routes"])


class CompareBody(BaseModel):
    from_: str = Field(alias="from")
    to: str
    unitType: str
    algorithm: str = "astar"   # astar | dijkstra

    class Config:
        populate_by_name = True


@router.post("/api/routes/compare")
def compare_routes(body: CompareBody):
    store = app_state.store
    settings = app_state.settings
    net = store.network
    if body.from_ not in net.nodes or body.to not in net.nodes:
        raise HTTPException(400, "unknown node id")

    congestion = {nid: n.congestion for nid, n in store.nodes.items()}
    blocked = store.blocked_node_ids()
    omega = settings.priorityWeights.ambulance if body.unitType == "ambulance" else settings.priorityWeights.firetruck
    base_speed = 16.7 if body.unitType == "ambulance" else 13.9

    result = plan_route(net, body.from_, body.to, congestion, settings.congestionFactor, omega,
                         base_speed, blocked, algorithm=body.algorithm)
    return {
        "path": result.path, "distance": result.distance, "cost": result.cost,
        "eta": result.eta, "freeFlowEta": result.freeFlowEta, "expanded": result.expanded,
        "algorithm": result.algorithm,
    }