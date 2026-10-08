/**
 * Domain constants for the Smart-Corridor operations platform.
 *
 * Everything the Operations view, Green Corridor view, analytics and the
 * structured log agree on lives here so the vocabulary stays consistent.
 */

/* ---------------------------------------------------------------- services */

export const SERVICE = {
  MEDICAL: 'medical',
  FIRE: 'fire',
};

export const SERVICE_LABEL = {
  [SERVICE.MEDICAL]: 'Medical',
  [SERVICE.FIRE]: 'Fire',
};

/* ------------------------------------------------------------------- units */

export const UNIT_TYPE = {
  AMBULANCE: 'ambulance',
  FIRETRUCK: 'firetruck',
};

export const SERVICE_UNIT_TYPE = {
  [SERVICE.MEDICAL]: UNIT_TYPE.AMBULANCE,
  [SERVICE.FIRE]: UNIT_TYPE.FIRETRUCK,
};

export const UNIT_STATUS = {
  AVAILABLE: 'available',
  ASSIGNED: 'assigned',
  EN_ROUTE: 'en_route',
  ON_SCENE: 'on_scene',
  TRANSPORTING: 'transporting',
  RETURNING: 'returning',
};

export const UNIT_STATUS_LABEL = {
  [UNIT_STATUS.AVAILABLE]: 'Available',
  [UNIT_STATUS.ASSIGNED]: 'Assigned',
  [UNIT_STATUS.EN_ROUTE]: 'En route to scene',
  [UNIT_STATUS.ON_SCENE]: 'On scene',
  [UNIT_STATUS.TRANSPORTING]: 'Transporting',
  [UNIT_STATUS.RETURNING]: 'Returning to base',
};

/* -------------------------------------------------------------- facilities */

export const FACILITY_TYPE = {
  HOSPITAL: 'hospital',
  FIRE_STATION: 'fire_station',
};

export const FACILITY_LABEL = {
  [FACILITY_TYPE.HOSPITAL]: 'Hospital',
  [FACILITY_TYPE.FIRE_STATION]: 'Fire station',
};

/* ---------------------------------------------------------------- missions */

export const MISSION_STATUS = {
  PENDING: 'pending',
  ASSIGNED: 'assigned',
  EN_ROUTE_SCENE: 'en_route_scene',
  ON_SCENE: 'on_scene',
  TRANSPORTING: 'transporting',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

export const MISSION_STATUS_LABEL = {
  [MISSION_STATUS.PENDING]: 'Awaiting approval',
  [MISSION_STATUS.ASSIGNED]: 'Assigned',
  [MISSION_STATUS.EN_ROUTE_SCENE]: 'Leg 1 — to scene',
  [MISSION_STATUS.ON_SCENE]: 'On scene',
  [MISSION_STATUS.TRANSPORTING]: 'Leg 2 — to hospital',
  [MISSION_STATUS.COMPLETED]: 'Completed',
  [MISSION_STATUS.CANCELLED]: 'Cancelled',
};

export const ACTIVE_MISSION_STATUSES = [
  MISSION_STATUS.ASSIGNED,
  MISSION_STATUS.EN_ROUTE_SCENE,
  MISSION_STATUS.ON_SCENE,
  MISSION_STATUS.TRANSPORTING,
];

export const LEG_TYPE = {
  TO_SCENE: 'to_scene',
  TO_HOSPITAL: 'to_hospital',
};

export const LEG_LABEL = {
  [LEG_TYPE.TO_SCENE]: 'Leg 1 · dispatch → scene',
  [LEG_TYPE.TO_HOSPITAL]: 'Leg 2 · scene → hospital',
};

/* -------------------------------------------------------------- priorities */

export const PRIORITY = { CRITICAL: 1, HIGH: 2, NORMAL: 3 };

export const PRIORITY_LABEL = {
  1: 'P1 · Critical',
  2: 'P2 · High',
  3: 'P3 · Normal',
};

export const PRIORITY_TONE = {
  1: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', dot: '#DC2626' },
  2: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: '#D97706' },
  3: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', dot: '#2563EB' },
};

/* ------------------------------------------------------- emergency classes */

export const EMERGENCY_CLASSES = {
  [SERVICE.MEDICAL]: [
    { id: 'cardiac', label: 'Cardiac arrest', priority: 1, dwell: 45 },
    { id: 'trauma', label: 'Major trauma', priority: 1, dwell: 60 },
    { id: 'rta', label: 'Road accident', priority: 1, dwell: 50 },
    { id: 'stroke', label: 'Suspected stroke', priority: 2, dwell: 40 },
    { id: 'obstetric', label: 'Obstetric emergency', priority: 2, dwell: 55 },
    { id: 'transfer', label: 'Inter-facility transfer', priority: 3, dwell: 30 },
  ],
  [SERVICE.FIRE]: [
    { id: 'structure_fire', label: 'Structure fire', priority: 1, dwell: 90 },
    { id: 'vehicle_fire', label: 'Vehicle fire', priority: 2, dwell: 60 },
    { id: 'hazmat', label: 'Hazmat spill', priority: 1, dwell: 100 },
    { id: 'rescue', label: 'Technical rescue', priority: 2, dwell: 80 },
    { id: 'alarm', label: 'Automatic alarm', priority: 3, dwell: 40 },
  ],
};

export function findEmergencyClass(service, id) {
  return (EMERGENCY_CLASSES[service] || []).find((c) => c.id === id) || null;
}

/* -------------------------------------------------------------- node state */

export const NODE_STATUS = {
  NORMAL: 'normal',
  CONGESTED: 'congested',
  BLOCKED: 'blocked',
};

/** Congestion enters "congested" above HIGH and only leaves below LOW (hysteresis). */
export const CONGESTION_HYSTERESIS = { HIGH: 0.6, LOW: 0.45 };

/* ---------------------------------------------------------------- signals */

export const LIGHT_STATE = {
  NORMAL_GREEN: 'normal_green',
  NORMAL_RED: 'normal_red',
  PREEMPT_GREEN: 'preempt_green',
  RELEASING: 'releasing',
};

export const LIGHT_STATE_LABEL = {
  [LIGHT_STATE.NORMAL_GREEN]: 'Normal · green',
  [LIGHT_STATE.NORMAL_RED]: 'Normal · red',
  [LIGHT_STATE.PREEMPT_GREEN]: 'Preempted · green wave',
  [LIGHT_STATE.RELEASING]: 'Releasing to normal',
};

export const LIGHT_COLOR = {
  [LIGHT_STATE.NORMAL_GREEN]: '#22C55E',
  [LIGHT_STATE.NORMAL_RED]: '#DC2626',
  [LIGHT_STATE.PREEMPT_GREEN]: '#16A34A',
  [LIGHT_STATE.RELEASING]: '#F59E0B',
};

/* --------------------------------------------------------------- disasters */

export const DISASTER_TYPES = [
  { id: 'flood', label: 'Flood' },
  { id: 'landslide', label: 'Landslide' },
  { id: 'earthquake', label: 'Earthquake' },
  { id: 'tsunami', label: 'Tsunami' },
];

/* --------------------------------------------------------- structured logs */

export const LOG_CATEGORY = {
  MISSION: 'mission',
  DISPATCH: 'dispatch',
  ROUTING: 'routing',
  CONGESTION: 'congestion',
  DISASTER: 'disaster',
  SIGNAL: 'signal',
  CONFLICT: 'conflict',
  SIMULATION: 'simulation',
};

export const LOG_CATEGORY_LABEL = {
  [LOG_CATEGORY.MISSION]: 'Mission lifecycle',
  [LOG_CATEGORY.DISPATCH]: 'Dispatch decisions',
  [LOG_CATEGORY.ROUTING]: 'Routing & replan',
  [LOG_CATEGORY.CONGESTION]: 'Congestion updates',
  [LOG_CATEGORY.DISASTER]: 'Disasters & blockages',
  [LOG_CATEGORY.SIGNAL]: 'Signal preemption',
  [LOG_CATEGORY.CONFLICT]: 'Multi-EV conflicts',
  [LOG_CATEGORY.SIMULATION]: 'Simulation & system',
};

export const LOG_CATEGORY_TONE = {
  [LOG_CATEGORY.MISSION]: { text: 'text-[#111827]', bg: 'bg-[#F3F4F6]', bar: 'border-l-[#111827]' },
  [LOG_CATEGORY.DISPATCH]: { text: 'text-blue-600', bg: 'bg-blue-50', bar: 'border-l-blue-500' },
  [LOG_CATEGORY.ROUTING]: { text: 'text-cyan-700', bg: 'bg-cyan-50', bar: 'border-l-cyan-500' },
  [LOG_CATEGORY.CONGESTION]: { text: 'text-amber-700', bg: 'bg-amber-50', bar: 'border-l-amber-500' },
  [LOG_CATEGORY.DISASTER]: { text: 'text-red-600', bg: 'bg-red-50', bar: 'border-l-red-500' },
  [LOG_CATEGORY.SIGNAL]: { text: 'text-green-700', bg: 'bg-green-50', bar: 'border-l-green-500' },
  [LOG_CATEGORY.CONFLICT]: { text: 'text-fuchsia-700', bg: 'bg-fuchsia-50', bar: 'border-l-fuchsia-500' },
  [LOG_CATEGORY.SIMULATION]: { text: 'text-gray-600', bg: 'bg-gray-100', bar: 'border-l-gray-400' },
};

export const SEVERITY = {
  INFO: 'info',
  SUCCESS: 'success',
  WARNING: 'warning',
  CRITICAL: 'critical',
};

export const SEVERITY_TONE = {
  [SEVERITY.INFO]: 'bg-gray-100 text-gray-600',
  [SEVERITY.SUCCESS]: 'bg-[#DCFCE7] text-[#16A34A]',
  [SEVERITY.WARNING]: 'bg-[#FEF3C7] text-[#D97706]',
  [SEVERITY.CRITICAL]: 'bg-[#FEE2E2] text-[#DC2626]',
};

/* ------------------------------------------------------------ sim defaults */

/** One engine tick, in wall-clock milliseconds. */
export const TICK_MS = 100;

/** Free-flow speeds in metres / second. */
export const FREE_FLOW_SPEED = {
  [UNIT_TYPE.AMBULANCE]: 16.7, // ~60 km/h
  [UNIT_TYPE.FIRETRUCK]: 13.9, // ~50 km/h
  civilian: 9.7, // ~35 km/h
};

/** How much a fully congested node slows a vehicle down (0..1). */
export const CONGESTION_SLOWDOWN = 0.65;

export const VEHICLE_COLOR = {
  [UNIT_TYPE.AMBULANCE]: '#DC2626',
  [UNIT_TYPE.FIRETRUCK]: '#EA580C',
  civilian: '#64748B',
};
