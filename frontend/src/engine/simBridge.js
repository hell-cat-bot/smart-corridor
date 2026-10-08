/**
 * The live link to ml_backend.
 *
 * When the console is in `server` mode this module, rather than the browser's
 * own engine, is what fills the world store. Everything downstream — the map,
 * the mission queue, the corridor view, analytics — keeps reading the same
 * store and never learns where the numbers came from.
 *
 * The sequence on connect is deliberate:
 *
 *   1. GET /api/network   the road graph: junctions, segments with real road
 *                         geometry, facilities. Static, fetched once.
 *   2. GET /api/world/snapshot   the current state of everything that moves.
 *   3. open /ws           deltas from here on.
 *
 * The snapshot before the socket is what makes a reconnect safe: the stream
 * carries no history, so after a drop the world is re-read in full rather than
 * left with whatever it happened to hold.
 */

import useWorldStore from '../store/useWorldStore';
import useLogStore from '../store/useLogStore';
import useSettingsStore from '../store/useSettingsStore';
import useConnectionStore from '../store/useConnectionStore';
import { buildEdgeIndex } from '../data/network';
import { FACILITY_TYPE } from '../domain/constants';
import { SIM_WS_URL } from '../lib/config';
import sim from '../lib/simClient';

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 15000;

let socket = null;
let reconnectTimer = null;
let stopped = true;
let attempt = 0;
/** Fetched once per connection; the road graph does not change while running. */
let networkLoaded = false;

/* ------------------------------------------------------------------ helpers */

/**
 * ml_backend serialises `Leg.from` as `from_`, because the Python field is
 * named `from_` to avoid the reserved word and is dumped by field name rather
 * than by alias. The rest of the app expects `from`, per the shared contract,
 * so legs are normalised here at the boundary — one place, rather than a
 * `leg.from ?? leg.from_` scattered through the views.
 */
function normaliseMission(mission) {
  if (!mission) return mission;
  const legs = Array.isArray(mission.legs)
    ? mission.legs.map((leg) =>
        leg && leg.from === undefined && leg.from_ !== undefined ? { ...leg, from: leg.from_ } : leg,
      )
    : mission.legs;
  const photo = mission.photoUri || mission.photoData || null;
  return {
    ...mission,
    legs,
    photoUri: photo,
    photoData: photo,
  };
}

/**
 * The map needs a centre, and `/api/network` returns only `meta` — the curated
 * `center` at the top of network.json is not exposed.
 *
 * The bounding box in `meta` is the better source when it is there: the middle
 * of the mapped area. Averaging node positions instead pulls the centre towards
 * wherever junctions happen to be dense, which is usually the city centre but
 * need not be.
 */
function deriveCentre(nodes, meta) {
  const bbox = meta && meta.bbox;
  if (bbox && typeof bbox.north === 'number' && typeof bbox.west === 'number') {
    return { lat: (bbox.north + bbox.south) / 2, lng: (bbox.east + bbox.west) / 2 };
  }
  if (!nodes.length) return { lat: 28.6614, lng: 77.4246 };
  const sum = nodes.reduce((acc, n) => ({ lat: acc.lat + n.lat, lng: acc.lng + n.lng }), { lat: 0, lng: 0 });
  return { lat: sum.lat / nodes.length, lng: sum.lng / nodes.length };
}

function upsertById(list, item) {
  const index = list.findIndex((entry) => entry.id === item.id);
  if (index === -1) return [item, ...list];
  const next = list.slice();
  next[index] = { ...next[index], ...item };
  return next;
}

/* --------------------------------------------------------------- hydration */

/**
 * Replaces the browser's seeded road network with the server's.
 *
 * This matters: the two services ship different network.json files, so junction
 * ids from the server would mean nothing against the locally seeded graph. In
 * server mode the server's graph is the only one used.
 */
async function loadNetwork() {
  const network = await sim.network();
  const nodes = (network.nodes || []).map((n) => ({
    id: n.id,
    lat: n.lat,
    lng: n.lng,
    name: n.name,
    degree: n.degree ?? 2,
    status: 'normal',
    congestion: 0,
    rawDensity: 0,
    facilityId: null,
  }));

  const facilities = (network.facilities || []).map((f) => ({
    ...f,
    type: f.type === 'fire_station' ? FACILITY_TYPE.FIRE_STATION : FACILITY_TYPE.HOSPITAL,
  }));

  // Junctions that host a facility are drawn differently, so the link the local
  // seed used to make is rebuilt here.
  const facilityByNode = new Map(facilities.map((f) => [f.node, f.id]));
  for (const node of nodes) node.facilityId = facilityByNode.get(node.id) ?? null;

  const edges = network.edges || [];
  const meta = network.meta || {};

  useWorldStore.getState().patch({
    nodes,
    edges,
    edgeIndex: buildEdgeIndex(edges),
    facilities,
    networkMeta: { ...meta, source: 'ml_backend' },
    isPlaceholderNetwork: Boolean(meta.placeholder),
    center: meta.center || deriveCentre(nodes, meta),
    zoom: meta.zoom ?? 14,
  });

  networkLoaded = true;
}

/** Replaces everything that moves with the server's current truth. */
async function loadSnapshot() {
  const snapshot = await sim.snapshot();
  const world = useWorldStore.getState();

  // Congestion and status ride on the snapshot's nodes; the coordinates and
  // names come from the network fetch, so the two are merged by id.
  const byId = new Map(world.nodes.map((n) => [n.id, n]));
  const nodes = (snapshot.nodes || []).map((n) => ({ ...(byId.get(n.id) || {}), ...n }));

  // Existing missions by id to preserve rich client metadata (photoUri, photoData, mlAssessment, note, etc.)
  const existingMissionsById = new Map(world.missions.map((m) => [m.id, m]));
  const incomingMissions = (snapshot.missions || []).map(normaliseMission);
  const incomingIds = new Set(incomingMissions.map((m) => m.id));

  const mergedSnapshotMissions = incomingMissions.map((incoming) => {
    const existing = existingMissionsById.get(incoming.id);
    if (!existing) return incoming;
    const photo = incoming.photoUri || incoming.photoData || existing.photoUri || existing.photoData || null;
    return {
      ...existing,
      ...incoming,
      photoUri: photo,
      photoData: photo,
      mlAssessment: incoming.mlAssessment || existing.mlAssessment || null,
      note: incoming.note || existing.note || '',
      isCitizenReport: incoming.isCitizenReport ?? existing.isCitizenReport ?? false,
      citizenReportId: incoming.citizenReportId || existing.citizenReportId || null,
      emergencyLabel: incoming.emergencyLabel || existing.emergencyLabel || '',
      sceneName: incoming.sceneName || existing.sceneName || null,
    };
  });

  // Preserve local/pending citizen missions that are awaiting dispatch or not yet acknowledged in server snapshot
  const preservedMissions = world.missions.filter((m) => !incomingIds.has(m.id));
  const finalMissions = [...mergedSnapshotMissions, ...preservedMissions];

  world.patch({
    nodes: nodes.length ? nodes : world.nodes,
    units: snapshot.units || [],
    missions: finalMissions,
    disasters: snapshot.disasters || [],
    lights: snapshot.lights || {},
    simTime: snapshot.simTime ?? 0,
    tick: snapshot.tick ?? 0,
    running: Boolean(snapshot.running),
    speed: snapshot.speed ?? 1,
    congestionHistory: snapshot.congestionHistory || [],
    metrics: { ...world.metrics, ...(snapshot.metrics || {}) },
  });
}

/* ------------------------------------------------------------ message types */

/**
 * A tick carries only what moves, so it is merged into what is already held
 * rather than replacing it. In particular a unit's tick has just
 * `route.travelled`, not the whole route — the full route arrives separately as
 * a `unit.route` event whenever it actually changes.
 */
function applyTick(message) {
  const world = useWorldStore.getState();

  const incoming = new Map((message.units || []).map((u) => [u.id, u]));
  const units = world.units.map((unit) => {
    const update = incoming.get(unit.id);
    if (!update) return unit;
    return {
      ...unit,
      pos: update.pos ?? unit.pos,
      heading: update.heading ?? unit.heading,
      node: update.node ?? unit.node,
      status: update.status ?? unit.status,
      dwellRemaining: update.dwellRemaining ?? unit.dwellRemaining,
      blocked: update.blocked ?? null,
      route:
        update.route && unit.route
          ? { ...unit.route, travelled: update.route.travelled }
          : update.route === null
            ? null
            : unit.route,
    };
  });

  // A unit the browser has never seen (the server restarted, say) is added
  // whole rather than dropped.
  for (const [id, update] of incoming) {
    if (!units.some((u) => u.id === id)) units.push(update);
  }

  const patch = { units, simTime: message.simTime ?? world.simTime, tick: message.tick ?? world.tick };

  if (Array.isArray(message.nodes) && message.nodes.length) {
    const changes = new Map(message.nodes.map((n) => [n.id, n]));
    let anyChanged = false;
    for (const node of world.nodes) {
      const change = changes.get(node.id);
      if (change && (Math.abs((node.congestion || 0) - (change.congestion || 0)) > 0.02 || node.status !== change.status)) {
        anyChanged = true;
        break;
      }
    }
    if (anyChanged) {
      patch.nodes = world.nodes.map((node) => {
        const change = changes.get(node.id);
        return change ? { ...node, congestion: change.congestion, status: change.status } : node;
      });
    }
  }

  if (message.lights) patch.lights = message.lights;

  useWorldStore.getState().patch(patch);
}

function applyRouteChange(message) {
  useWorldStore.getState().updateUnit(message.unitId, { route: message.route ?? null });
}

function applyMission(message) {
  const mission = normaliseMission(message.mission);
  if (!mission || !mission.id) return;
  useWorldStore.setState((state) => {
    const existing = state.missions.find((m) => m.id === mission.id);
    const photo = mission.photoUri || mission.photoData || existing?.photoUri || existing?.photoData || null;
    const merged = existing
      ? {
          ...existing,
          ...mission,
          photoUri: photo,
          photoData: photo,
          mlAssessment: mission.mlAssessment || existing.mlAssessment || null,
          note: mission.note || existing.note || '',
          isCitizenReport: mission.isCitizenReport ?? existing.isCitizenReport ?? false,
          citizenReportId: mission.citizenReportId || existing.citizenReportId || null,
          emergencyLabel: mission.emergencyLabel || existing.emergencyLabel || '',
          sceneName: mission.sceneName || existing.sceneName || null,
        }
      : mission;
    return { missions: upsertById(state.missions, merged) };
  });
}

function applyDisasterCreated(message) {
  const disaster = message.disaster;
  if (!disaster || !disaster.id) return;
  useWorldStore.setState((state) => ({ disasters: upsertById(state.disasters, disaster) }));
  // The junction is impassable, and the map reads that from the node, not the
  // disaster list.
  useWorldStore.getState().setNodeStatus(disaster.node, 'blocked');
}

function applyDisasterCleared(message) {
  const world = useWorldStore.getState();
  const disaster = world.disasters.find((d) => d.id === message.disasterId);
  world.removeDisaster(message.disasterId);
  if (disaster) world.setNodeStatus(disaster.node, 'normal');
}

function applyLogs(message) {
  useLogStore.getState().ingest(message.entries || []);
}

function applyMetrics(message) {
  const { congestionHistory, ...rest } = message.metrics || {};
  useWorldStore.getState().patchMetrics(rest);
  if (Array.isArray(congestionHistory) && congestionHistory.length > 0) {
    useWorldStore.getState().patch({ congestionHistory });
  }
}

function handleMessage(raw) {
  let message;
  try {
    message = JSON.parse(raw);
  } catch {
    return;
  }
  if (!message || typeof message.type !== 'string') return;

  useConnectionStore.getState().noteMessage();

  switch (message.type) {
    case 'tick':
      applyTick(message);
      break;
    case 'unit.route':
      applyRouteChange(message);
      break;
    case 'mission.created':
    case 'mission.updated':
      applyMission(message);
      break;
    case 'disaster.created':
      applyDisasterCreated(message);
      break;
    case 'disaster.cleared':
      applyDisasterCleared(message);
      break;
    case 'log':
      applyLogs(message);
      break;
    case 'metrics':
      applyMetrics(message);
      break;
    default:
      // Anything the backend adds later is ignored rather than fatal.
      break;
  }
}

/* -------------------------------------------------------------- connection */

function scheduleReconnect() {
  if (stopped || reconnectTimer) return;
  const delay = Math.min(RECONNECT_BASE_MS * 2 ** Math.min(attempt, 4), RECONNECT_MAX_MS);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    openSocket();
  }, delay);
}

function openSocket() {
  if (stopped || socket) return;

  const connection = useConnectionStore.getState();
  attempt += 1;
  connection.noteAttempt();
  connection.setStatus('connecting');

  let ws;
  try {
    ws = new WebSocket(SIM_WS_URL);
  } catch (err) {
    connection.setStatus('error', err.message);
    scheduleReconnect();
    return;
  }
  socket = ws;

  ws.onopen = () => {
    attempt = 0;
    useConnectionStore.getState().setStatus('connected');
  };

  ws.onmessage = (event) => handleMessage(event.data);

  ws.onerror = () => {
    // Always followed by onclose, which is where reconnecting is handled.
    useConnectionStore.getState().setStatus('error', `Cannot reach ${SIM_WS_URL}`);
  };

  ws.onclose = () => {
    if (socket === ws) socket = null;
    if (stopped) return;
    useConnectionStore.getState().setStatus('disconnected');
    // The stream replays nothing, so the world is re-read before resubscribing.
    hydrate().catch(() => {});
    scheduleReconnect();
  };
}

/**
 * Reads the server's calibration into the settings store.
 *
 * Without this the Settings page would show this browser's defaults while the
 * simulation was running on different numbers — the sliders would look right
 * and be wrong. Display-only preferences are left untouched.
 */
async function loadSettings() {
  const settings = await sim.settings.get();
  const store = useSettingsStore.getState();
  const patch = {};
  for (const key of Object.keys(settings || {})) {
    if (key in store) patch[key] = settings[key];
  }
  if (Object.keys(patch).length) store.set(patch);
}

/** Fetches the road graph (once), the current world, and the calibration. */
async function hydrate() {
  const connection = useConnectionStore.getState();
  connection.setHydrating(true);
  try {
    if (!networkLoaded) await loadNetwork();
    await loadSnapshot();
    // Calibration is a nicety, not a prerequisite: a failure here must not
    // stop the world from loading.
    await loadSettings().catch(() => {});
  } finally {
    connection.setHydrating(false);
  }
}

/** Starts server mode. Safe to call when already connected. */
export async function connectSimBridge() {
  if (!stopped) return;
  stopped = false;
  attempt = 0;
  networkLoaded = false;

  useConnectionStore.getState().setStatus('connecting');

  try {
    await hydrate();
  } catch (err) {
    // Connect anyway: the backend may come up a moment later, and the reconnect
    // loop re-runs the hydration each time.
    useConnectionStore.getState().setStatus('error', err.message);
  }

  openSocket();
}

/** Stops server mode and closes the socket. */
export function disconnectSimBridge() {
  stopped = true;
  networkLoaded = false;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (socket) {
    // Clear the handler first, so closing on purpose does not look like a drop.
    socket.onclose = null;
    try {
      socket.close();
    } catch {
      /* already closing */
    }
    socket = null;
  }
  useConnectionStore.getState().setStatus('idle');
}

/** Pulls the world again without dropping the socket. */
export async function resyncSimBridge() {
  await loadSnapshot();
}

export { normaliseMission };
