"""
§5.6 — two independent passes:
  (a) blockage replan   — every tick, + synchronously on disaster inject/clear (§6.1)
  (b) congestion replan — every 10 ticks, gated by cooldown + improvement threshold (§7)

§5.7 — stranded vehicles: if every route to destination is cut, HOLD (don't drive through).
  stopAt = nodeCumulative[blocked_junction_index] - HOLD_STOP_MARGIN_M
  Held units retry every HOLD_RETRY_INTERVAL_S, log once at critical (not on every retry).
  `blocked` must be cleared anywhere a unit's route is set or cleared.

Position-preservation graft on apply: a replan is planned FROM the junction ahead, so naively
swapping the route would teleport the vehicle forward. Graft the current partial segment onto
the new tail instead.
"""
from typing import Optional, List
from app.domain.constants import HOLD_STOP_MARGIN_M, HOLD_RETRY_INTERVAL_S, LogCategory, Severity
from app.domain.schemas import Blocked, Route
from app.engine.geo import next_node_index, measure_path
from app.engine.pathfinding import plan_route


def _base_speed(unit_type: str) -> float:
    return 16.7 if unit_type == "ambulance" else 13.9


def _omega(settings, unit_type: str) -> float:
    return settings.priorityWeights.ambulance if unit_type == "ambulance" else settings.priorityWeights.firetruck


def _apply_replan(store, unit, new_tail: List[str], log_store, kind: str):
    """Graft current position onto new_tail (§5.6 'applying a replan')."""
    net = store.network
    route = unit.route
    idx = next_node_index(route.nodeCumulative, route.travelled)
    prev_node = route.path[max(0, idx - 1)]
    into = route.travelled - route.nodeCumulative[max(0, idx - 1)]

    if idx > 0 and (not new_tail or new_tail[0] != prev_node):
        new_path = [prev_node] + new_tail
    else:
        new_path = new_tail

    coords, cumulative, node_cumulative, total = measure_path(net, new_path)

    if idx > 0 and new_path[0] == prev_node and len(new_path) > 1:
        new_travelled = min(into, node_cumulative[1] if len(node_cumulative) > 1 else 0.0)
    else:
        new_travelled = 0.0

    new_route = Route(
        path=new_path, coords=coords, cumulative=cumulative, nodeCumulative=node_cumulative,
        total=total, travelled=new_travelled, legType=route.legType, destNode=route.destNode,
        originalPath=route.originalPath or route.path, unitType=route.unitType, plannedAt=store.simTime,
    )
    store.update_unit(unit.id, {"route": new_route, "lastReplanAt": store.simTime,
                                 "replanCount": unit.replanCount + 1})
    if unit.missionId and unit.missionId in store.missions:
        m = store.missions[unit.missionId]
        store.update_mission(m.id, {"replans": m.replans + 1})

    log_store.log(store.simTime, LogCategory.ROUTING.value, Severity.INFO.value,
                  f"{unit.label} replanned ({kind})", refs={"unitId": unit.id},
                  data={"kind": kind, "newPathLength": len(new_path)})


def _hold(store, unit, log_store, anchor: str):
    blocked_idx = None
    route = unit.route
    for i, node_id in enumerate(route.path):
        if node_id == anchor:
            blocked_idx = i
            break
    if blocked_idx is None:
        blocked_idx = len(route.nodeCumulative) - 1

    stop_at = max(0.0, route.nodeCumulative[blocked_idx] - HOLD_STOP_MARGIN_M)
    already_held = unit.blocked is not None
    since = unit.blocked.since if already_held else store.simTime

    store.update_unit(unit.id, {"blocked": Blocked(
        node=anchor, since=since, lastTry=store.simTime, stopAt=stop_at, destNode=route.destNode,
    )})
    if not already_held:
        log_store.log(store.simTime, LogCategory.ROUTING.value, Severity.CRITICAL.value,
                      f"{unit.label} is stranded — every route to its destination is cut by a blockage at {anchor}",
                      refs={"unitId": unit.id, "nodeId": anchor})


def run_blockage_replans(store, settings, log_store):
    """§5.6(a) — every tick, and synchronously on disaster inject/clear."""
    blocked_nodes = store.blocked_node_ids()
    any_held = any(u.blocked is not None for u in store.units.values())
    if not blocked_nodes and not any_held:
        return

    for unit in list(store.units.values()):
        if not unit.route:
            continue
        route = unit.route
        idx = next_node_index(route.nodeCumulative, route.travelled)
        ahead_path = route.path[idx:]
        hit = next((n for n in ahead_path if n in blocked_nodes), None)

        if hit is None:
            if unit.blocked is not None:
                store.update_unit(unit.id, {"blocked": None})
                log_store.log(store.simTime, LogCategory.ROUTING.value, Severity.SUCCESS.value,
                              f"{unit.label} released — path clear", refs={"unitId": unit.id})
            continue

        if unit.blocked is not None and (store.simTime - unit.blocked.lastTry) < HOLD_RETRY_INTERVAL_S:
            continue

        anchor = route.path[idx]
        from_node = unit.node if anchor in blocked_nodes else anchor

        net = store.network
        congestion = {nid: n.congestion for nid, n in store.nodes.items()}
        plan = plan_route(net, from_node, route.destNode, congestion, settings.congestionFactor,
                           _omega(settings, unit.type), _base_speed(unit.type), blocked_nodes)

        if not plan.found:
            _hold(store, unit, log_store, anchor)
        else:
            _apply_replan(store, unit, plan.path, log_store, kind="blockage")
            if unit.blocked is not None:
                store.update_unit(unit.id, {"blocked": None})


def run_congestion_replans(store, settings, log_store):
    """§5.6(b) — every 10 ticks, gated by cooldown + improvement threshold."""
    net = store.network
    congestion = {nid: n.congestion for nid, n in store.nodes.items()}
    blocked_nodes = store.blocked_node_ids()

    for unit in list(store.units.values()):
        route = unit.route
        if not route or unit.blocked is not None or route.legType == "return":
            continue
        if (store.simTime - unit.lastReplanAt) < settings.replanCooldown:
            continue

        idx = next_node_index(route.nodeCumulative, route.travelled)
        anchor = route.path[idx]
        if anchor == route.destNode:
            continue

        current_remaining_path = route.path[idx:]
        from app.engine.pathfinding import path_travel_time
        current_eta = path_travel_time(net, current_remaining_path, congestion, _base_speed(unit.type))

        plan = plan_route(net, anchor, route.destNode, congestion, settings.congestionFactor,
                           _omega(settings, unit.type), _base_speed(unit.type), blocked_nodes)
        if not plan.found:
            continue

        improvement = (current_eta - plan.eta) / current_eta if current_eta > 0 else 0.0
        if plan.path == current_remaining_path or improvement < settings.replanImprovement:
            store.update_unit(unit.id, {"lastReplanAt": store.simTime})
            continue

        _apply_replan(store, unit, plan.path, log_store, kind="congestion")


def react_to_network_change(store, settings, log_store):
    """§6.1 — call synchronously right after any mutation of the blocked set."""
    run_blockage_replans(store, settings, log_store)
    from app.engine.lifecycle import refresh_pending_suggestions
    refresh_pending_suggestions(store, settings, log_store)