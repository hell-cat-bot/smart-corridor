"""
§4.2 seeding rule: 2 ambulances at the first hospital, 1 at each additional hospital;
2 engines at the first station, 1 at each additional. IDs AMB-01.., FT-01..
"""
from app.data.network_loader import Network
from app.domain.schemas import Node, Unit


def seed_world(store):
    net: Network = store.network

    # nodes start at ambient congestion 0 / normal — congestion engine fills these in on first tick
    for n in net.nodes.values():
        store.nodes[n.id] = Node(id=n.id, lat=n.lat, lng=n.lng, name=n.name, degree=n.degree)

    hospitals = [f for f in net.facilities.values() if f.type == "hospital"]
    stations = [f for f in net.facilities.values() if f.type == "fire_station"]

    amb_n = 0
    for i, h in enumerate(hospitals):
        count = 2 if i == 0 else 1
        for _ in range(count):
            amb_n += 1
            uid = f"AMB-{str(amb_n).zfill(2)}"
            node = net.nodes[h.node]
            store.units[uid] = Unit(
                id=uid, label=f"Ambulance {uid.split('-')[1]}", type="ambulance", service="medical",
                homeFacilityId=h.id, baseFacilityId=h.id, status="available",
                node=h.node, pos={"lat": node.lat, "lng": node.lng},
            )

    ft_n = 0
    for i, s in enumerate(stations):
        count = 2 if i == 0 else 1
        for _ in range(count):
            ft_n += 1
            uid = f"FT-{str(ft_n).zfill(2)}"
            node = net.nodes[s.node]
            store.units[uid] = Unit(
                id=uid, label=f"Engine {uid.split('-')[1]}", type="firetruck", service="fire",
                homeFacilityId=s.id, baseFacilityId=s.id, status="available",
                node=s.node, pos={"lat": node.lat, "lng": node.lng},
            )