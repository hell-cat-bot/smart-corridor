/**
 * The HTTP client for web_backend.
 *
 * Everything the console asks of the accounts/records service goes through
 * `api`, which handles three things the rest of the app should not have to
 * think about:
 *
 *   1. attaching the access token
 *   2. refreshing it silently when it has expired, then retrying the request
 *      once — so a 15-minute token never interrupts anyone mid-task
 *   3. turning an error response into a thrown `ApiError` carrying the
 *      message and field details the backend sent
 *
 * Tokens live in localStorage. That is the pragmatic choice for a console like
 * this; a production deployment would move the refresh token to an httpOnly
 * cookie, which is a change to this file and the backend's auth routes only.
 */

import { API_URL, REQUEST_TIMEOUT_MS } from './config';

const ACCESS_KEY = 'packmen.accessToken';
const REFRESH_KEY = 'packmen.refreshToken';

/** An error carrying what the backend actually said, not just a status code. */
export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }

  /** "email: Invalid email" — ready to show under a form. */
  get fieldSummary() {
    if (!Array.isArray(this.details)) return null;
    return this.details.map((d) => `${d.field}: ${d.message}`).join(', ');
  }
}

/* ------------------------------------------------------------------ storage */

// localStorage throws in a few browser configurations (private mode with site
// data blocked), and a console that cannot remember a token should still run.
function readStorage(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* ignore: the session simply will not survive a reload */
  }
}

export const tokenStore = {
  get access() {
    return readStorage(ACCESS_KEY);
  },
  get refresh() {
    return readStorage(REFRESH_KEY);
  },
  set({ accessToken, refreshToken }) {
    writeStorage(ACCESS_KEY, accessToken ?? null);
    writeStorage(REFRESH_KEY, refreshToken ?? null);
  },
  clear() {
    writeStorage(ACCESS_KEY, null);
    writeStorage(REFRESH_KEY, null);
  },
};

/** Called when the session cannot be recovered, so the app can send you to /login. */
let onSessionExpired = () => {};
export function setSessionExpiredHandler(handler) {
  onSessionExpired = typeof handler === 'function' ? handler : () => {};
}

/* -------------------------------------------------------------- the request */

async function parseBody(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function send(path, { method = 'GET', body, token, signal } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    // A network-level failure: the backend is down, or the browser blocked it.
    const reason = err.name === 'TimeoutError' ? 'timed out' : 'could not be reached';
    throw new ApiError(0, `The records service at ${API_URL} ${reason}.`);
  }

  const payload = await parseBody(response);

  if (!response.ok) {
    const error = payload && payload.error ? payload.error : {};
    throw new ApiError(
      response.status,
      error.message || `Request failed with status ${response.status}`,
      error.details,
    );
  }

  return payload;
}

/* ------------------------------------------------------------------ refresh */

// One shared refresh promise, so several requests failing at once trigger a
// single refresh rather than a stampede that would revoke each other's tokens
// (the backend rotates refresh tokens, so a second concurrent refresh loses).
let refreshInFlight = null;

async function refreshSession() {
  const refreshToken = tokenStore.refresh;
  if (!refreshToken) return null;

  if (!refreshInFlight) {
    refreshInFlight = send('/api/auth/refresh', { method: 'POST', body: { refreshToken } })
      .then((session) => {
        tokenStore.set(session);
        return session;
      })
      .catch(() => {
        tokenStore.clear();
        return null;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }

  return refreshInFlight;
}

/**
 * Makes an authenticated request, refreshing once on a 401 before giving up.
 * `auth: false` is for the endpoints used before anyone is signed in.
 */
async function request(path, { auth = true, ...options } = {}) {
  if (!auth) return send(path, options);

  const token = tokenStore.access;
  try {
    return await send(path, { ...options, token });
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 401) throw err;

    const session = await refreshSession();
    if (!session) {
      onSessionExpired();
      throw new ApiError(401, 'Your session has expired. Please sign in again.');
    }
    return send(path, { ...options, token: session.accessToken });
  }
}

/* ---------------------------------------------------------------- endpoints */

export const api = {
  request,

  auth: {
    register: (body) => request('/api/auth/register', { method: 'POST', body, auth: false }),
    login: (body) => request('/api/auth/login', { method: 'POST', body, auth: false }),
    logout: (refreshToken) =>
      request('/api/auth/logout', { method: 'POST', body: { refreshToken }, auth: false }),
    me: () => request('/api/auth/me'),
    changePassword: (body) => request('/api/auth/change-password', { method: 'POST', body }),
  },

  stats: {
    overview: () => request('/api/stats/overview'),
    daily: (days = 14) => request(`/api/stats/daily?days=${days}`),
    audit: (params = '') => request(`/api/stats/audit${params}`),
  },

  integration: {
    status: () => request('/api/integration/status'),
  },

  hospitals: { list: (query = '') => request(`/api/hospitals${query}`) },
  vehicles: { list: (query = '') => request(`/api/vehicles${query}`) },
  incidents: { list: (query = '') => request(`/api/incidents${query}`) },
  missions: { list: (query = '') => request(`/api/missions${query}`) },

  /** Unauthenticated liveness probe, used by the dashboard's health strip. */
  health: () => request('/health', { auth: false }),
};

export default api;
