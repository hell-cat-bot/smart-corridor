/**
 * Green Corridor session — the signal-preemption theatre.
 *
 * Paths are calculated once at session start and then frozen. What the session
 * demonstrates is approach-threshold preemption and junction arbitration when
 * two emergency vehicles want the same light: continuous global replanning and
 * disaster injection stay in the Operations view.
 */

import useWorldStore from '../store/useWorldStore';
import useCorridorStore from '../store/useCorridorStore';
import useSettingsStore from '../store/useSettingsStore';
import { logEvent } from '../store/useLogStore';
import {
  LIGHT_STATE,
  LOG_CATEGORY,
  SEVERITY,
  UNIT_TYPE,
  FREE_FLOW_SPEED,
  TICK_MS,
} from '../domain/constants';
import { measurePath, positionAlongPath } from '../utils/geo';
import { planLeg, routingContext, freeFlowEta } from './routing';
import { arbitrate } from './preemption';

/**
 * Distance from a junction at which a vehicle that has not been given the green
 * comes to a stop — the stop line, effectively. Held vehicles queue here until
 * the junction is released to them.
 */
const STOP_DISTANCE = 55;

let vehicles = [];
let lights = {};
let elapsed = 0;
/** Own clock so corridor keeps moving in server mode (world clock is remote). */
let corridorTimer = null;

export function corridorIsActive() {
  return useCorridorStore.getState().active;
}

function startCorridorClock() {
  if (corridorTimer) return;
  corridorTimer = setInterval(() => {
    const world = useWorldStore.getState();
    const dt = (TICK_MS / 1000) * (world.speed || 1);
    stepCorridor(dt, world.simTime);
  }, TICK_MS);
}

function stopCorridorClock() {
  if (corridorTimer) clearInterval(corridorTimer);
  corridorTimer = null;
}

/**
 * Start a session.
 * @param {Array} requests [{ label, type, priority, from, to }]
 */
export function startCorridorSession(requests) {
  const ctx = routingContext();
  const { signalCycle } = useSettingsStore.getState();

  vehicles = [];
  lights = {};
  elapsed = 0;

  const lightNodes = new Set();

  requests.forEach((req, i) => {
    // An explicit path is honoured as-is (used by the scripted conflict demo);
    // otherwise the path is planned once here and then frozen for the session.
    const plan = req.path
      ? { path: req.path }
      : planLeg({ from: req.from, to: req.to, unitType: req.type, ctx });
    if (!plan) return;
    const { coords, cumulative, nodeCumulative, total } = measurePath(plan.path, ctx);

    vehicles.push({
      id: req.id || `EV-${i + 1}`,
      label: req.label || `EV ${i + 1}`,
      type: req.type,
      priority: req.priority ?? (req.type === UNIT_TYPE.AMBULANCE ? 1 : 2),
      path: plan.path,
      coords,
      cumulative,
      nodeCumulative,
      total,
      travelled: 0,
      pos: { lat: coords[0]?.[0], lng: coords[0]?.[1] },
      heading: 0,
      state: 'moving',
      holdingAt: null,
      holdTime: 0,
      granted: [],
      startedAt: 0,
      arrivedAt: null,
      freeFlowEta: freeFlowEta(plan.path, ctx, req.type),
      distanceTotal: total,
    });

    // Every junction on the path except the origin carries a signal.
    plan.path.slice(1).forEach((nodeId) => lightNodes.add(nodeId));
  });

  if (vehicles.length === 0) {
    vehicles = [];
    lights = {};
    elapsed = 0;
    return 0;
  }

  let offsetSeed = 0;
  for (const nodeId of lightNodes) {
    offsetSeed += 1;
    lights[nodeId] = {
      nodeId,
      state: LIGHT_STATE.NORMAL_RED,
      servingVehicleId: null,
      since: 0,
      releaseAt: null,
      contested: false,
      queue: [],
      cycleOffset: (offsetSeed * 3.7) % signalCycle,
    };
  }

  useCorridorStore.getState().reset();
  useCorridorStore.getState().patch({
    active: true,
    startedAt: useWorldStore.getState().simTime,
    vehicles: vehicles.map(snapshotVehicle),
    lights: { ...lights },
    elapsed: 0,
    finished: false,
  });

  startCorridorClock();

  logEvent({
    category: LOG_CATEGORY.SIGNAL,
    severity: SEVERITY.INFO,
    simTime: useWorldStore.getState().simTime,
    message: `Green Corridor session started — ${vehicles.length} vehicle(s), ${lightNodes.size} signalised junction(s)`,
    data: {
      vehicles: vehicles.map((v) => ({
        id: v.id,
        priorityClass: v.priority,
        pathNodes: v.path.length,
        distanceMeters: Math.round(v.total),
      })),
      frozenPaths: true,
    },
  });

  return vehicles.length;
}

export function stopCorridorSession() {
  stopCorridorClock();
  vehicles = [];
  lights = {};
  elapsed = 0;
  useCorridorStore.getState().reset();
}

function snapshotVehicle(v) {
  return {
    id: v.id,
    label: v.label,
    type: v.type,
    priority: v.priority,
    path: v.path,
    coords: v.coords,
    travelled: v.travelled,
    total: v.total,
    pos: v.pos,
    heading: v.heading,
    state: v.state,
    holdingAt: v.holdingAt,
    holdTime: v.holdTime,
    granted: v.granted,
    arrivedAt: v.arrivedAt,
    freeFlowEta: v.freeFlowEta,
  };
}

/** The next signalised node ahead of this vehicle, if any. */
function nextLightNode(vehicle) {
  for (let i = 0; i < vehicle.path.length; i += 1) {
    const nodeId = vehicle.path[i];
    if (!lights[nodeId]) continue;
    const d = vehicle.nodeCumulative[i] - vehicle.travelled;
    if (d >= -2) return { nodeId, distance: Math.max(d, 0) };
  }
  return null;
}

/**
 * Every signalised junction ahead of the vehicle inside the approach radius.
 * A green wave clears a run of junctions, not only the very next one — which is
 * also what makes two vehicles contend for the same junction before either of
 * them reaches it.
 */
function lightsAhead(vehicle, radius) {
  const out = [];
  for (let i = 0; i < vehicle.path.length; i += 1) {
    const nodeId = vehicle.path[i];
    if (!lights[nodeId]) continue;
    const d = vehicle.nodeCumulative[i] - vehicle.travelled;
    if (d < -2) continue;
    if (d > radius) break;
    out.push({ nodeId, distance: Math.max(d, 0) });
  }
  return out;
}

/**
 * Advance the corridor session by dt simulation seconds.
 * Called from the single simulation clock so both views share one time base.
 */
export function stepCorridor(dt, simTime) {
  const store = useCorridorStore.getState();
  if (!store.active || vehicles.length === 0) return;

  const settings = useSettingsStore.getState();
  const world = useWorldStore.getState();
  const congestion = {};
  for (const n of world.nodes) congestion[n.id] = n.congestion;

  elapsed += dt;

  /* ------------------------------------------------- gather green requests */
  const requestsByNode = {};
  for (const v of vehicles) {
    if (v.state === 'arrived') continue;

    for (const ahead of lightsAhead(v, settings.preemptRadius)) {
      const speed = FREE_FLOW_SPEED[v.type] ?? FREE_FLOW_SPEED.ambulance;
      const eta = ahead.distance / speed;
      const light = lights[ahead.nodeId];

      if (!requestsByNode[ahead.nodeId]) requestsByNode[ahead.nodeId] = [];
      requestsByNode[ahead.nodeId].push({
        nodeId: ahead.nodeId,
        unitId: v.id,
        unitLabel: v.label,
        priority: v.priority,
        distance: ahead.distance,
        eta,
        requestedAt: light.requestSeen?.[v.id] ?? elapsed,
      });

      light.requestSeen = light.requestSeen || {};
      if (light.requestSeen[v.id] === undefined) {
        light.requestSeen[v.id] = elapsed;
        store.pushEvent({
          t: elapsed,
          kind: 'request',
          nodeId: ahead.nodeId,
          vehicleId: v.id,
          detail: `${v.label} requests green ${Math.round(ahead.distance)} m out`,
        });
        store.bumpStat('requests');
      }
    }
  }

  /* ------------------------------------------------------ resolve each light */
  for (const [nodeId, light] of Object.entries(lights)) {
    const list = requestsByNode[nodeId];

    if (!list || list.length === 0) {
      // No demand: release if we were preempted, otherwise run the normal cycle.
      if (light.state === LIGHT_STATE.PREEMPT_GREEN) {
        light.state = LIGHT_STATE.RELEASING;
        light.releaseAt = elapsed + settings.releaseDelay;
        store.pushEvent({
          t: elapsed,
          kind: 'release',
          nodeId,
          vehicleId: light.servingVehicleId,
          detail: `${nodeId} releasing after ${(elapsed - light.since).toFixed(1)}s hold`,
        });
        store.bumpStat('releases');
        logEvent({
          category: LOG_CATEGORY.SIGNAL,
          severity: SEVERITY.INFO,
          simTime,
          message: `Corridor junction ${nodeId} released to normal cycle`,
          refs: { nodeId, unitId: light.servingVehicleId },
          data: { heldForSeconds: Number((elapsed - light.since).toFixed(1)) },
        });
      } else if (light.state === LIGHT_STATE.RELEASING && elapsed >= (light.releaseAt ?? 0)) {
        light.state = normalPhase(light, settings.signalCycle);
        light.servingVehicleId = null;
        light.contested = false;
        light.queue = [];
        light.requestSeen = {};
      } else if (light.state !== LIGHT_STATE.RELEASING) {
        light.state = normalPhase(light, settings.signalCycle);
        light.servingVehicleId = null;
        light.contested = false;
        light.queue = [];
        light.requestSeen = {};
      }
      continue;
    }

    const { winner, losers, reason } = arbitrate(list);
    const changedWinner = light.servingVehicleId !== winner.unitId;

    if (changedWinner || light.state !== LIGHT_STATE.PREEMPT_GREEN) {
      light.state = LIGHT_STATE.PREEMPT_GREEN;
      light.servingVehicleId = winner.unitId;
      light.since = elapsed;
      light.releaseAt = null;
      store.pushEvent({
        t: elapsed,
        kind: 'grant',
        nodeId,
        vehicleId: winner.unitId,
        detail: `${winner.unitLabel} granted green at ${nodeId}`,
      });
      store.bumpStat('grants');
      logEvent({
        category: LOG_CATEGORY.SIGNAL,
        severity: SEVERITY.SUCCESS,
        simTime,
        message: `Corridor green granted at ${nodeId} for ${winner.unitLabel}`,
        refs: { nodeId, unitId: winner.unitId },
        data: {
          approachDistanceMeters: Math.round(winner.distance),
          etaSeconds: Number(winner.eta.toFixed(1)),
          priorityClass: winner.priority,
        },
      });
      const vehicle = vehicles.find((v) => v.id === winner.unitId);
      if (vehicle && !vehicle.granted.includes(nodeId)) vehicle.granted.push(nodeId);
    }

    light.contested = losers.length > 0;
    light.queue = losers.map((l) => l.unitId);

    // Record the contest whenever the set of contenders changes, not only when
    // the winner flips — otherwise a late arrival that loses is never logged.
    const contestKey = list
      .map((r) => r.unitId)
      .sort()
      .join('|');
    const newContest = losers.length > 0 && light.lastContestKey !== contestKey;
    light.lastContestKey = losers.length > 0 ? contestKey : null;

    if (newContest) {
      store.pushConflict({
        t: elapsed,
        nodeId,
        winner: winner.unitId,
        losers: losers.map((l) => l.unitId),
        reason,
        contenders: list.map((r) => ({
          unit: r.unitId,
          priorityClass: r.priority,
          eta: Number(r.eta.toFixed(2)),
          requestedAt: Number(r.requestedAt.toFixed(2)),
        })),
      });
      logEvent({
        category: LOG_CATEGORY.CONFLICT,
        severity: SEVERITY.WARNING,
        simTime,
        message: `Corridor junction ${nodeId} contested — ${winner.unitLabel} granted (${reason})`,
        refs: { nodeId, unitId: winner.unitId },
        data: {
          decisionRule: 'priority class -> ETA to junction -> request order -> vehicle id',
          reason,
          granted: winner.unitId,
          held: losers.map((l) => l.unitId),
          contenders: list.map((r) => ({
            unit: r.unitId,
            priorityClass: r.priority,
            etaSeconds: Number(r.eta.toFixed(2)),
          })),
        },
      });
    }
  }

  /* ------------------------------------------------------------- move them */
  let allArrived = true;
  for (const v of vehicles) {
    if (v.state === 'arrived') continue;
    allArrived = false;

    const ahead = nextLightNode(v);
    let blockedHere = false;

    if (ahead && ahead.distance <= STOP_DISTANCE) {
      const light = lights[ahead.nodeId];
      const greenForMe =
        light &&
        ((light.state === LIGHT_STATE.PREEMPT_GREEN && light.servingVehicleId === v.id) ||
          light.state === LIGHT_STATE.NORMAL_GREEN ||
          light.state === LIGHT_STATE.RELEASING);
      if (!greenForMe) blockedHere = true;
    }

    if (blockedHere) {
      if (v.state !== 'holding') {
        v.state = 'holding';
        v.holdingAt = ahead.nodeId;
        store.pushEvent({
          t: elapsed,
          kind: 'hold',
          nodeId: ahead.nodeId,
          vehicleId: v.id,
          detail: `${v.label} holding at ${ahead.nodeId}`,
        });
      }
      v.holdTime += dt;
      store.bumpStat('holdSeconds', dt);
      continue;
    }

    v.state = 'moving';
    v.holdingAt = null;

    const base = FREE_FLOW_SPEED[v.type] ?? FREE_FLOW_SPEED.ambulance;
    v.travelled = Math.min(v.travelled + base * dt, v.total);

    const p = positionAlongPath(v.coords, v.cumulative, v.travelled);
    if (p) {
      v.pos = { lat: p.lat, lng: p.lng };
      v.heading = p.heading;
    }

    if (v.travelled >= v.total - 0.5) {
      v.state = 'arrived';
      v.arrivedAt = elapsed;
      store.pushEvent({
        t: elapsed,
        kind: 'arrive',
        nodeId: v.path[v.path.length - 1],
        vehicleId: v.id,
        detail: `${v.label} completed the corridor in ${elapsed.toFixed(1)}s`,
      });
      logEvent({
        category: LOG_CATEGORY.SIGNAL,
        severity: SEVERITY.SUCCESS,
        simTime,
        message: `${v.label} cleared the corridor in ${elapsed.toFixed(1)}s (${v.granted.length} junction(s) preempted, held ${v.holdTime.toFixed(1)}s)`,
        refs: { unitId: v.id },
        data: {
          corridorSeconds: Number(elapsed.toFixed(1)),
          freeFlowSeconds: Number(v.freeFlowEta.toFixed(1)),
          preemptedJunctions: v.granted,
          heldSeconds: Number(v.holdTime.toFixed(1)),
        },
      });
    }
  }

  useCorridorStore.getState().patch({
    vehicles: vehicles.map(snapshotVehicle),
    lights: { ...lights },
    elapsed,
    finished: allArrived,
  });

  if (allArrived) stopCorridorClock();
}

/** Background signal cycle when no emergency vehicle is asking for the junction. */
function normalPhase(light, cycle) {
  const phase = (elapsed + light.cycleOffset) % Math.max(cycle, 4);
  return phase < cycle / 2 ? LIGHT_STATE.NORMAL_GREEN : LIGHT_STATE.NORMAL_RED;
}
