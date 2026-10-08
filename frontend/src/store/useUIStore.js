import { create } from 'zustand';

/** Drag limits for the bottom panel, in pixels. */
export const BOTTOM_PANEL_MIN = 140;
export const BOTTOM_PANEL_DEFAULT = 288;
/** Always leave room for the map above it. */
export const BOTTOM_PANEL_MAX_MARGIN = 260;

export function clampBottomPanelHeight(height) {
  const max = Math.max(BOTTOM_PANEL_MIN, window.innerHeight - BOTTOM_PANEL_MAX_MARGIN);
  return Math.round(Math.min(Math.max(height, BOTTOM_PANEL_MIN), max));
}

const useUIStore = create((set) => ({
  sidebarCollapsed: false,
  bottomPanelOpen: true,
  bottomPanelHeight: BOTTOM_PANEL_DEFAULT,
  activeBottomTab: 'mission',

  selectedMissionId: null,
  selectedUnitId: null,
  selectedNodeId: null,
  focusUnitId: null,
  /** One-shot latch so a marker click that also hits the canvas map does not clear itself. */
  _suppressMapClear: false,

  showMissionDialog: false,
  /** Pre-selected scene node when opening the mission dialog from the map. */
  missionDialogNode: null,
  showDisasterDialog: false,
  /** Pre-selected junction when opening the disaster dialog from the map. */
  disasterDialogNode: null,

  /** Log view filters live here so they survive navigation. */
  logFilters: { categories: [], severity: 'all', query: '' },

  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
  setBottomPanelOpen: (bottomPanelOpen) => set({ bottomPanelOpen }),
  setBottomPanelHeight: (height) => set({ bottomPanelHeight: clampBottomPanelHeight(height) }),
  resetBottomPanelHeight: () => set({ bottomPanelHeight: BOTTOM_PANEL_DEFAULT }),
  setActiveBottomTab: (activeBottomTab) => set({ activeBottomTab }),

  setSelectedMissionId: (selectedMissionId) => set({ selectedMissionId }),
  setSelectedUnitId: (selectedUnitId) => set({ selectedUnitId }),
  setSelectedNodeId: (selectedNodeId) => set({ selectedNodeId }),
  setFocusUnitId: (focusUnitId) => set({ focusUnitId }),

  setShowMissionDialog: (showMissionDialog) => set({ showMissionDialog, missionDialogNode: null }),
  /** Open the mission dialog; optionally pre-select a scene junction. */
  openMissionDialog: (node = null) => set({ showMissionDialog: true, missionDialogNode: node }),
  closeMissionDialog: () => set({ showMissionDialog: false, missionDialogNode: null }),

  openDisasterDialog: (node = null) => set({ showDisasterDialog: true, disasterDialogNode: node }),
  closeDisasterDialog: () => set({ showDisasterDialog: false, disasterDialogNode: null }),

  setLogFilters: (patch) =>
    set((state) => ({ logFilters: { ...state.logFilters, ...patch } })),

  clearSelection: () =>
    set({
      selectedMissionId: null,
      selectedUnitId: null,
      selectedNodeId: null,
      _suppressMapClear: false,
    }),
}));

export default useUIStore;
