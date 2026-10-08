"""
§5.1 — four stages, in order:
  (a) ambient baseline (static per node, computed once)
  (b) civilian agents step (every tick)
  (c) density -> target index
  (d) EMA smoothing + hysteresis

Runs every 5 ticks (twice a second). Logged only every 20 sim-seconds — high volume otherwise.

Camera-covered nodes (§9 / ML seam) can override the *simulated* density with a real YOLO count —
see app/ml/yolo_service.py. This module stays agnostic to where the density number came from.
"""
import math
import random
from typing import Dict, List
from app.data.network_loader import Network
from app.domain.constants import CONGESTION_HYSTERESIS_ENTER, CONGESTION_HYSTERESIS_LEAVE, FREE_FLOW_SPEED

FREE_FLOW_CIVILIAN = FREE_FLOW_SPEED["civilian"]


def compute_ambient_baseline(net: Network) -> Dict[str, float]:
    nodes = list(net.nodes.values())
    mean_lat = sum(n.lat for n in nodes) / len(nodes)
    mean_lng = sum(n.lng for n in nodes) / len(nodes)
    max_degree = max((n.degree for n in nodes), default=1)

    def dist(n):
        # simple planar approx is fine here — only used for a 0..1 ambient weight, not routing
        return math.hypot(n.lat - mean_lat, n.lng - mean_lng)

    max_dist = max((dist(n) for n in nodes), default=1) or 1

    ambient = {}
    for n in nodes:
        central = 1 - dist(n) / max_dist
        busy = (n.degree - 1) / max(max_degree - 1, 1)
        ambient[n.id] = 0.04 + 0.16 * central + 0.08 * busy
    return ambient


def spawn_civilians(net: Network, count: int) -> List[dict]:
    node_ids = list(net.nodes.keys())
    civilians = []
    for i in range(count):
        node = random.choice(node_ids)
        nbrs = net.neighbours(node)
        next_node = random.choice(nbrs) if nbrs else node
        civilians.append({
            "id": f"CIV-{str(i + 1).zfill(3)}",
            "node": node, "nextNode": next_node, "progress": random.random(),
            "speedFactor": random.uniform(0.7, 1.3),
        })
    return civilians


def step_civilians(net: Network, civilians: List[dict], dt: float, blocked: set):
    for civ in civilians:
        try:
            seg_length = net.edge_length(civ["node"], civ["nextNode"])
        except KeyError:
            seg_length = 300.0
        speed = FREE_FLOW_CIVILIAN * civ["speedFactor"]
        civ["progress"] += speed * dt / max(seg_length, 1.0)
        if civ["progress"] >= 1.0:
            civ["node"] = civ["nextNode"]
            civ["progress"] = 0.0
            nbrs = [n for n in net.neighbours(civ["node"]) if n not in blocked]
            if not nbrs:
                nbrs = net.neighbours(civ["node"]) or [civ["node"]]
            candidates = [n for n in nbrs if n != civ.get("_prev")] or nbrs
            civ["_prev"] = civ["node"]
            civ["nextNode"] = random.choice(candidates)


def compute_density(net: Network, civilians: List[dict]) -> Dict[str, float]:
    density: Dict[str, float] = {n: 0.0 for n in net.nodes}
    for civ in civilians:
        density[civ["node"]] = density.get(civ["node"], 0.0) + (1 - civ["progress"])
        density[civ["nextNode"]] = density.get(civ["nextNode"], 0.0) + civ["progress"]
    return density


def target_index(ambient: Dict[str, float], density: Dict[str, float], density_saturation: float) -> Dict[str, float]:
    return {
        node_id: min(1.0, ambient[node_id] + density.get(node_id, 0.0) / max(density_saturation, 0.5))
        for node_id in ambient
    }


def ema_update(current: float, target: float, smoothing: float) -> float:
    return min(1.0, max(0.0, current + smoothing * (target - current)))


def status_transition(previous_status: str, c: float, is_blocked_by_disaster: bool) -> str:
    if is_blocked_by_disaster:
        return "blocked"
    if previous_status == "congested":
        return "normal" if c < CONGESTION_HYSTERESIS_LEAVE else "congested"
    return "congested" if c > CONGESTION_HYSTERESIS_ENTER else "normal"


def run_congestion_pass(store, ambient: Dict[str, float], settings, dt_since_last: float):
    """One full pass: step civilians, recompute density, EMA + hysteresis, write into store.nodes."""
    net = store.network
    blocked = store.blocked_node_ids()

    step_civilians(net, store.civilians, dt_since_last, blocked)
    density = compute_density(net, store.civilians)
    target = target_index(ambient, density, settings.densitySaturation)

    for node_id, node in store.nodes.items():
        if node.cameraFed:
            # a real YOLO vehicle count (set by app/ml/inference_worker.py) overrides the
            # simulated civilian density for this node — same formula, real input.
            raw = node.rawDensity
            t = min(1.0, ambient[node_id] + raw / max(settings.densitySaturation, 0.5))
        else:
            raw = density.get(node_id, 0.0)
            t = target[node_id]

        new_c = ema_update(node.congestion, t, settings.congestionSmoothing)
        new_status = status_transition(node.status, new_c, node_id in blocked)
        store.update_node(node_id, {"congestion": new_c, "rawDensity": raw, "status": new_status})