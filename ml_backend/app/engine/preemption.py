"""
§5.8 — signal preemption and junction arbitration. ORIGINAL logic, unmodified:
  priority = vehicle class (ambulance=1, firetruck=2), NOT mission severity.
  Losers are marked contested/queued but are not given a physical halt state — they simply
  don't receive the preempted green at that junction.

Green wave (new, additive, §E): when settings.greenwave.enabled, requests are collected for
EVERY junction on a unit's remaining path within settings.greenwave.radius (deliberately larger
than preemptRadius) instead of just the next one — same arbitrate()/stepPreemption() underneath.
"""
from dataclasses import dataclass, field
from typing import List, Dict
from app.engine.geo import next_node_index
from app.engine.pathfinding import effective_speed
from app.domain.constants import LogCategory, Severity


@dataclass
class PreemptRequest:
    nodeId: str
    unitId: str
    unitLabel: str
    missionId: str
    priority: int          # vehicle class: ambulance=1, firetruck=2 (ORIGINAL — do not change)
    distance: float
    eta: float
    requestedAt: float


def _base_speed(unit_type: str) -> float:
    return 16.7 if unit_type == "ambulance" else 13.9


def collect_requests(store, settings) -> Dict[str, List[PreemptRequest]]:
    requests: Dict[str, List[PreemptRequest]] = {}
    radius = settings.greenwave.radius if settings.greenwave.enabled else settings.preemptRadius

    for unit in store.units.values():
        if unit.status not in ("en_route", "transporting") or not unit.route:
            continue
        route = unit.route
        idx = next_node_index(route.nodeCumulative, route.travelled)
        priority_class = 1 if unit.type == "ambulance" else 2

        for i in range(idx, len(route.path)):
            node_id = route.path[i]
            distance = route.nodeCumulative[i] - route.travelled
            if distance < 0:
                continue
            if distance > radius:
                # green wave scans the whole remaining path; path is ordered so once one hop
                # is out of radius, everything after it is too — safe to stop scanning.
                break

            congestion = store.nodes[node_id].congestion
            speed = effective_speed(_base_speed(unit.type), congestion)
            eta = distance / max(speed, 0.5)

            req = PreemptRequest(
                nodeId=node_id, unitId=unit.id, unitLabel=unit.label, missionId=unit.missionId or "",
                priority=priority_class, distance=distance, eta=eta, requestedAt=store.simTime,
            )
            requests.setdefault(node_id, []).append(req)

    return requests


def arbitrate(requests: List[PreemptRequest]):
    """ORIGINAL deterministic sort, no randomness, no starvation."""
    def key(r: PreemptRequest):
        return (r.priority, round(r.eta, 3), r.requestedAt, r.unitId)

    ordered = sorted(requests, key=key)
    winner = ordered[0]
    losers = ordered[1:]

    if len(ordered) == 1:
        reason = "sole requester"
    elif winner.priority != losers[0].priority:
        reason = "higher priority class"
    elif round(winner.eta, 3) != round(losers[0].eta, 3):
        reason = "equal priority, earlier ETA to junction"
    elif winner.requestedAt != losers[0].requestedAt:
        reason = "equal priority and ETA, earlier request"
    else:
        reason = "equal on all keys, deterministic unit-id tie-break"

    return winner, losers, reason


def step_preemption(store, settings, log_store):
    """§5.8 stepPreemption — grants/releases, contested/conflict logging. ORIGINAL behaviour:
    losers are marked contested, not physically halted."""
    all_requests = collect_requests(store, settings)
    granted_count = 0
    conflicts_count = 0

    for node_id, reqs in all_requests.items():
        winner, losers, reason = arbitrate(reqs)
        existing_light = store.lights.get(node_id)
        is_new_grant = existing_light is None or existing_light.servingUnitId != winner.unitId

        since = store.simTime if is_new_grant else (existing_light.since if existing_light else store.simTime)
        contested = len(losers) > 0

        store.set_light(node_id, {
            "state": "preempt_green", "servingUnitId": winner.unitId, "missionId": winner.missionId,
            "since": since, "releaseAt": None, "contested": contested,
            "queue": [l.unitId for l in losers],
        })

        if is_new_grant:
            granted_count += 1
            log_store.log(store.simTime, LogCategory.SIGNAL.value, Severity.SUCCESS.value,
                          f"{winner.unitLabel} granted preemption at {node_id} ({reason})",
                          refs={"nodeId": node_id, "unitId": winner.unitId})

        was_uncontested = existing_light is not None and not existing_light.contested
        if contested and (is_new_grant or was_uncontested):
            conflicts_count += 1
            log_store.log(store.simTime, LogCategory.CONFLICT.value, Severity.WARNING.value,
                          f"Junction {node_id} contested — {winner.unitLabel} wins ({reason})",
                          refs={"nodeId": node_id},
                          data={"winner": winner.unitId, "losers": [l.unitId for l in losers], "reason": reason})

    # release junctions no longer requested
    for node_id in list(store.lights.keys()):
        if node_id in all_requests:
            continue
        light = store.lights[node_id]
        release_at = light.releaseAt or (store.simTime + settings.releaseDelay)
        if store.simTime >= release_at:
            store.set_light(node_id, None)
            log_store.log(store.simTime, LogCategory.SIGNAL.value, Severity.INFO.value,
                          f"Junction {node_id} released back to normal cycle", refs={"nodeId": node_id})
        else:
            store.set_light(node_id, {"state": "releasing", "releaseAt": release_at, "contested": False})

    return granted_count, conflicts_count