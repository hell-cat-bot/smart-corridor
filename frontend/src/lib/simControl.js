/**
 * One set of actions, two possible worlds behind them.
 *
 * Every control in the console — play, pause, new mission, approve, inject a
 * disaster — goes through here. In `local` mode the call lands in the browser's
 * own engine, exactly as it always did. In `server` mode it becomes a request
 * to ml_backend, and the change comes back through the WebSocket like any other
 * event, so the server stays the single source of truth.
 *
 * Two rules keep the call sites simple:
 *
 *   1. Every function returns a Promise, in both modes. A caller that needs the
 *      result awaits it; a caller that does not can ignore it.
 *   2. Nothing here rejects. A failed request is reported to the operator with
 *      a toast and the promise resolves to null, so a fire-and-forget click can
 *      never produce an unhandled rejection.
 */

import { toast } from 'sonner';

import useConnectionStore from '../store/useConnectionStore';
import useAuthStore from '../store/useAuthStore';
import useWorldStore from '../store/useWorldStore';
import sim from './simClient';
import { resyncSimBridge } from '../engine/simBridge';

import * as localSim from '../engine/simulation';
import * as localMissions from '../engine/missions';
import * as localDisasters from '../engine/disasters';

const isServer = () => {
  const { source, status } = useConnectionStore.getState();
  return source === 'server' && status === 'connected';
};

/** Runs a server call, turning any failure into a toast and a null result. */
async function attempt(label, fn) {
  try {
    return await fn();
  } catch (err) {
    toast.error(`${label} failed`, { description: err.message });
    return null;
  }
}

/**
 * Viewers can watch everything and change nothing. The backend does not know
 * about roles, so this is the gate — which is why it lives in one place.
 */
function ensureCanWrite(action) {
  const { status, canWrite, user } = useAuthStore.getState();
  if (status !== 'authed') {
    // In demo / live dashboard mode, allow operators to use controls freely
    return true;
  }
  if (!canWrite()) {
    toast.error('Read-only access', {
      description: `Your ${user?.role || 'current'} role cannot ${action}. Ask an administrator for dispatcher access.`,
    });
    return false;
  }
  return true;
}

/* ------------------------------------------------------------- transport */

export async function toggleSim() {
  if (!isServer()) return localSim.toggleSim();
  if (!ensureCanWrite('control the simulation')) return null;
  const running = useWorldStore.getState().running;
  useWorldStore.getState().patch({ running: !running });
  return attempt(running ? 'Pause' : 'Start', () =>
    running ? sim.control.pause() : sim.control.start(),
  );
}

export async function startSim() {
  if (!isServer()) return localSim.startSim();
  if (!ensureCanWrite('control the simulation')) return null;
  useWorldStore.getState().patch({ running: true });
  return attempt('Start', () => sim.control.start());
}

export async function pauseSim() {
  if (!isServer()) return localSim.pauseSim();
  if (!ensureCanWrite('control the simulation')) return null;
  useWorldStore.getState().patch({ running: false });
  return attempt('Pause', () => sim.control.pause());
}

export async function setSpeed(speed) {
  if (!isServer()) return localSim.setSpeed(speed);
  if (!ensureCanWrite('control the simulation')) return null;
  return attempt('Speed change', () => sim.control.speed(speed));
}

export async function stepSeconds(seconds = 1) {
  if (!isServer()) return localSim.stepSeconds(seconds);
  if (!ensureCanWrite('control the simulation')) return null;
  return attempt('Step', () => sim.control.step(seconds));
}

export async function resetWorld() {
  if (!isServer()) return localSim.resetWorld();
  if (!ensureCanWrite('reset the simulation')) return null;
  const result = await attempt('Reset', () => sim.control.reset());
  // A reset rebuilds the world wholesale, and the stream sends no "everything
  // changed" event, so the world is pulled again rather than drifting.
  if (result) await attempt('Resync', resyncSimBridge);
  return result;
}

/* -------------------------------------------------------------- missions */

export async function createMission(payload) {
  if (!isServer()) return localMissions.createMission(payload);
  if (!ensureCanWrite('create a mission')) return null;
  return attempt('Creating the mission', () =>
    sim.missions.create({
      id: payload.id ?? null,
      service: payload.service,
      emergencyClass: payload.emergencyClass,
      sceneNode: payload.sceneNode,
      priority: payload.priority ?? null,
      note: payload.note ?? '',
      emergencyLabel: payload.emergencyLabel ?? null,
      dwellSeconds: payload.dwellSeconds ?? null,
      sourceDisasterId: payload.sourceDisasterId ?? null,
    }),
  );
}

export async function approveMission(missionId, unitId) {
  if (!isServer()) {
    const ok = localMissions.approveMission(missionId);
    if (ok && !useWorldStore.getState().running) {
      localSim.startSim();
    }
    return ok;
  }
  try {
    let res = null;
    try {
      res = await sim.missions.approve(missionId, unitId);
    } catch (err) {
      if (err.status === 404) {
        // Mission exists locally (e.g. citizen report) but not yet on server.
        // Push it to the server first, then approve!
        const m = useWorldStore.getState().getMission(missionId);
        if (m) {
          await sim.missions.create({
            id: m.id,
            service: m.service,
            emergencyClass: m.emergencyClass,
            sceneNode: m.sceneNode,
            priority: m.priority,
            note: m.note,
            emergencyLabel: m.emergencyLabel,
            dwellSeconds: m.dwellTotal,
          });
          res = await sim.missions.approve(m.id, unitId || m.suggestedUnitId);
        }
      } else {
        throw err;
      }
    }
    // Auto-start simulation if paused so the newly dispatched vehicle moves immediately
    const world = useWorldStore.getState();
    if (!world.running) {
      await sim.control.start();
      useWorldStore.getState().patch({ running: true });
    }
    return res || true;
  } catch (err) {
    console.warn('Server dispatch failed, attempting local fallback:', err);
    const ok = localMissions.approveMission(missionId);
    if (ok && !useWorldStore.getState().running) {
      localSim.startSim();
    }
    return ok;
  }
}

export async function cancelMission(missionId) {
  if (!isServer()) return localMissions.cancelMission(missionId);
  if (!ensureCanWrite('cancel a mission')) return null;
  return attempt('Cancelling the mission', () => sim.missions.cancel(missionId));
}

/* ------------------------------------------------------------- disasters */

export async function injectDisaster(payload) {
  if (!isServer()) {
    const created = localDisasters.injectDisaster(payload);
    // The local engine returns null for the same reasons the backend answers
    // 409, so the operator is told either way.
    if (!created) {
      toast.warning('Not injected', {
        description: 'That junction is already blocked, or the disaster limit has been reached.',
      });
    }
    return created;
  }
  if (!ensureCanWrite('inject a disaster')) return null;
  try {
    return await sim.disasters.create({
      node: payload.node,
      type: payload.type,
      typeLabel: payload.typeLabel ?? null,
      severity: payload.severity ?? 0.5,
      label: payload.label ?? '',
      note: payload.note ?? '',
    });
  } catch (err) {
    // 409 means the junction is already blocked or the cap is reached.
    if (err.status === 409) {
      toast.warning('Not injected', { description: err.message });
      return null;
    }
    toast.error('Injecting the disaster failed', { description: err.message });
    return null;
  }
}

export async function clearDisasterAtNode(nodeId) {
  if (!isServer()) return localDisasters.clearDisasterAtNode(nodeId);
  if (!ensureCanWrite('clear a disaster')) return null;
  return attempt('Clearing the blockage', () => sim.disasters.clearByNode(nodeId));
}

export async function clearDisaster(id) {
  if (!isServer()) return localDisasters.clearDisaster(id);
  if (!ensureCanWrite('clear a disaster')) return null;
  return attempt('Clearing the blockage', () => sim.disasters.clearById(id));
}

export async function clearAllDisasters() {
  if (!isServer()) return localDisasters.clearAllDisasters();
  if (!ensureCanWrite('clear disasters')) return null;
  // There is no bulk endpoint, so each one is cleared and the failures counted.
  const disasters = useWorldStore.getState().disasters.slice();
  const results = await Promise.all(
    disasters.map((d) => sim.disasters.clearById(d.id).then(() => true).catch(() => false)),
  );
  const failed = results.filter((ok) => !ok).length;
  if (failed) toast.error(`${failed} of ${disasters.length} blockages could not be cleared`);
  return disasters.length - failed;
}

/* -------------------------------------------------------------- settings */

/**
 * The calibration keys ml_backend actually owns.
 *
 * The settings store also holds display-only preferences — map labels, whether
 * civilians are drawn — which are this browser's business and are never sent.
 */
export const SIM_SETTING_KEYS = [
  'congestionFactor',
  'priorityWeights',
  'severityMultiplier',
  'severityBoost',
  'replanCooldown',
  'replanImprovement',
  'civilianCount',
  'congestionSmoothing',
  'densitySaturation',
  'autoApprove',
  'dwellScale',
  'preemptRadius',
  'releaseDelay',
  'signalCycle',
  'maxDisasters',
  'greenwave',
];

/** Narrows a settings patch to what the simulation understands. */
export function pickSimSettings(patch) {
  const out = {};
  for (const key of SIM_SETTING_KEYS) {
    if (patch && Object.prototype.hasOwnProperty.call(patch, key)) out[key] = patch[key];
  }
  return out;
}

/**
 * Pushes calibration changes to the simulation. In local mode the settings
 * store is the only place they need to live, so this is a no-op there.
 *
 * Per the simulation's own contract, a change applies to the *next* plan only
 * and never rewrites a route that is already in flight.
 */
export async function pushSettings(patch) {
  if (!isServer()) return null;
  const forwarded = pickSimSettings(patch);
  if (Object.keys(forwarded).length === 0) return null;
  if (!ensureCanWrite('change the calibration')) return null;
  return attempt('Saving the calibration', () => sim.settings.patch(forwarded));
}

/** Read-only helpers that stay local in both modes. */
export const rankUnits = localMissions.rankUnits;
export const chooseHospital = localMissions.chooseHospital;
export const liveEta = localSim.liveEta;
