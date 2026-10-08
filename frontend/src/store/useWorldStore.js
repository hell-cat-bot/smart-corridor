import { create } from 'zustand';
import {
  GRID,
  FACILITIES,
  EDGE_INDEX,
  NETWORK_META,
  IS_PLACEHOLDER,
  seedNodes,
  seedUnits,
} from '../data/worldSeed';

/**
 * The single shared world state.
 *
 * Operations, Green Corridor, analytics and the structured log all read from
 * this one store; the simulation engine is the only writer of the hot fields
 * (unit positions, congestion, signal states, simulation clock).
 *
 * This store deliberately holds state and primitive setters only — all decision
 * logic lives in src/engine/* so there is a single place where dispatch,
 * routing and preemption rules are defined.
 */

function initialState() {
  return {
    /* ------------------------------------------------------------- network */
    nodes: seedNodes(),
    edges: GRID.edges,
    /** key "a|b" -> segment record carrying real road geometry and length. */
    edgeIndex: EDGE_INDEX,
    networkMeta: NETWORK_META,
    isPlaceholderNetwork: IS_PLACEHOLDER,
    facilities: FACILITIES,
    center: GRID.center,
    zoom: GRID.zoom,

    /* -------------------------------------------------------------- fleet */
    units: seedUnits(),

    /* ------------------------------------------------------------ missions */
    missions: [],

    /* ----------------------------------------------------------- disasters */
    disasters: [],

    /* ------------------------------------------------------------- signals */
    /** nodeId -> { state, servingUnitId, missionId, since, releaseAt, contested } */
    lights: {},

    /* ----------------------------------------------------- civilian traffic */
    civilians: [],

    /* ---------------------------------------------------------------- clock */
    simTime: 0,
    tick: 0,
    running: false,
    speed: 1,

    /* -------------------------------------------------------------- metrics */
    metrics: {
      replans: 0,
      blockageReplans: 0,
      congestionReplans: 0,
      preemptionsGranted: 0,
      conflictsResolved: 0,
      missionsCompleted: 0,
      unservedRequests: 0,
      responseTimes: [],
      efficiencySamples: [],
    },

    /** Rolling congestion samples for the analytics sparkline. */
    congestionHistory: [],

    scenarioId: 'clean',
  };
}

const useWorldStore = create((set, get) => ({
  ...initialState(),

  /* ---------------------------------------------------------- bulk setters */
  patch: (partial) => set(partial),

  patchMetrics: (partial) =>
    set((state) => ({ metrics: { ...state.metrics, ...partial } })),

  bumpMetric: (key, by = 1) =>
    set((state) => ({ metrics: { ...state.metrics, [key]: (state.metrics[key] || 0) + by } })),

  /* ------------------------------------------------------------- missions */
  addMission: (mission) => set((state) => ({ missions: [mission, ...state.missions] })),

  updateMission: (id, patch) =>
    set((state) => ({
      missions: state.missions.map((m) =>
        m.id === id ? { ...m, ...(typeof patch === 'function' ? patch(m) : patch) } : m,
      ),
    })),

  /* ----------------------------------------------------------------- units */
  updateUnit: (id, patch) =>
    set((state) => ({
      units: state.units.map((u) =>
        u.id === id ? { ...u, ...(typeof patch === 'function' ? patch(u) : patch) } : u,
      ),
    })),

  /* ------------------------------------------------------------- disasters */
  addDisaster: (disaster) => set((state) => ({ disasters: [...state.disasters, disaster] })),

  removeDisaster: (id) =>
    set((state) => ({ disasters: state.disasters.filter((d) => d.id !== id) })),

  setNodeStatus: (nodeId, status) =>
    set((state) => ({
      nodes: state.nodes.map((n) => (n.id === nodeId ? { ...n, status } : n)),
    })),

  /* --------------------------------------------------------------- signals */
  setLight: (nodeId, patch) =>
    set((state) => ({
      lights: { ...state.lights, [nodeId]: { ...(state.lights[nodeId] || {}), ...patch } },
    })),

  clearLight: (nodeId) =>
    set((state) => {
      const lights = { ...state.lights };
      delete lights[nodeId];
      return { lights };
    }),

  /* ----------------------------------------------------------- convenience */
  getNode: (id) => get().nodes.find((n) => n.id === id) || null,
  getUnit: (id) => get().units.find((u) => u.id === id) || null,
  getMission: (id) => get().missions.find((m) => m.id === id) || null,
  getFacility: (id) => get().facilities.find((f) => f.id === id) || null,

  blockedNodeSet: () => new Set(get().disasters.map((d) => d.node)),

  congestionMap: () => {
    const map = {};
    for (const n of get().nodes) map[n.id] = n.congestion;
    return map;
  },

  reset: () => set({ ...initialState() }),
}));

/** Node id -> node, rebuilt on demand for engine hot loops. */
export function nodeIndex() {
  const map = {};
  for (const n of useWorldStore.getState().nodes) map[n.id] = n;
  return map;
}

export default useWorldStore;
