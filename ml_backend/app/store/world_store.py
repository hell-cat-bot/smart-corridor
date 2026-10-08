"""
"Decision logic lives in engine/*. Stores hold state plus dumb setters only." (§0)
Everything here is a plain container + setter — no A*, no congestion math, no rules.
"""
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from app.domain.schemas import Node, Unit, Mission, Disaster, Light
from app.data.network_loader import Network


@dataclass
class WorldStore:
    network: Network

    simTime: float = 0.0
    tick: int = 0
    running: bool = False
    speed: int = 1

    nodes: Dict[str, Node] = field(default_factory=dict)
    units: Dict[str, Unit] = field(default_factory=dict)
    missions: Dict[str, Mission] = field(default_factory=dict)
    disasters: Dict[str, Disaster] = field(default_factory=dict)
    lights: Dict[str, Light] = field(default_factory=dict)   # only preempted/releasing junctions (§5.8)

    congestionHistory: List[dict] = field(default_factory=list)   # {t, mean}, last 120 @ every 50 ticks

    # civilian agents for §5.1(b) — not exposed on the wire unless requested
    civilians: List[dict] = field(default_factory=list)

    # -------- dumb setters (mirrors the frontend's Zustand setters) --------
    def update_node(self, node_id: str, patch: dict):
        n = self.nodes[node_id]
        for k, v in patch.items():
            setattr(n, k, v)

    def update_unit(self, unit_id: str, patch: dict):
        u = self.units[unit_id]
        for k, v in patch.items():
            setattr(u, k, v)

    def update_mission(self, mission_id: str, patch: dict):
        m = self.missions[mission_id]
        for k, v in patch.items():
            setattr(m, k, v)

    def add_mission(self, mission: Mission):
        self.missions[mission.id] = mission

    def add_disaster(self, disaster: Disaster):
        self.disasters[disaster.id] = disaster

    def remove_disaster(self, disaster_id: str):
        self.disasters.pop(disaster_id, None)

    def set_light(self, node_id: str, patch: Optional[dict]):
        if patch is None:
            self.lights.pop(node_id, None)
            return
        existing = self.lights.get(node_id)
        if existing:
            for k, v in patch.items():
                setattr(existing, k, v)
        else:
            self.lights[node_id] = Light(nodeId=node_id, **patch)

    def blocked_node_ids(self) -> set:
        return {d.node for d in self.disasters.values()}