"""
§5.3 rankUnits — "Dispatch is ETA-based, not distance-based."
  score = plan.eta + atBase - severityBoost(mission.priority)      <- agreed extension (§B of the API list)
  atBase = 12s penalty if unit.status == "returning"

A nearer unit whose route runs through congestion can lose to a farther one on clear roads,
because congestion inflates both path cost and travel time. The full top-5 candidate list is
kept on the mission and logged — this is the auditability story, don't drop it.

§5.4 chooseHospital — nearest by ETA, unless the unit's home hospital is within 10% of that
(HOME_HOSPITAL_TOLERANCE) in which case prefer home.

§5.5 mission lifecycle state machine.
"""
from typing import List, Optional
from app.domain.constants import (
    SERVICE_TO_UNIT_TYPE, RETURNING_UNIT_PENALTY_S, HOME_HOSPITAL_TOLERANCE,
    EMERGENCY_CLASSES, CUSTOM_EMERGENCY_DEFAULT_PRIORITY, CUSTOM_EMERGENCY_DEFAULT_DWELL,
    FREE_FLOW_SPEED,
)
from app.domain.schemas import Candidate, Mission, Leg, Route
from app.engine.pathfinding import plan_route
from app.engine.geo import measure_path
from app.utils.ids import mission_ids


def severity_mult_for(priority: int, settings) -> float:
    return {1: settings.severityMultiplier.p1, 2: settings.severityMultiplier.p2,
            3: settings.severityMultiplier.p3}.get(priority, 1.0)


def severity_boost_for(priority: int, settings) -> float:
    return {1: settings.severityBoost.p1, 2: settings.severityBoost.p2,
            3: settings.severityBoost.p3}.get(priority, 0.0)


def rank_units(store, settings, service: str, scene_node: str, mission_priority: int = 3) -> List[Candidate]:
    import re
    net = store.network
    m = re.match(r"^J?0*(\d+)$", str(scene_node).strip(), re.I)
    if m:
        padded = f"J{int(m.group(1)):04d}"
        if padded in net.nodes:
            scene_node = padded

    srv = "fire" if service in ("fire", "firetruck") else "medical"
    wanted_type = SERVICE_TO_UNIT_TYPE.get(srv, SERVICE_TO_UNIT_TYPE["medical"]).value
    congestion = {nid: n.congestion for nid, n in store.nodes.items()}
    blocked = store.blocked_node_ids()
    severity_mult = severity_mult_for(mission_priority, settings)

    omega_map = {"ambulance": settings.priorityWeights.ambulance, "firetruck": settings.priorityWeights.firetruck}
    base_speed_map = {"ambulance": 16.7, "firetruck": 13.9}

    candidates: List[Candidate] = []
    for unit in store.units.values():
        if unit.type != wanted_type:
            continue
        if unit.status not in ("available", "returning"):
            continue

        omega = omega_map[unit.type]
        base_speed = base_speed_map[unit.type]
        plan = plan_route(net, unit.node, scene_node, congestion, settings.congestionFactor, omega,
                           base_speed, blocked, severity_mult=severity_mult)
        if not plan.found:
            continue

        at_base = 0.0 if unit.status == "available" else RETURNING_UNIT_PENALTY_S
        boost = severity_boost_for(mission_priority, settings)
        score = plan.eta + at_base - boost

        candidates.append(Candidate(
            unitId=unit.id, label=unit.label, fromNode=unit.node, facilityId=unit.baseFacilityId,
            eta=plan.eta, distance=plan.distance, cost=plan.cost, score=score, path=plan.path,
            missionPriority=mission_priority, severityBoost=boost,
        ))

    # Cross-service fallback if wanted type has no free units
    if not candidates:
        for unit in store.units.values():
            if unit.status not in ("available", "returning"):
                continue
            omega = omega_map.get(unit.type, 1.0)
            base_speed = base_speed_map.get(unit.type, 16.7)
            plan = plan_route(net, unit.node, scene_node, congestion, settings.congestionFactor, omega,
                               base_speed, blocked, severity_mult=severity_mult)
            if not plan.found:
                continue
            at_base = 0.0 if unit.status == "available" else RETURNING_UNIT_PENALTY_S
            boost = severity_boost_for(mission_priority, settings)
            score = plan.eta + at_base - boost + 25.0
            candidates.append(Candidate(
                unitId=unit.id, label=unit.label, fromNode=unit.node, facilityId=unit.baseFacilityId,
                eta=plan.eta, distance=plan.distance, cost=plan.cost, score=score, path=plan.path,
                missionPriority=mission_priority, severityBoost=boost,
            ))

    candidates.sort(key=lambda c: c.score)
    return candidates


def choose_hospital(store, settings, scene_node: str, unit) -> Optional[dict]:
    net = store.network
    congestion = {nid: n.congestion for nid, n in store.nodes.items()}
    blocked = store.blocked_node_ids()
    omega = settings.priorityWeights.ambulance

    options = []
    for fac in net.facilities.values():
        if fac.type != "hospital":
            continue
        plan = plan_route(net, scene_node, fac.node, congestion, settings.congestionFactor, omega, 16.7, blocked)
        if plan.found:
            options.append({"facility": fac, "plan": plan})

    if not options:
        return None

    options.sort(key=lambda o: o["plan"].eta)
    best = options[0]
    home = next((o for o in options if o["facility"].id == unit.homeFacilityId), None)

    if home and home["plan"].eta <= best["plan"].eta * HOME_HOSPITAL_TOLERANCE:
        return home
    return best


def resolve_emergency(service: str, emergency_class: str, priority_override: Optional[int],
                       emergency_label: Optional[str], dwell_seconds: Optional[float]):
    key = (service, emergency_class)
    if key in EMERGENCY_CLASSES:
        label, default_priority, dwell = EMERGENCY_CLASSES[key]
        priority = priority_override or default_priority.value
        custom = False
    else:
        label = emergency_label or "Custom emergency"
        priority = priority_override or CUSTOM_EMERGENCY_DEFAULT_PRIORITY.value
        dwell = dwell_seconds or CUSTOM_EMERGENCY_DEFAULT_DWELL
        custom = True
    return label, priority, dwell, custom


def create_mission(store, settings, service, emergency_class, scene_node, priority=None,
                    note="", emergency_label=None, dwell_seconds=None, source_disaster_id=None,
                    mission_id=None) -> Mission:
    import re
    net = store.network
    m = re.match(r"^J?0*(\d+)$", str(scene_node).strip(), re.I)
    if m:
        padded = f"J{int(m.group(1)):04d}"
        if padded in net.nodes:
            scene_node = padded

    label, priority, dwell, custom = resolve_emergency(service, emergency_class, priority, emergency_label, dwell_seconds)
    candidates = rank_units(store, settings, service, scene_node, mission_priority=priority)

    mission = Mission(
        id=mission_id or mission_ids.next(), service=service, emergencyClass=emergency_class, emergencyLabel=label,
        customEmergency=custom, priority=priority, sceneNode=scene_node, note=note, status="pending",
        suggestedUnitId=candidates[0].unitId if candidates else None,
        suggestedEta=candidates[0].eta if candidates else None,
        candidates=candidates[:5], dwellTotal=dwell * settings.dwellScale, createdAt=store.simTime,
        sourceDisasterId=source_disaster_id,
    )
    store.add_mission(mission)
    return mission


def build_leg(store, settings, leg_type: str, from_node: str, to_node: str, unit_type: str,
              severity_mult: float = 1.0, alpha_override: Optional[float] = None) -> tuple:
    """Returns (Leg, Route) for a freshly planned hop."""
    import re
    net = store.network
    for nid, var in [("to_node", to_node), ("from_node", from_node)]:
        m = re.match(r"^J?0*(\d+)$", str(var).strip(), re.I)
        if m:
            padded = f"J{int(m.group(1)):04d}"
            if padded in net.nodes:
                if nid == "to_node":
                    to_node = padded
                else:
                    from_node = padded

    congestion = {nid: n.congestion for nid, n in store.nodes.items()}
    blocked = store.blocked_node_ids()
    omega = settings.priorityWeights.ambulance if unit_type == "ambulance" else settings.priorityWeights.firetruck
    base_speed = 16.7 if unit_type == "ambulance" else 13.9
    alpha = settings.congestionFactor if alpha_override is None else alpha_override

    plan = plan_route(net, from_node, to_node, congestion, alpha, omega, base_speed, blocked, severity_mult)
    coords, cumulative, node_cumulative, total = measure_path(net, plan.path)

    leg = Leg(**{"from": from_node}, to=to_node, type=leg_type, path=plan.path, distance=plan.distance,
               plannedEta=plan.eta, freeFlowEta=plan.freeFlowEta, startedAt=store.simTime)
    route = Route(path=plan.path, coords=coords, cumulative=cumulative, nodeCumulative=node_cumulative,
                   total=total, travelled=0.0, legType=leg_type, destNode=to_node, unitType=unit_type,
                   plannedAt=store.simTime)
    return leg, route