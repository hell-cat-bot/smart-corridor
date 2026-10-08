"""
Disaster inject/clear. §6.1: injecting or clearing MUST trigger the blockage replan pass
synchronously, not wait for the next tick — the operator expects the new optimal path
instantly, often while the clock is paused (no tick will ever come).
"""
from datetime import datetime, timezone
from typing import Optional
from app.domain.constants import DISASTER_PRESETS, LogCategory, Severity
from app.domain.schemas import Disaster
from app.utils.ids import disaster_ids
from app.engine.replanning import react_to_network_change


def inject_disaster(store, settings, log_store, node: str, type_: str, type_label: Optional[str] = None,
                     severity: float = 0.5, label: str = "", note: str = "") -> Optional[Disaster]:
    if len(store.disasters) >= settings.maxDisasters:
        return None
    if any(d.node == node for d in store.disasters.values()):
        return None

    disp_label = type_label or (type_.replace("_", " ").title() if type_ in DISASTER_PRESETS else "Hazard")
    full_label = label or f"{disp_label} — {store.nodes[node].name}"

    d = Disaster(
        id=disaster_ids.next(), type=type_, typeLabel=disp_label, node=node, severity=severity,
        note=note, label=full_label, simTime=store.simTime,
        timestamp=datetime.now(timezone.utc).isoformat(),
    )
    store.add_disaster(d)
    store.update_node(node, {"status": "blocked"})
    log_store.log(store.simTime, LogCategory.DISASTER.value, Severity.WARNING.value,
                  f"Disaster injected: {full_label}", refs={"nodeId": node, "disasterId": d.id},
                  data={"type": type_, "severity": severity})

    react_to_network_change(store, settings, log_store)
    return d


def clear_disaster(store, settings, log_store, disaster_id: str):
    d = store.disasters.get(disaster_id)
    if not d:
        return
    store.remove_disaster(disaster_id)
    still_blocked = any(other.node == d.node for other in store.disasters.values())
    if not still_blocked:
        store.update_node(d.node, {"status": "normal"})
    log_store.log(store.simTime, LogCategory.DISASTER.value, Severity.INFO.value,
                  f"Disaster cleared: {d.label}", refs={"nodeId": d.node, "disasterId": disaster_id})

    react_to_network_change(store, settings, log_store)


def clear_disaster_by_node(store, settings, log_store, node_id: str):
    to_clear = [d.id for d in store.disasters.values() if d.node == node_id]
    for did in to_clear:
        clear_disaster(store, settings, log_store, did)