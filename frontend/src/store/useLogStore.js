import { create } from 'zustand';
import { LOG_CATEGORY, SEVERITY } from '../domain/constants';

const MAX_ENTRIES = 800;
let seq = 0;

/**
 * Structured, categorised operations log.
 *
 * Every record carries wall-clock time, simulation time, a category, entity
 * references and the structured data behind the decision — so a routing choice
 * or a junction tie-break can be traced after the fact, not just read as prose.
 */
const useLogStore = create((set, get) => ({
  entries: [],

  log: ({
    category = LOG_CATEGORY.SIMULATION,
    severity = SEVERITY.INFO,
    message,
    simTime = 0,
    refs = {},
    data = {},
  }) => {
    seq += 1;
    const entry = {
      id: `LOG-${seq}`,
      seq,
      wallTime: new Date().toISOString(),
      simTime,
      category,
      severity,
      message,
      refs,
      data,
    };
    set((state) => ({
      entries: [entry, ...state.entries].slice(0, MAX_ENTRIES),
    }));
    return entry;
  },

  /**
   * Adds records produced elsewhere, keeping their own identity.
   *
   * When ml_backend is driving the world, the log entries are made by the
   * server's engine and arrive over the WebSocket already numbered and
   * timestamped. Passing them through `log()` would renumber them and lose the
   * server's sequence, which is exactly what makes a decision traceable — so
   * they are merged as they are, newest first, and duplicates from a reconnect
   * are dropped by id.
   */
  ingest: (records) =>
    set((state) => {
      if (!Array.isArray(records) || records.length === 0) return state;
      const seen = new Set(state.entries.map((entry) => entry.id));
      const fresh = records.filter((record) => record && record.id && !seen.has(record.id));
      if (fresh.length === 0) return state;
      const merged = [...fresh.slice().reverse(), ...state.entries];
      return { entries: merged.slice(0, MAX_ENTRIES) };
    }),

  clear: () => set({ entries: [] }),

  countsByCategory: () => {
    const counts = {};
    for (const entry of get().entries) {
      counts[entry.category] = (counts[entry.category] || 0) + 1;
    }
    return counts;
  },

  exportJson: () => JSON.stringify(get().entries, null, 2),
}));

/** Convenience wrapper so engine modules can log without pulling the hook in. */
export function logEvent(payload) {
  return useLogStore.getState().log(payload);
}

export default useLogStore;
