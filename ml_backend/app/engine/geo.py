"""
§4.6 — Route carries TWO parallel measurement systems. Never index `path` with a `coords` index.

  coords / cumulative   -> drawing the line, positioning the vehicle (follows the real road curve)
  path / nodeCumulative -> junction-level reasoning: preemption distance, replan anchors, ETA slicing
"""
import math
from typing import List, Tuple, Dict
from app.data.network_loader import Network

TOLERANCE_M = 0.001


def haversine_m(lat1, lng1, lat2, lng2) -> float:
    R = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * R * math.asin(min(1.0, math.sqrt(a)))


def measure_path(net: Network, path: List[str]) -> Tuple[List[List[float]], List[float], List[float], float]:
    """
    Builds coords/cumulative/nodeCumulative/total for a junction-only path.
    Start at path[0]; for each hop, append the edge's geometry (reversed if to->from),
    skipping duplicate points; push the running total into nodeCumulative at each junction.
    """
    if not path:
        return [], [], [], 0.0

    coords: List[List[float]] = []
    cumulative: List[float] = []
    node_cumulative: List[float] = [0.0]
    total = 0.0

    first_node = net.nodes[path[0]]
    coords.append([first_node.lat, first_node.lng])
    cumulative.append(0.0)

    for i in range(len(path) - 1):
        a, b = path[i], path[i + 1]
        geom = net.geometry_for_hop(a, b)
        # geom[0] duplicates the point we're already at — skip it
        for pt in geom[1:]:
            prev = coords[-1]
            total += haversine_m(prev[0], prev[1], pt[0], pt[1])
            coords.append(pt)
            cumulative.append(total)
        node_cumulative.append(total)

    return coords, cumulative, node_cumulative, total


def next_node_index(node_cumulative: List[float], travelled: float) -> int:
    """Index of the first junction at or beyond current position."""
    for i, d in enumerate(node_cumulative):
        if d >= travelled - TOLERANCE_M:
            return i
    return len(node_cumulative) - 1


def last_node_at(path: List[str], node_cumulative: List[float], travelled: float) -> str:
    idx = next_node_index(node_cumulative, travelled)
    if node_cumulative[idx] > travelled + TOLERANCE_M:
        idx = max(0, idx - 1)
    return path[idx]


def next_node_at(path: List[str], node_cumulative: List[float], travelled: float) -> str:
    """The junction currently being driven INTO — this sets the current speed."""
    idx = next_node_index(node_cumulative, travelled)
    return path[idx]


def position_along_path(coords: List[List[float]], cumulative: List[float], travelled: float) -> Dict[str, float]:
    """Binary search + linear interpolation -> {lat, lng, heading}."""
    if not coords:
        return {"lat": 0.0, "lng": 0.0, "heading": 0.0}
    if travelled <= cumulative[0]:
        i = 0
    elif travelled >= cumulative[-1]:
        i = len(cumulative) - 2 if len(cumulative) > 1 else 0
    else:
        lo, hi = 0, len(cumulative) - 1
        while lo < hi:
            mid = (lo + hi) // 2
            if cumulative[mid] < travelled:
                lo = mid + 1
            else:
                hi = mid
        i = max(0, lo - 1)

    p0, p1 = coords[i], coords[min(i + 1, len(coords) - 1)]
    d0, d1 = cumulative[i], cumulative[min(i + 1, len(cumulative) - 1)]
    span = max(d1 - d0, 1e-9)
    t = min(1.0, max(0.0, (travelled - d0) / span))

    lat = p0[0] + (p1[0] - p0[0]) * t
    lng = p0[1] + (p1[1] - p0[1]) * t
    heading = math.degrees(math.atan2(
        math.radians(p1[1] - p0[1]) * math.cos(math.radians((p0[0] + p1[0]) / 2)),
        math.radians(p1[0] - p0[0]),
    ))
    heading = (90 - heading) % 360   # 0 = north
    return {"lat": lat, "lng": lng, "heading": heading}