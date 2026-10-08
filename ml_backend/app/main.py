import os
import sys

# Ensure user site-packages (where torch/torchvision/ultralytics/PIL are installed) is on sys.path
user_site = os.path.expanduser(r'~\AppData\Roaming\Python\Python313\site-packages')
if os.path.exists(user_site) and user_site not in sys.path:
    sys.path.insert(0, user_site)

import typing_extensions
if not hasattr(typing_extensions, 'sentinel'):
    typing_extensions.sentinel = getattr(typing_extensions, 'Sentinel', object)

import asyncio
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware

from app.state import app_state
from app.config import env
from app.ws import stream as ws_stream

from app.api import network, snapshot, settings as settings_api, missions, disasters
from app.api import sim, routes, logs, analytics, greenwave, infer

app = FastAPI(title="Packmen Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

for router in (network.router, snapshot.router, settings_api.router, missions.router,
               disasters.router, sim.router, routes.router, logs.router, analytics.router,
               greenwave.router, infer.router):
    app.include_router(router)


@app.websocket("/ws")
async def websocket_route(ws: WebSocket):
    await ws_stream.ws_endpoint(ws)


class TickBroadcaster:
    """Tracks what's already been sent so discrete events only fire on real changes.
    Self-heals across /api/sim/reset: store.tick restarts at 0 after a reset, so a tick
    going backward is used as the signal to clear all cached state -- otherwise stale
    cached values (especially _last_log_seq, from the old LogStore's now-defunct counter)
    would silently suppress every broadcast after a reset, since a fresh LogStore's
    sequence numbers restart from 0 too and would never exceed the stale cached value."""
    def __init__(self):
        self._last_route_planned_at = {}   # unitId -> route.plannedAt
        self._last_mission_status = {}      # missionId -> status
        self._last_disaster_ids = set()
        self._last_log_seq = 0
        self._last_tick_seen = -1

    def _reset_cache(self):
        self._last_route_planned_at = {}
        self._last_mission_status = {}
        self._last_disaster_ids = set()
        self._last_log_seq = 0

    async def run_once(self):
        store = app_state.store
        if store.running:
            app_state.sim.tick()

        if store.tick < self._last_tick_seen:
            self._reset_cache()
        self._last_tick_seen = store.tick

        await ws_stream.broadcast(ws_stream.build_tick_message(store))

        for unit in store.units.values():
            planned_at = unit.route.plannedAt if unit.route else None
            if self._last_route_planned_at.get(unit.id) != planned_at:
                self._last_route_planned_at[unit.id] = planned_at
                await ws_stream.broadcast_route_change(unit.id, unit.route)

        for mission in store.missions.values():
            if self._last_mission_status.get(mission.id) != mission.status:
                is_new = mission.id not in self._last_mission_status
                self._last_mission_status[mission.id] = mission.status
                await ws_stream.broadcast_mission_event(
                    "mission.created" if is_new else "mission.updated", mission)

        current_disaster_ids = set(store.disasters.keys())
        for did in current_disaster_ids - self._last_disaster_ids:
            await ws_stream.broadcast_disaster_event("disaster.created", {"disaster": store.disasters[did].model_dump()})
        for did in self._last_disaster_ids - current_disaster_ids:
            await ws_stream.broadcast_disaster_event("disaster.cleared", {"disasterId": did})
        self._last_disaster_ids = current_disaster_ids

        new_logs = app_state.log_store.query(since=None, limit=1000)
        new_logs = [r for r in new_logs if r.seq > self._last_log_seq]
        if new_logs:
            self._last_log_seq = new_logs[-1].seq
            await ws_stream.broadcast_logs(new_logs)

        if store.tick % 10 == 0:
            metrics_data = app_state.sim.metrics.as_dict()
            metrics_data["congestionHistory"] = store.congestionHistory
            await ws_stream.broadcast_metrics(metrics_data)


broadcaster = TickBroadcaster()


async def _tick_loop():
    tick_seconds = env.tick_ms / 1000.0
    while True:
        await broadcaster.run_once()
        await asyncio.sleep(tick_seconds)


@app.on_event("startup")
async def on_startup():
    asyncio.create_task(_tick_loop())


@app.get("/")
def health():
    return {"status": "ok", "simTime": app_state.store.simTime, "running": app_state.store.running}