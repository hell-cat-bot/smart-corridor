/**
 * The simulation clock.
 *
 * One tick-based loop drives everything that moves on the Operations map: unit
 * progress along mission legs, on-scene dwell timers, civilian traffic and the
 * congestion index it produces, replanning and signal preemption. The Green
 * Corridor demo runs on its own clock in corridor.js so it works in both local
 * and server modes.
 */

import useWorldStore, { nodeIndex } from '../store/useWorldStore';
import useSettingsStore from '../store/useSettingsStore';
import useCorridorStore from '../store/useCorridorStore';
import useLogStore, { logEvent } from '../store/useLogStore';
import {
  TICK_MS,
  UNIT_STATUS,
  MISSION_STATUS,
  LOG_CATEGORY,
  SEVERITY,
  FREE_FLOW_SPEED,
  LEG_TYPE,
} from '../domain/constants';
import { positionAlongPath, lastNodeAt, nextNodeAt } from '../utils/geo';
import { effectiveSpeed } from '../utils/pathfinding';
import {
  initCongestion,
  syncCivilianCount,
  stepCivilians,
  updateCongestion,
  getCivilians,
} from './congestion';
import { routingContext, remainingEta } from './routing';
import { runBlockageReplans, runCongestionReplans } from './replanning';
import { onLegComplete, onDwellComplete, refreshPendingSuggestions, resetMissionSequence } from './missions';
import { collectRequests, stepPreemption, lightsEqual } from './preemption';
import { stopCorridorSession } from './corridor';

let timer = null;
let tickCount = 0;
let initialised = false;

/* ---------------------------------------------------------------- lifecycle */

export function initWorld() {
  if (initialised) return;
  initialised = true;
  initCongestion();
  const nodes = useWorldStore.getState().nodes;
  if (nodes.length > 0 && useWorldStore.getState().congestionHistory.length === 0) {
    const mean = nodes.reduce((s, n) => s + n.congestion, 0) / nodes.length;
    useWorldStore.getState().patch({ congestionHistory: [{ t: 0, mean }] });
  }
  logEvent({
    category: LOG_CATEGORY.SIMULATION,
    severity: SEVERITY.INFO,
    simTime: 0,
    message: `World initialised — ${useWorldStore.getState().networkMeta?.area ?? 'road network'}, facilities and fleet seeded`,
    data: {
      network: useWorldStore.getState().networkMeta,
      junctions: useWorldStore.getState().nodes.length,
      segments: useWorldStore.getState().edges.length,
      units: useWorldStore.getState().units.length,
      facilities: useWorldStore.getState().facilities.length,
    },
  });
}

export function startSim() {
  if (timer) return;
  useWorldStore.getState().patch({ running: true });
  timer = setInterval(runTick, TICK_MS);
  logEvent({
    category: LOG_CATEGORY.SIMULATION,
    severity: SEVERITY.INFO,
    simTime: useWorldStore.getState().simTime,
    message: `Simulation running at ${useWorldStore.getState().speed}x`,
    data: { tickMs: TICK_MS },
  });
}

export function pauseSim() {
  if (timer) clearInterval(timer);
  timer = null;
  useWorldStore.getState().patch({ running: false });
  logEvent({
    category: LOG_CATEGORY.SIMULATION,
    severity: SEVERITY.INFO,
    simTime: useWorldStore.getState().simTime,
    message: 'Simulation paused',
    data: {},
  });
}

export function toggleSim() {
  if (useWorldStore.getState().running) pauseSim();
  else startSim();
}

export function setSpeed(speed) {
  useWorldStore.getState().patch({ speed });
}

/** Advance a fixed number of seconds while paused. */
export function stepSeconds(seconds = 1) {
  const steps = Math.round((seconds * 1000) / TICK_MS);
  for (let i = 0; i < steps; i += 1) runTick(true);
}

export function resetWorld() {
  pauseSim();
  stopCorridorSession();
  resetMissionSequence();
  useWorldStore.getState().reset();
  useLogStore.getState().clear();
  useCorridorStore.getState().reset();
  initialised = false;
  tickCount = 0;
  initWorld();
  logEvent({
    category: LOG_CATEGORY.SIMULATION,
    severity: SEVERITY.WARNING,
    simTime: 0,
    message: 'All system state reset to the seeded demo world',
    data: {},
  });
}

/* --------------------------------------------------------------- main tick */

function runTick(manual = false) {
  const world = useWorldStore.getState();
  const settings = useSettingsStore.getState();
  const dt = (TICK_MS / 1000) * (manual ? 1 : world.speed);

  tickCount += 1;
  const simTime = world.simTime + dt;

  /* ------------------------------------------------- civilians & congestion */
  const nodeMap = nodeIndex();
  const blocked = new Set(world.disasters.map((d) => d.node));
  syncCivilianCount();
  stepCivilians(dt, nodeMap, blocked);

  let nodes = world.nodes;
  if (tickCount % 5 === 0) {
    nodes = updateCongestion(world.nodes, blocked, simTime);
  }

  const congestion = {};
  for (const n of nodes) congestion[n.id] = n.congestion;

  /* --------------------------------------------------------- move the fleet */
  const arrivals = [];
  const dwellDone = [];

  const units = world.units.map((unit) => {
    if (unit.status === UNIT_STATUS.ON_SCENE && unit.dwellRemaining > 0) {
      const remaining = unit.dwellRemaining - dt;
      if (remaining <= 0) dwellDone.push(unit.id);
      return { ...unit, dwellRemaining: Math.max(0, remaining) };
    }

    if (!unit.route || unit.route.total <= 0) return unit;

    const base = FREE_FLOW_SPEED[unit.type] ?? FREE_FLOW_SPEED.ambulance;
    // The junction being entered sets the speed, so a congested junction slows
    // the approach to it rather than the road already behind the vehicle.
    const ahead = nextNodeAt(unit.route.path, unit.route.nodeCumulative, unit.route.travelled);
    const speed = effectiveSpeed(base, congestion[ahead]);

    // A held unit creeps up to its stop line and goes no further — it must not
    // drive through the junction that stranded it.
    const limit = unit.blocked ? Math.min(unit.blocked.stopAt, unit.route.total) : unit.route.total;
    const travelled = Math.min(unit.route.travelled + speed * dt, limit);

    const p = positionAlongPath(unit.route.coords, unit.route.cumulative, travelled);

    if (!unit.blocked && travelled >= unit.route.total - 0.25) arrivals.push(unit.id);

    return {
      ...unit,
      route: { ...unit.route, travelled },
      pos: p ? { lat: p.lat, lng: p.lng } : unit.pos,
      heading: p ? p.heading : unit.heading,
      node: lastNodeAt(unit.route.path, unit.route.nodeCumulative, travelled),
    };
  });

  let missionsChanged = false;
  const missions = world.missions.map((m) => {
    if (m.status === MISSION_STATUS.ON_SCENE && m.dwellRemaining > 0) {
      missionsChanged = true;
      return { ...m, dwellRemaining: Math.max(0, m.dwellRemaining - dt) };
    }
    return m;
  });

  /* ------------------------------------------------------------- congestion */
  const patch = { units, simTime, tick: tickCount };
  if (missionsChanged) patch.missions = missions;
  if (nodes !== world.nodes) patch.nodes = nodes;

  if (settings.showCivilians && tickCount % 2 === 0) {
    patch.civilians = getCivilians().map((c) => ({ id: c.id, pos: c.pos }));
  } else if (!settings.showCivilians && world.civilians.length > 0) {
    patch.civilians = [];
  }

  if (tickCount % 50 === 0) {
    const mean = nodes.reduce((s, n) => s + n.congestion, 0) / (nodes.length || 1);
    patch.congestionHistory = [...world.congestionHistory, { t: simTime, mean }].slice(-120);
  }

  useWorldStore.getState().patch(patch);

  /* ------------------------------------------------------- phase transitions */
  for (const unitId of arrivals) onLegComplete(unitId);
  for (const unitId of dwellDone) onDwellComplete(unitId);

  /* ------------------------------------------------------------- replanning */
  runBlockageReplans(simTime);
  if (tickCount % 10 === 0) {
    runCongestionReplans(simTime);
    refreshPendingSuggestions();
  }

  /* ------------------------------------------------------------- preemption */
  runPreemption(simTime, congestion, settings);
}

/* ------------------------------------------------------------- preemption */

function runPreemption(simTime, congestion, settings) {
  const store = useWorldStore.getState();
  const requests = collectRequests(store.units, congestion, simTime, settings.preemptRadius);
  const { lights, logs, granted, conflicts } = stepPreemption({
    lights: store.lights,
    requests,
    simTime,
    releaseDelay: settings.releaseDelay,
  });

  if (!lightsEqual(lights, store.lights)) {
    store.patch({ lights });
  }
  if (granted) store.bumpMetric('preemptionsGranted', granted);
  if (conflicts) store.bumpMetric('conflictsResolved', conflicts);
  for (const entry of logs) logEvent(entry);
}

/* --------------------------------------------------------------- selectors */

/** Leg-aware live ETA used by the mission panels. */
export function liveEta(unit) {
  if (!unit?.route) return null;
  return remainingEta(unit.route, routingContext(), unit.type);
}

export { LEG_TYPE };
