/**
 * Where the two backends live.
 *
 * Both are read from Vite environment variables so the same build can point at
 * a laptop, a teammate's machine or a deployed host. Copy `.env.example` to
 * `.env` to change them; the defaults match running everything locally.
 */

const rawApiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const rawSimUrl = import.meta.env.VITE_SIM_URL || 'http://localhost:8000';

/** Trailing slashes make every later string concatenation wrong. */
function normalise(url) {
  return String(url).replace(/\/+$/, '');
}

/** http://host:8000 -> ws://host:8000 (and https -> wss). */
function toWebSocket(url) {
  return normalise(url).replace(/^http/, 'ws');
}

export const API_URL = normalise(rawApiUrl);
export const SIM_URL = normalise(rawSimUrl);
export const SIM_WS_URL = `${toWebSocket(rawSimUrl)}/ws`;

/**
 * Which simulation source the console starts on.
 *
 *   server  the Python backend drives the world over WebSocket
 *   local   the browser's own engine drives it, with no backend at all
 *
 * `local` is the fallback so a demo still runs if Python is not up.
 */
export const DEFAULT_SIM_SOURCE = import.meta.env.VITE_SIM_SOURCE === 'server' ? 'server' : 'local';

/** How long to wait before giving up on a single HTTP call, in milliseconds. */
export const REQUEST_TIMEOUT_MS = 15000;
