import { create } from 'zustand';
import { DEFAULT_SIM_SOURCE } from '../lib/config';

/**
 * Where the live world is coming from, and how that connection is doing.
 *
 * Two sources:
 *
 *   server   ml_backend runs the simulation; this app renders what it streams
 *            and every control action is a request to it
 *   local    the browser's own engine runs the simulation, exactly as it did
 *            before any backend existed
 *
 * `local` exists so the console is never dead in the water: if Python is not
 * running, one click keeps the demo going. Nothing else in the app has to know
 * which mode it is in — `lib/simControl.js` hides that.
 *
 * The chosen source is remembered per browser, because switching is something
 * you do to your own setup, not something the whole team shares.
 */

const SOURCE_KEY = 'packmen.simSource';

function readStoredSource() {
  try {
    const stored = window.localStorage.getItem(SOURCE_KEY);
    return stored === 'local' || stored === 'server' ? stored : DEFAULT_SIM_SOURCE;
  } catch {
    return DEFAULT_SIM_SOURCE;
  }
}

function writeStoredSource(source) {
  try {
    window.localStorage.setItem(SOURCE_KEY, source);
  } catch {
    /* the preference simply will not survive a reload */
  }
}

const useConnectionStore = create((set, get) => ({
  source: readStoredSource(),

  /** idle | connecting | connected | disconnected | error */
  status: 'idle',
  lastError: null,
  /** ISO timestamp of the last frame received, for the "live" indicator. */
  lastMessageAt: null,
  messages: 0,
  attempts: 0,
  /** True while the initial network + snapshot fetch is running. */
  hydrating: false,

  setStatus: (status, lastError = null) => set({ status, lastError }),
  setHydrating: (hydrating) => set({ hydrating }),
  noteMessage: () =>
    set((state) => ({ messages: state.messages + 1, lastMessageAt: new Date().toISOString() })),
  noteAttempt: () => set((state) => ({ attempts: state.attempts + 1 })),
  resetCounters: () => set({ messages: 0, attempts: 0, lastMessageAt: null }),

  /** Only records the choice — `simSource.js` performs the switch. */
  setSource: (source) => {
    if (source !== 'server' && source !== 'local') return;
    if (get().source === source) return;
    writeStoredSource(source);
    set({ source, status: 'idle', lastError: null, messages: 0, attempts: 0, lastMessageAt: null });
  },

  isLive: () => get().source === 'server' && get().status === 'connected',
}));

export default useConnectionStore;
