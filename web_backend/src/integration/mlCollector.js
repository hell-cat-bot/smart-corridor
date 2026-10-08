'use strict';

/**
 * The bridge between the simulation and the permanent record.
 *
 * This service opens its own WebSocket to ml_backend's `/ws` stream and writes
 * what it sees into the database: every mission becomes a row in `missions`,
 * every disaster becomes an `incidents` row, and clearing a disaster resolves
 * that incident.
 *
 * Why here and not in the browser: history should accrue whether or not anyone
 * has a tab open. A dispatcher who logs in tomorrow morning should see what the
 * system did overnight.
 *
 * Direction of dependency: this service reaches into ml_backend, never the
 * reverse. ml_backend does not know this one exists, so the simulation runs
 * perfectly well on its own and nothing here can break it.
 *
 * The WebSocket client is Node's own global `WebSocket` (Node 22+), so this
 * costs no extra dependency.
 */

const config = require('../config');
const missionService = require('../services/mission.service');
const incidentService = require('../services/incident.service');
const vehicleService = require('../services/vehicle.service');
const auditService = require('../services/audit.service');
const mapping = require('./mapping');

/** Everything the status endpoint reports. Plain object, read-only elsewhere. */
const state = {
  enabled: config.collector.enabled,
  status: config.collector.enabled ? 'idle' : 'disabled',
  url: null,
  connectedAt: null,
  lastEventAt: null,
  lastError: null,
  attempts: 0,
  counts: {
    messages: 0,
    missionsCreated: 0,
    missionsUpdated: 0,
    incidentsCreated: 0,
    incidentsResolved: 0,
    vehiclesRegistered: 0,
    errors: 0,
  },
};

let socket = null;
let reconnectTimer = null;
let stopped = false;

/** Node positions from the simulation, so an incident can be given coordinates. */
const nodeCoordinates = new Map();

/** http://host:8000 -> ws://host:8000/ws */
function streamUrl() {
  const base = config.mlBackendUrl.replace(/\/+$/, '');
  return `${base.replace(/^http/, 'ws')}/ws`;
}

function log(message, extra) {
  if (config.isTest) return;
  console.log(`[collector] ${message}${extra ? ` ${extra}` : ''}`);
}

/* ------------------------------------------------------------- bootstrapping */

/**
 * Pulls the current world once over HTTP before subscribing, so a restart does
 * not miss whatever is already in flight. Failures here are not fatal: the live
 * stream will fill the gap as soon as anything changes.
 */
async function loadSnapshot() {
  const base = config.mlBackendUrl.replace(/\/+$/, '');
  const response = await fetch(`${base}/api/world/snapshot`, {
    signal: AbortSignal.timeout(config.collector.requestTimeoutMs),
  });
  if (!response.ok) throw new Error(`snapshot returned HTTP ${response.status}`);

  const snapshot = await response.json();

  rememberNodes(snapshot.nodes);
  for (const unit of snapshot.units || []) registerVehicle(unit);
  for (const disaster of snapshot.disasters || []) recordDisaster(disaster);
  for (const mission of snapshot.missions || []) recordMission(mission);

  log(
    'snapshot loaded',
    `(${(snapshot.missions || []).length} missions, ${(snapshot.disasters || []).length} disasters)`,
  );
}

function rememberNodes(nodes) {
  for (const node of nodes || []) {
    if (node && node.id && typeof node.lat === 'number') {
      nodeCoordinates.set(node.id, { lat: node.lat, lng: node.lng });
    }
  }
}

/* ------------------------------------------------------------------ writers */

function registerVehicle(unit) {
  if (!config.collector.autoRegisterVehicles) return null;
  if (!unit || !unit.id) return null;
  try {
    const { vehicle, created } = vehicleService.ensureFromSim(mapping.vehicleFromSim(unit));
    if (created) {
      state.counts.vehiclesRegistered += 1;
      auditService.record({
        action: 'vehicle.auto_register',
        entity: 'vehicle',
        entityId: vehicle.id,
        details: { simUnitId: unit.id },
      });
    }
    return vehicle;
  } catch (err) {
    noteError('registerVehicle', err);
    return null;
  }
}

function recordDisaster(disaster) {
  if (!disaster || !disaster.id) return;
  try {
    const record = mapping.incidentFromSim(disaster, {
      observedAt: new Date().toISOString(),
      node: nodeCoordinates.get(disaster.node) || null,
    });
    const { incident, created } = incidentService.upsertFromSim(record);
    if (created) {
      state.counts.incidentsCreated += 1;
      auditService.record({
        action: 'incident.from_sim',
        entity: 'incident',
        entityId: incident.id,
        details: { simDisasterId: disaster.id, node: disaster.node },
      });
    }
  } catch (err) {
    noteError('recordDisaster', err);
  }
}

function clearDisaster(simDisasterId) {
  if (!simDisasterId) return;
  try {
    const incident = incidentService.resolveBySimId(simDisasterId);
    if (incident) {
      state.counts.incidentsResolved += 1;
      auditService.record({
        action: 'incident.resolved_by_sim',
        entity: 'incident',
        entityId: incident.id,
        details: { simDisasterId },
      });
    }
  } catch (err) {
    noteError('clearDisaster', err);
  }
}

/**
 * Resolves the foreign keys this service can work out, then stores the mission.
 * A link that cannot be resolved is left null rather than guessed at.
 */
function recordMission(mission) {
  if (!mission || !mission.id) return;
  try {
    const links = {};

    if (mission.unitId) {
      const vehicle =
        vehicleService.findBySimUnitId(mission.unitId) ||
        registerVehicle({ id: mission.unitId, type: serviceToUnitType(mission.service) });
      if (vehicle) links.vehicleId = vehicle.id;
    }

    if (mission.sourceDisasterId) {
      const incident = incidentService.findBySimId(mission.sourceDisasterId);
      if (incident) links.incidentId = incident.id;
    }

    const record = mapping.missionFromSim(mission, {
      observedAt: new Date().toISOString(),
      links,
    });

    const { mission: stored, created } = missionService.upsertFromSim(record);
    if (created) {
      state.counts.missionsCreated += 1;
      auditService.record({
        action: 'mission.from_sim',
        entity: 'mission',
        entityId: stored.id,
        details: { simMissionId: mission.id, status: record.status },
      });
    } else {
      state.counts.missionsUpdated += 1;
    }
  } catch (err) {
    noteError('recordMission', err);
  }
}

function serviceToUnitType(service) {
  return service === 'fire' ? 'firetruck' : 'ambulance';
}

function noteError(where, err) {
  state.counts.errors += 1;
  state.lastError = `${where}: ${err.message}`;
  if (!config.isTest) console.error(`[collector] ${where} failed:`, err.message);
}

/* ----------------------------------------------------------- message router */

/**
 * Handles one frame from the stream. Exported so the integration test can drive
 * it directly, and so an unknown message type is provably a no-op rather than a
 * crash.
 */
function handleMessage(raw) {
  let message;
  try {
    message = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    noteError('parse', new Error('message was not valid JSON'));
    return;
  }
  if (!message || typeof message.type !== 'string') return;

  state.counts.messages += 1;
  state.lastEventAt = new Date().toISOString();

  switch (message.type) {
    case 'tick':
      // Ticks are movement, ~10 per second. Nothing here is worth a database
      // write; only the node coordinates are kept, to place incidents on a map.
      rememberNodes(message.nodes);
      break;

    case 'mission.created':
    case 'mission.updated':
      recordMission(message.mission);
      break;

    case 'disaster.created':
      recordDisaster(message.disaster);
      break;

    case 'disaster.cleared':
      clearDisaster(message.disasterId);
      break;

    default:
      // unit.route, log, metrics and anything added later: not history, ignored.
      break;
  }
}

/* -------------------------------------------------------------- connection */

function scheduleReconnect() {
  if (stopped || reconnectTimer) return;

  // Back off gently, capped, so a backend that is simply not running yet does
  // not turn into a busy loop.
  const delay = Math.min(
    config.collector.reconnectBaseMs * 2 ** Math.min(state.attempts, 5),
    config.collector.reconnectMaxMs,
  );
  state.status = 'reconnecting';
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
  if (reconnectTimer.unref) reconnectTimer.unref();
}

function connect() {
  if (stopped || socket) return;

  const url = streamUrl();
  state.url = url;
  state.attempts += 1;
  state.status = 'connecting';

  // The snapshot is best-effort: a failure must not stop the subscription.
  loadSnapshot().catch((err) => {
    state.lastError = `snapshot: ${err.message}`;
  });

  let ws;
  try {
    ws = new WebSocket(url);
  } catch (err) {
    state.lastError = err.message;
    scheduleReconnect();
    return;
  }
  socket = ws;

  ws.addEventListener('open', () => {
    state.status = 'connected';
    state.connectedAt = new Date().toISOString();
    state.attempts = 0;
    state.lastError = null;
    log('connected to', url);
  });

  ws.addEventListener('message', (event) => handleMessage(event.data));

  ws.addEventListener('error', () => {
    // 'error' is always followed by 'close', which is where reconnecting happens.
    state.lastError = `could not reach ${url}`;
  });

  ws.addEventListener('close', () => {
    if (socket === ws) socket = null;
    if (stopped) {
      state.status = 'stopped';
      return;
    }
    state.status = 'disconnected';
    state.connectedAt = null;
    scheduleReconnect();
  });
}

function start() {
  if (!config.collector.enabled) {
    log('disabled by configuration');
    return;
  }
  if (typeof WebSocket === 'undefined') {
    state.status = 'unsupported';
    state.lastError = 'this Node build has no global WebSocket (Node 22+ required)';
    console.error('[collector] disabled:', state.lastError);
    return;
  }
  stopped = false;
  connect();
}

function stop() {
  stopped = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (socket) {
    try { socket.close(); } catch { /* already closing */ }
    socket = null;
  }
  state.status = config.collector.enabled ? 'stopped' : 'disabled';
}

/** A copy, so nothing outside this module can mutate the collector's state. */
function getState() {
  return { ...state, counts: { ...state.counts } };
}

module.exports = { start, stop, getState, handleMessage, streamUrl };
