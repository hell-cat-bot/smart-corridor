"""
§6 — the ordered tick loop. TICK_MS=100 (10Hz). dt = 0.1 * speed.
Order matters:
  1. simTime/tick advance
  2. civilians step (every tick)
  3. congestion update (every 5 ticks)
  4. move the fleet
  5. commit world patch
  6. fire arrivals
  7. fire dwell-done
  8. blockage replans (every tick)
  9. congestion replans + refresh pending (every 10 ticks)
 10. preemption (every tick)
 11. corridor session (not modelled here — no corridor concept in this scaffold)

congestionHistory samples {t, mean} every 50 ticks, keeping the last 120 points.
"""
from app.domain.constants import ARRIVAL_TOLERANCE_M
from app.engine.geo import next_node_index, last_node_at, position_along_path
from app.engine.pathfinding import effective_speed
from app.engine.congestion import run_congestion_pass
from app.engine.replanning import run_blockage_replans, run_congestion_replans
from app.engine.preemption import step_preemption
from app.engine import lifecycle


class Metrics:
    def __init__(self):
        self.replans = 0
        self.blockageReplans = 0
        self.congestionReplans = 0
        self.preemptionsGranted = 0
        self.conflictsResolved = 0
        self.missionsCompleted = 0
        self.unservedRequests = 0
        self.responseTimes = []
        self.efficiencySamples = []

    def as_dict(self):
        return {
            "replans": self.replans, "blockageReplans": self.blockageReplans,
            "congestionReplans": self.congestionReplans, "preemptionsGranted": self.preemptionsGranted,
            "conflictsResolved": self.conflictsResolved, "missionsCompleted": self.missionsCompleted,
            "unservedRequests": self.unservedRequests,
            "responseTimes": self.responseTimes[-200:], "efficiencySamples": self.efficiencySamples[-200:],
        }


class SimulationEngine:
    def __init__(self, store, settings, log_store):
        self.store = store
        self.settings = settings
        self.log_store = log_store
        self.metrics = Metrics()
        from app.engine.congestion import compute_ambient_baseline
        self.ambient = compute_ambient_baseline(store.network)
        self._base_speed = {"ambulance": 16.7, "firetruck": 13.9}

    def tick(self):
        store = self.store
        dt = 0.1 * store.speed
        store.simTime += dt
        store.tick += 1

        # 3. congestion, every 5 ticks
        if store.tick % 5 == 0:
            run_congestion_pass(store, self.ambient, self.settings, dt_since_last=dt * 5)
            if store.tick % 100 == 0:  # 20 sim-seconds at default speed/tick-rate
                self.log_store.log(store.simTime, "congestion", "info",
                                    "Congestion pass complete", data={"nodeCount": len(store.nodes)})

        # 4. move the fleet
        arrivals = []
        dwell_done = []
        for unit in list(store.units.values()):
            if unit.status == "on_scene" and unit.dwellRemaining > 0:
                remaining = unit.dwellRemaining - dt
                store.update_unit(unit.id, {"dwellRemaining": max(0.0, remaining)})
                if unit.missionId and unit.missionId in store.missions:
                    store.update_mission(unit.missionId, {"dwellRemaining": max(0.0, remaining)})
                if remaining <= 0:
                    dwell_done.append(unit.id)
                continue

            if not unit.route:
                continue

            route = unit.route
            ahead = route.path[next_node_index(route.nodeCumulative, route.travelled)]
            speed = effective_speed(self._base_speed[unit.type], store.nodes[ahead].congestion)
            limit = min(unit.blocked.stopAt, route.total) if unit.blocked else route.total
            new_travelled = min(route.travelled + speed * dt, limit)

            pos = position_along_path(route.coords, route.cumulative, new_travelled)
            node = last_node_at(route.path, route.nodeCumulative, new_travelled)

            route.travelled = new_travelled
            store.update_unit(unit.id, {
                "route": route, "pos": {"lat": pos["lat"], "lng": pos["lng"]},
                "heading": pos["heading"], "node": node,
            })

            if not unit.blocked and new_travelled >= route.total - ARRIVAL_TOLERANCE_M:
                arrivals.append(unit.id)

        # 5. commit congestionHistory sample, every 50 ticks, keep last 120
        if store.tick % 50 == 0:
            mean_c = sum(n.congestion for n in store.nodes.values()) / max(len(store.nodes), 1)
            store.congestionHistory.append({"t": store.simTime, "mean": mean_c})
            store.congestionHistory = store.congestionHistory[-120:]

        # 6. fire arrivals
        for uid in arrivals:
            unit = store.units[uid]
            mission_id_at_arrival = unit.missionId   # capture BEFORE on_leg_complete mutates the unit
            was_leg2 = bool(mission_id_at_arrival) and store.missions[mission_id_at_arrival].status == "transporting"
            lifecycle.on_leg_complete(store, self.settings, self.log_store, uid)
            if was_leg2:
                self.metrics.missionsCompleted += 1
            # §10 point 12: efficiency = freeFlowEta / actualLegDuration, capped at 1, per completed leg
            # use the captured mission id, not unit.missionId -- on_leg_complete clears it to None
            # on mission completion (transporting->completed), which would otherwise silently drop
            # metrics for every leg-2 (hospital drop-off) arrival.
            if mission_id_at_arrival and store.missions[mission_id_at_arrival].legs:
                last_leg = store.missions[mission_id_at_arrival].legs[-1]
                if last_leg.startedAt is not None:
                    duration = store.simTime - last_leg.startedAt
                    if duration > 0:
                        self.metrics.efficiencySamples.append(min(1.0, last_leg.freeFlowEta / duration))
                        self.metrics.responseTimes.append(duration)

        # 7. fire dwell-done
        for uid in dwell_done:
            lifecycle.on_dwell_complete(store, self.settings, self.log_store, uid)

        # 8. blockage replans, every tick
        replans_before = sum(u.replanCount for u in store.units.values())
        run_blockage_replans(store, self.settings, self.log_store)
        self.metrics.blockageReplans += sum(u.replanCount for u in store.units.values()) - replans_before
        self.metrics.replans = self.metrics.blockageReplans + self.metrics.congestionReplans

        # 9. congestion replans + refresh pending, every 10 ticks
        if store.tick % 10 == 0:
            replans_before2 = sum(u.replanCount for u in store.units.values())
            run_congestion_replans(store, self.settings, self.log_store)
            self.metrics.congestionReplans += sum(u.replanCount for u in store.units.values()) - replans_before2
            self.metrics.replans = self.metrics.blockageReplans + self.metrics.congestionReplans

            ready = lifecycle.refresh_pending_suggestions(store, self.settings, self.log_store)
            for mission_id in ready:
                lifecycle.approve_mission(store, self.settings, self.log_store, mission_id)

        # 10. preemption, every tick
        granted, conflicts = step_preemption(store, self.settings, self.log_store)
        self.metrics.preemptionsGranted += granted
        self.metrics.conflictsResolved += conflicts

    def step_seconds(self, seconds: float):
        ticks = max(1, round(seconds * 1000 / 100))
        for _ in range(ticks):
            self.tick()