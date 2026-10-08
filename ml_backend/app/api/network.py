from fastapi import APIRouter
from app.state import app_state

router = APIRouter(tags=["network"])


@router.get("/api/network")
def get_network():
    net = app_state.store.network
    return {
        "meta": net.meta,
        "nodes": [{"id": n.id, "lat": n.lat, "lng": n.lng, "name": n.name, "degree": n.degree}
                  for n in net.nodes.values()],
        "edges": [{"from": e.from_, "to": e.to, "length": e.length, "roadName": e.roadName,
                   "roadClass": e.roadClass, "geometry": e.geometry} for e in net.edges.values()],
        "facilities": [{"id": f.id, "type": f.type, "node": f.node, "name": f.name, "short": f.short,
                         "beds": f.beds, "bays": f.bays} for f in net.facilities.values()],
    }