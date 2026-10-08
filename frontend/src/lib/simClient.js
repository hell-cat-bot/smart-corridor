/**
 * The HTTP client for ml_backend — the simulation and ML service.
 *
 * Deliberately separate from `apiClient.js`: this backend has no accounts and
 * no tokens, and mixing the two would make it look as though the simulation
 * cared who you were. Authorisation for these actions is enforced in the UI by
 * the signed-in user's role (see `simControl.js`).
 */

import { SIM_URL, REQUEST_TIMEOUT_MS } from './config';

export class SimError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'SimError';
    this.status = status;
  }
}

async function send(path, { method = 'GET', body, timeout = REQUEST_TIMEOUT_MS } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';

  let response;
  try {
    response = await fetch(`${SIM_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    });
  } catch (err) {
    const reason = err.name === 'TimeoutError' ? 'timed out' : 'could not be reached';
    throw new SimError(0, `The simulation backend at ${SIM_URL} ${reason}.`);
  }

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    // FastAPI puts the reason in `detail`.
    const detail = payload && typeof payload === 'object' ? payload.detail : payload;
    throw new SimError(response.status, detail || `Simulation request failed (${response.status})`);
  }

  return payload;
}

export const sim = {
  health: () => send('/', { timeout: 4000 }),

  /** Junctions, segments with real road geometry, and facilities. */
  network: () => send('/api/network'),

  /** The whole live world in one response — used to bootstrap and to resync. */
  snapshot: () => send('/api/world/snapshot'),

  control: {
    start: () => send('/api/sim/start', { method: 'POST' }),
    pause: () => send('/api/sim/pause', { method: 'POST' }),
    step: (seconds = 1) => send('/api/sim/step', { method: 'POST', body: { seconds } }),
    speed: (speed) => send('/api/sim/speed', { method: 'POST', body: { speed } }),
    reset: () => send('/api/sim/reset', { method: 'POST' }),
  },

  missions: {
    create: (body) => send('/api/missions', { method: 'POST', body }),
    list: (status) => send(`/api/missions${status ? `?status=${status}` : ''}`),
    approve: (id, unitId) =>
      send(`/api/missions/${id}/approve${unitId ? `?unit_id=${encodeURIComponent(unitId)}` : ''}`, {
        method: 'POST',
      }),
    cancel: (id) => send(`/api/missions/${id}/cancel`, { method: 'POST' }),
  },

  disasters: {
    create: (body) => send('/api/disasters', { method: 'POST', body }),
    clearById: (id) => send(`/api/disasters/${id}`, { method: 'DELETE' }),
    clearByNode: (nodeId) => send(`/api/disasters/by-node/${encodeURIComponent(nodeId)}`, { method: 'DELETE' }),
  },

  settings: {
    get: () => send('/api/settings'),
    patch: (body) => send('/api/settings', { method: 'PATCH', body }),
  },

  analytics: () => send('/api/analytics/summary'),
  logs: (limit = 200) => send(`/api/logs?limit=${limit}`),

  /** Hazard detection on a camera frame (YOLOv8 + ResNet50). */
  inferFrame: (body) => send('/infer/frame', { method: 'POST', body, timeout: 60000 }),
};

export default sim;
