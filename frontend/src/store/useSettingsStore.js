import { create } from 'zustand';
import { UNIT_TYPE } from '../domain/constants';

export const DEFAULT_SETTINGS = {
  /* ---------------------------------------------------------- map display */
  showMapLabels: true,
  showCongestionOverlay: true,
  showCivilians: false,
  showFacilities: true,
  showGridEdges: true,
  /** Draw every junction, not just notable ones, regardless of zoom. */
  showAllJunctions: false,
  animateVehicles: true,

  /* --------------------------------------------------------------- routing */
  /** alpha in W(u,v) = d x (1 + alpha * c_v * omega). */
  congestionFactor: 2.0,
  /** omega per vehicle class: how strongly congestion penalises this class. */
  priorityWeights: {
    [UNIT_TYPE.AMBULANCE]: 0.6,
    [UNIT_TYPE.FIRETRUCK]: 0.8,
    civilian: 1.0,
  },
  /** Minimum sim-seconds between two congestion-driven replans of one unit. */
  replanCooldown: 10,
  /** A congestion replan is only accepted if it saves at least this fraction. */
  replanImprovement: 0.12,

  /* ------------------------------------------------------------ congestion */
  civilianCount: 45,
  /** EMA smoothing factor for the congestion index (higher = more reactive). */
  congestionSmoothing: 0.18,
  /** Civilians near a node needed to read as fully congested. */
  densitySaturation: 4,

  /* -------------------------------------------------------------- missions */
  autoApprove: false,
  /** Multiplier applied to the emergency class's on-scene dwell time. */
  dwellScale: 1.0,

  /* --------------------------------------------------------------- signals */
  /** Approach distance at which an emergency unit requests a green. */
  preemptRadius: 260,
  /** Seconds a junction stays held after the unit clears it. */
  releaseDelay: 3,
  /** Normal (unpreempted) signal cycle length in seconds. */
  signalCycle: 16,

  /* ------------------------------------------------------------- disasters */
  maxDisasters: 8,
};

const useSettingsStore = create((set) => ({
  ...DEFAULT_SETTINGS,

  set: (patch) => set(patch),

  setPriorityWeight: (type, weight) =>
    set((state) => ({ priorityWeights: { ...state.priorityWeights, [type]: weight } })),

  reset: () => set({ ...DEFAULT_SETTINGS }),
}));

export default useSettingsStore;
