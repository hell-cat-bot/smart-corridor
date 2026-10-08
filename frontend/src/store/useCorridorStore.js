import { create } from 'zustand';

/**
 * Green Corridor session state.
 *
 * The corridor view is a controlled demonstration: paths are calculated once at
 * session start and then frozen, so what the operator watches is purely signal
 * preemption timing and junction arbitration — not continuous global replanning,
 * which stays in the Operations view.
 */

function initialState() {
  return {
    active: false,
    startedAt: null,
    /** Frozen corridor vehicles: { id, label, type, priority, path, coords, cumulative, total, travelled, pos, heading, state, holdingAt } */
    vehicles: [],
    /** nodeId -> { nodeId, state, servingVehicleId, since, releaseAt, phase, cycleOffset } */
    lights: {},
    /** Junction contests recorded during the session. */
    conflicts: [],
    /** Signal request / grant / release timeline for this session. */
    events: [],
    elapsed: 0,
    finished: false,
    stats: {
      requests: 0,
      grants: 0,
      releases: 0,
      conflicts: 0,
      holdSeconds: 0,
    },
  };
}

const useCorridorStore = create((set) => ({
  ...initialState(),

  patch: (partial) => set(partial),

  pushEvent: (event) =>
    set((state) => ({ events: [{ ...event, seq: state.events.length + 1 }, ...state.events].slice(0, 300) })),

  pushConflict: (conflict) =>
    set((state) => ({
      conflicts: [{ ...conflict, seq: state.conflicts.length + 1 }, ...state.conflicts].slice(0, 100),
      stats: { ...state.stats, conflicts: state.stats.conflicts + 1 },
    })),

  bumpStat: (key, by = 1) =>
    set((state) => ({ stats: { ...state.stats, [key]: (state.stats[key] || 0) + by } })),

  reset: () => set({ ...initialState() }),
}));

export default useCorridorStore;
