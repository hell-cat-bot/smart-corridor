"""
§5.5 state machine:

  pending -> (approve) -> en_route_scene -> (arrival) -> on_scene -> (dwell expires) ->
    medical: transporting -> (arrival) -> completed (unit available at destination hospital;
             baseFacilityId := that hospital)
    fire:    completed -> sendUnitHome() (alpha=0, plain shortest distance, NOT optimised)

Notes preserved:
  - Leg 2 planned FRESH at dwell-completion, not precomputed at dispatch.
  - homeFacilityId never changes; baseFacilityId changes after a medical drop-off.
  - Fire has one optimised leg only; the return leg is explicitly unoptimised (alpha=0).
  - If no hospital reachable at dwell-completion: hold on scene, dwellRemaining=15, retry.
  - Pending missions re-evaluated as units free up; a unit claimed earlier in a pass isn't reoffered.
"""
from typing import Optional
from app.engine.missions import build_leg, choose_hospital, rank_units
from app.domain.constants import Severity, LogCategory


def approve_mission(store, settings, log_store, mission_id: str, unit_id: Optional[str] = None):
    mission = store.missions[mission_id]
    unit_id = unit_id or mission.suggestedUnitId
    if not unit_id:
        candidates = rank_units(store, settings, mission.service, mission.sceneNode, mission.priority)
        if candidates:
            unit_id = candidates[0].unitId
    if not unit_id:
        for u in store.units.values():
            if u.status in ("available", "returning"):
                unit_id = u.id
                break
    if not unit_id:
        return None
    unit = store.units[unit_id]

    leg, route = build_leg(store, settings, "to_scene", unit.node, mission.sceneNode, unit.type)

    store.update_unit(unit.id, {
        "status": "en_route", "missionId": mission.id, "route": route, "blocked": None,
    })
    store.update_mission(mission.id, {
        "status": "en_route_scene", "unitId": unit.id, "originFacilityId": unit.baseFacilityId,
        "legs": mission.legs + [leg], "activeLeg": 0, "approvedAt": store.simTime,
    })
    log_store.log(store.simTime, LogCategory.DISPATCH.value, Severity.SUCCESS.value,
                  f"{unit.label} dispatched to {mission.id} ({mission.emergencyLabel})",
                  refs={"unitId": unit.id, "missionId": mission.id})
    return mission


def cancel_mission(store, log_store, mission_id: str):
    mission = store.missions[mission_id]
    store.update_mission(mission_id, {"status": "cancelled"})
    if mission.unitId:
        store.update_unit(mission.unitId, {"status": "available", "missionId": None, "route": None, "blocked": None})
    log_store.log(store.simTime, LogCategory.MISSION.value, Severity.INFO.value, f"{mission_id} cancelled")


def on_leg_complete(store, settings, log_store, unit_id: str):
    """Fired when travelled >= total - ARRIVAL_TOLERANCE for a unit's active route."""
    unit = store.units[unit_id]
    if not unit.missionId:
        # was a return-home leg
        store.update_unit(unit_id, {"status": "available", "route": None, "node": unit.route.destNode if unit.route else unit.node})
        return
    mission = store.missions[unit.missionId]

    if mission.status == "en_route_scene":
        store.update_unit(unit_id, {"status": "on_scene", "route": None, "dwellRemaining": mission.dwellTotal})
        store.update_mission(mission.id, {
            "status": "on_scene",
            "onSceneAt": store.simTime,
            "dwellRemaining": mission.dwellTotal,
        })
        log_store.log(store.simTime, LogCategory.MISSION.value, Severity.INFO.value,
                      f"{unit.label} on scene for {mission.id}", refs={"unitId": unit_id, "missionId": mission.id})

    elif mission.status == "transporting":
        dest_hospital_id = mission.hospitalFacilityId
        store.update_unit(unit_id, {
            "status": "available", "missionId": None, "route": None, "baseFacilityId": dest_hospital_id,
        })
        store.update_mission(mission.id, {"status": "completed", "completedAt": store.simTime})
        log_store.log(store.simTime, LogCategory.MISSION.value, Severity.SUCCESS.value,
                      f"{mission.id} completed — {unit.label} available at {dest_hospital_id}",
                      refs={"unitId": unit_id, "missionId": mission.id})


def on_dwell_complete(store, settings, log_store, unit_id: str):
    unit = store.units[unit_id]
    mission = store.missions[unit.missionId]

    if mission.service == "medical":
        choice = choose_hospital(store, settings, mission.sceneNode, unit)
        if choice is None:
            store.update_unit(unit_id, {"dwellRemaining": 15.0})
            log_store.log(store.simTime, "mission", "warning",
                          f"No hospital reachable for {mission.id} — holding on scene, retrying",
                          refs={"unitId": unit_id, "missionId": mission.id})
            return

        hospital = choice["facility"]
        leg, route = build_leg(store, settings, "to_hospital", mission.sceneNode, hospital.node, unit.type)
        store.update_unit(unit_id, {"status": "transporting", "route": route})
        store.update_mission(mission.id, {
            "status": "transporting", "hospitalFacilityId": hospital.id,
            "legs": mission.legs + [leg], "activeLeg": 1,
        })
    else:
        # fire: one optimised leg only. Complete, then send unit home (alpha=0, unoptimised).
        store.update_mission(mission.id, {"status": "completed", "completedAt": store.simTime})
        send_unit_home(store, settings, log_store, unit_id)


def send_unit_home(store, settings, log_store, unit_id: str):
    unit = store.units[unit_id]
    leg, route = build_leg(store, settings, "to_hospital", unit.node, store.network.facilities[unit.homeFacilityId].node,
                            unit.type, alpha_override=0.0)
    route.legType = "return"
    store.update_unit(unit_id, {"status": "returning", "missionId": None, "route": route})


def refresh_pending_suggestions(store, settings, log_store):
    """Re-evaluate pending missions as units free up. A unit claimed earlier in this pass
    must not be offered to a later mission in the same pass. Returns mission IDs newly
    eligible for auto-approval, so the caller (simulation.py) can approve them without a
    circular import into approve_mission()."""
    claimed = set()
    auto_approve_ready = []
    pending = [m for m in store.missions.values() if m.status == "pending"]
    # severity-first: P1 missions claim contested units before P2/P3, even if created later.
    # Equal priority falls back to FCFS (earlier createdAt wins) — matches the agreed dispatch rule.
    pending.sort(key=lambda m: (m.priority, m.createdAt))

    for mission in pending:
        candidates = rank_units(store, settings, mission.service, mission.sceneNode, mission.priority)
        candidates = [c for c in candidates if c.unitId not in claimed]
        if not candidates:
            continue
        store.update_mission(mission.id, {
            "suggestedUnitId": candidates[0].unitId, "suggestedEta": candidates[0].eta,
            "candidates": candidates[:5],
        })
        claimed.add(candidates[0].unitId)
        if settings.autoApprove:
            auto_approve_ready.append(mission.id)

    return auto_approve_ready