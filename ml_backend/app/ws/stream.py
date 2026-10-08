"""
§8.4 — one connection, server->client, batched. Do NOT send one message per changed field.

- ~10Hz tick messages: units (pos/heading/route.travelled/node/status/blocked), lights
  (changed only, null = released), nodes (changed only).
- Discrete events as they happen: mission.created/updated, unit.route (FULL route object —
  only sent when a route actually changes), unit.blocked, unit.released, disaster.created/cleared,
  log, metrics.
- Reconnect protocol: client calls /api/world/snapshot, then resubscribes. No event replay.
"""
import asyncio
import json
from fastapi import WebSocket, WebSocketDisconnect
from typing import Set

connected_clients: Set[WebSocket] = set()


async def register(ws: WebSocket):
    await ws.accept()
    connected_clients.add(ws)


def unregister(ws: WebSocket):
    connected_clients.discard(ws)


async def broadcast(message: dict):
    if not connected_clients:
        return
    payload = json.dumps(message, default=str)
    dead = []
    for ws in list(connected_clients):
        try:
            await ws.send_text(payload)
        except Exception:
            dead.append(ws)
    for ws in dead:
        unregister(ws)


def build_tick_message(store) -> dict:
    """Per-tick payload — only what the frontend needs to move markers and update badges.
    Full route objects are NOT included here; those go out as separate unit.route events
    only when a route actually changes (see broadcast_route_change below)."""
    return {
        "type": "tick", "simTime": store.simTime, "tick": store.tick,
        "units": [
            {
                "id": u.id, "pos": u.pos, "heading": u.heading,
                "route": {"travelled": u.route.travelled} if u.route else None,
                "node": u.node, "status": u.status,
                "dwellRemaining": u.dwellRemaining,
                "blocked": u.blocked.model_dump() if u.blocked else None,
            }
            for u in store.units.values()
        ],
        "lights": {k: v.model_dump() for k, v in store.lights.items()},
        # nodes: send only nodes whose congestion moved meaningfully this tick; the caller
        # (main.py's tick task) is responsible for diffing and passing a filtered list in if
        # bandwidth matters — kept simple here and sends the full set each 5-tick congestion pass.
        "nodes": [{"id": n.id, "congestion": n.congestion, "status": n.status} for n in store.nodes.values()],
    }


async def broadcast_route_change(unit_id: str, route):
    await broadcast({"type": "unit.route", "unitId": unit_id, "route": route.model_dump() if route else None})


async def broadcast_mission_event(event_type: str, mission):
    await broadcast({"type": event_type, "mission": mission.model_dump()})


async def broadcast_disaster_event(event_type: str, payload: dict):
    await broadcast({"type": event_type, **payload})


async def broadcast_logs(entries: list):
    if entries:
        await broadcast({"type": "log", "entries": [e.model_dump() for e in entries]})


async def broadcast_metrics(metrics: dict):
    await broadcast({"type": "metrics", "metrics": metrics})


async def ws_endpoint(ws: WebSocket):
    await register(ws)
    try:
        while True:
            # this stream is server->client; we still need to read to detect disconnects
            await ws.receive_text()
    except WebSocketDisconnect:
        unregister(ws)
    except Exception:
        unregister(ws)