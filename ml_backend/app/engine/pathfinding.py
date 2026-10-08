"""
§5.2 — routing cost function and A*.

segment_cost = length * (1 + alpha * congestion(dest_node) * omega * severity_mult)
  alpha = settings.congestionFactor (default 2.0)
  omega = per vehicle class: ambulance 0.6, firetruck 0.8, civilian 1.0
  severity_mult = optional extension (§G), defaults to 1.0 — feeds mission severity into the pathfinder itself

Blocked (disaster) junctions are removed from the graph entirely before search — infinite cost,
independent of congestion. A* heuristic = haversine straight-line distance (admissible since
segment_cost >= length >= haversine).
"""
import heapq
import re
from dataclasses import dataclass
from typing import Dict, List, Optional, Set

from app.data.network_loader import Network
from app.engine.geo import haversine_m
from app.domain.constants import CONGESTION_SLOWDOWN, FREE_FLOW_SPEED


def segment_cost(length: float, congestion: float, alpha: float, omega: float, severity_mult: float = 1.0) -> float:
    c = min(1.0, max(0.0, congestion))
    return length * (1 + alpha * c * omega * severity_mult)


def effective_speed(base_speed: float, congestion: float) -> float:
    c = min(1.0, max(0.0, congestion))
    return max(base_speed * (1 - CONGESTION_SLOWDOWN * c), base_speed * 0.2)


def normalize_node(nid: str, net: Network) -> str:
    if not nid:
        return next(iter(net.nodes.keys())) if net.nodes else "J0001"
    raw = str(nid).strip()
    if raw in net.nodes:
        return raw
    m = re.match(r"^J?0*(\d+)$", raw, re.I)
    if m:
        padded = f"J{int(m.group(1)):04d}"
        if padded in net.nodes:
            return padded
    return raw


def path_travel_time(net: Network, path: List[str], congestion: Dict[str, float], base_speed: float) -> float:
    total = 0.0
    for i in range(len(path) - 1):
        length = net.edge_length(path[i], path[i + 1])
        dest_congestion = congestion.get(path[i + 1], 0.0)
        total += length / effective_speed(base_speed, dest_congestion)
    return total


@dataclass
class PlanResult:
    found: bool
    path: List[str]
    cost: float
    distance: float
    expanded: int
    eta: float
    freeFlowEta: float
    algorithm: str


def _search(
    net: Network,
    start: str,
    goal: str,
    congestion: Dict[str, float],
    alpha: float,
    omega: float,
    base_speed: float,
    blocked: Set[str],
    algorithm: str,
    severity_mult: float = 1.0,
) -> PlanResult:
    start = normalize_node(start, net)
    goal = normalize_node(goal, net)

    if start not in net.nodes or goal not in net.nodes:
        return PlanResult(False, [], 0.0, 0.0, 0, 0.0, 0.0, algorithm)

    if start == goal:
        return PlanResult(True, [start], 0.0, 0.0, 0, 0.0, 0.0, algorithm)

    # Allow response unit to reach the incident/goal node even if blocked
    effective_blocked = {b for b in blocked if b != goal}
    if start in effective_blocked:
        return PlanResult(False, [], 0.0, 0.0, 0, 0.0, 0.0, algorithm)

    def heuristic(n: str) -> float:
        if algorithm != "astar":
            return 0.0
        a, b = net.nodes[n], net.nodes[goal]
        return haversine_m(a.lat, a.lng, b.lat, b.lng)

    open_heap = [(heuristic(start), 0.0, start)]
    g_cost: Dict[str, float] = {start: 0.0}
    came_from: Dict[str, str] = {}
    visited: Set[str] = set()
    expanded = 0

    while open_heap:
        _, g, node = heapq.heappop(open_heap)
        if node in visited:
            continue
        visited.add(node)
        expanded += 1

        if node == goal:
            path = [node]
            while path[-1] in came_from:
                path.append(came_from[path[-1]])
            path.reverse()
            distance = sum(net.edge_length(path[i], path[i + 1]) for i in range(len(path) - 1))
            eta = path_travel_time(net, path, congestion, base_speed)
            free_flow = path_travel_time(net, path, {}, base_speed)
            return PlanResult(True, path, g, distance, expanded, eta, free_flow, algorithm)

        for nbr in net.neighbours(node):
            if nbr in effective_blocked or nbr in visited:
                continue
            length = net.edge_length(node, nbr)
            c = congestion.get(nbr, 0.0)
            step_cost = segment_cost(length, c, alpha, omega, severity_mult)
            tentative = g + step_cost
            if tentative < g_cost.get(nbr, float("inf")):
                g_cost[nbr] = tentative
                came_from[nbr] = node
                heapq.heappush(open_heap, (tentative + heuristic(nbr), tentative, nbr))

    return PlanResult(False, [], 0.0, 0.0, expanded, 0.0, 0.0, algorithm)


def a_star(net, start, goal, congestion, alpha, omega, base_speed, blocked, severity_mult=1.0) -> PlanResult:
    return _search(net, start, goal, congestion, alpha, omega, base_speed, blocked, "astar", severity_mult)


def dijkstra(net, start, goal, congestion, alpha, omega, base_speed, blocked, severity_mult=1.0) -> PlanResult:
    return _search(net, start, goal, congestion, alpha, omega, base_speed, blocked, "dijkstra", severity_mult)


def plan_route(net, start, goal, congestion, alpha, omega, base_speed, blocked,
                algorithm="astar", severity_mult=1.0) -> PlanResult:
    fn = a_star if algorithm == "astar" else dijkstra
    return fn(net, start, goal, congestion, alpha, omega, base_speed, blocked, severity_mult)