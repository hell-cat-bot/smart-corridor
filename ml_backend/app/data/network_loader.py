"""
§3 — loads the static network once. Never mutated at runtime.

Critical properties preserved:
  - graph is undirected, single connected component
  - edge.length is always used verbatim (never recomputed via haversine)
  - edge index keyed by the SORTED pair: f"{min(a,b)}|{max(a,b)}"  (matches frontend's edgeKey)
"""
import json
import os
from dataclasses import dataclass, field
from typing import Dict, List, Tuple


def edge_key(a: str, b: str) -> str:
    lo, hi = sorted([a, b])
    return f"{lo}|{hi}"


@dataclass
class Edge:
    from_: str
    to: str
    length: float
    roadName: str
    roadClass: str
    geometry: List[List[float]]   # [lat, lng] pairs, from_ -> to


@dataclass
class NetworkNode:
    id: str
    lat: float
    lng: float
    name: str
    degree: int


@dataclass
class Facility:
    id: str
    type: str
    node: str
    name: str
    short: str
    beds: int = None
    bays: int = None


@dataclass
class Network:
    meta: dict
    nodes: Dict[str, NetworkNode] = field(default_factory=dict)
    edges: Dict[str, Edge] = field(default_factory=dict)          # keyed by edge_key
    adjacency: Dict[str, List[str]] = field(default_factory=dict)  # nodeId -> [neighbourIds]
    facilities: Dict[str, Facility] = field(default_factory=dict)

    def get_edge(self, a: str, b: str) -> Edge:
        return self.edges[edge_key(a, b)]

    def edge_length(self, a: str, b: str) -> float:
        return self.get_edge(a, b).length

    def neighbours(self, node_id: str) -> List[str]:
        return self.adjacency.get(node_id, [])

    def geometry_for_hop(self, a: str, b: str) -> List[List[float]]:
        """Geometry runs from_->to; reverse it when traversing to->from (§3)."""
        e = self.get_edge(a, b)
        return e.geometry if e.from_ == a else list(reversed(e.geometry))


def load_network(path: str) -> Network:
    with open(path, "r") as f:
        raw = json.load(f)

    net = Network(meta=raw["meta"])

    for n in raw["nodes"]:
        net.nodes[n["id"]] = NetworkNode(
            id=n["id"], lat=n["lat"], lng=n["lng"], name=n.get("name", ""), degree=n.get("degree", 0)
        )
        net.adjacency[n["id"]] = []

    for e in raw["edges"]:
        key = edge_key(e["from"], e["to"])
        net.edges[key] = Edge(
            from_=e["from"], to=e["to"], length=e["length"],
            roadName=e.get("roadName", ""), roadClass=e.get("roadClass", ""),
            geometry=e["geometry"],
        )
        net.adjacency.setdefault(e["from"], []).append(e["to"])
        net.adjacency.setdefault(e["to"], []).append(e["from"])

    for fac in raw.get("facilities", []):
        net.facilities[fac["id"]] = Facility(
            id=fac["id"], type=fac["type"], node=fac["node"],
            name=fac.get("name", ""), short=fac.get("short", ""),
            beds=fac.get("beds"), bays=fac.get("bays"),
        )

    return net


DEFAULT_NETWORK_PATH = os.path.join(os.path.dirname(__file__), "network.json")