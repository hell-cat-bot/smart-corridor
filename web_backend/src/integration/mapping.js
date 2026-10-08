'use strict';

/**
 * Translation between the simulation's vocabulary (ml_backend) and this
 * service's vocabulary.
 *
 * These are pure functions: no database, no network, no clock beyond what is
 * passed in. Everything the collector decides is decided here, which is what
 * makes the integration testable without a running Python backend.
 *
 * A note on time. The simulation measures everything in *simulated seconds*
 * since its world was seeded; it has no wall clock. So the timestamps stored
 * here are the moment this service observed the change, while the simulation's
 * own elapsed time is preserved separately in `actualSeconds`, which stays a
 * meaningful measure of response time.
 */

/** ml_backend mission.status -> web_backend mission.status */
const MISSION_STATUS = {
  pending: 'pending',
  assigned: 'assigned',
  en_route_scene: 'enroute',
  on_scene: 'onscene',
  transporting: 'transporting',
  completed: 'completed',
  cancelled: 'cancelled',
};

/** ml_backend unit.type -> web_backend vehicle.type */
const VEHICLE_TYPE = {
  ambulance: 'ambulance',
  firetruck: 'firetruck',
};

/** ml_backend disaster.type -> web_backend incident.kind */
const INCIDENT_KIND = {
  flood: 'flood',
  fire: 'fire',
  landslide: 'collapse',
  collapse: 'collapse',
  building_collapse: 'collapse',
  accident: 'accident',
  rta: 'accident',
  crash: 'accident',
};

/** mission.priority (1/2/3) -> web_backend priority label */
function toPriority(priority) {
  if (priority === 1) return 'p1';
  if (priority === 3) return 'p3';
  return 'p2';
}

/** disaster.severity (0..1) -> incident severity band */
function severityFromScore(score) {
  const value = typeof score === 'number' ? score : 0.5;
  if (value >= 0.75) return 'p1';
  if (value >= 0.4) return 'p2';
  return 'p3';
}

function isFinished(status) {
  return status === 'completed' || status === 'cancelled';
}

/**
 * Builds the mission record to store for a mission the simulation just
 * reported. `observedAt` is an ISO timestamp; `links` carries the ids this
 * service already resolved (vehicle, incident, hospital).
 */
function missionFromSim(mission, { observedAt, links = {} } = {}) {
  const legs = Array.isArray(mission.legs) ? mission.legs : [];
  const firstLeg = legs[0] || null;
  const status = MISSION_STATUS[mission.status] || 'pending';

  const distance = legs.reduce(
    (total, leg) => (typeof leg.distance === 'number' ? total + leg.distance : total),
    0,
  );

  // Response time as the simulation measured it: dispatch approval to completion,
  // in simulated seconds. Only meaningful once both ends exist.
  const actualSeconds =
    typeof mission.completedAt === 'number' && typeof mission.approvedAt === 'number'
      ? Math.max(0, mission.completedAt - mission.approvedAt)
      : null;

  return {
    simMissionId: mission.id,
    incidentId: links.incidentId ?? null,
    vehicleId: links.vehicleId ?? null,
    hospitalId: links.hospitalId ?? null,
    priority: toPriority(mission.priority),
    status,
    originNode: firstLeg && firstLeg.from ? firstLeg.from : null,
    destNode: mission.sceneNode || null,
    etaSeconds: firstLeg && typeof firstLeg.plannedEta === 'number' ? firstLeg.plannedEta : null,
    actualSeconds,
    distanceM: distance > 0 ? distance : null,
    notes: buildMissionNote(mission),
    dispatchedAt: mission.approvedAt != null ? observedAt : null,
    arrivedAt: mission.onSceneAt != null ? observedAt : null,
    completedAt: isFinished(status) ? observedAt : null,
  };
}

/** A short human-readable summary, since the simulation's own fields are terse. */
function buildMissionNote(mission) {
  const parts = [];
  if (mission.emergencyLabel) parts.push(mission.emergencyLabel);
  else if (mission.emergencyClass) parts.push(mission.emergencyClass);
  if (mission.service) parts.push(`${mission.service} service`);
  if (mission.unitId) parts.push(`unit ${mission.unitId}`);
  if (typeof mission.replans === 'number' && mission.replans > 0) {
    parts.push(`${mission.replans} replan${mission.replans === 1 ? '' : 's'}`);
  }
  if (mission.note) parts.push(mission.note);
  const summary = parts.join(' · ');
  return summary.length > 2000 ? summary.slice(0, 1997) + '...' : summary || null;
}

/** Builds the incident record for a disaster the simulation raised. */
function incidentFromSim(disaster, { observedAt, node = null } = {}) {
  return {
    simDisasterId: disaster.id,
    title: disaster.label || disaster.typeLabel || `${disaster.type} at ${disaster.node}`,
    kind: INCIDENT_KIND[disaster.type] || 'other',
    severity: severityFromScore(disaster.severity),
    status: 'open',
    description: disaster.note || null,
    lat: node && typeof node.lat === 'number' ? node.lat : null,
    lng: node && typeof node.lng === 'number' ? node.lng : null,
    nodeId: disaster.node || null,
    source: 'sim',
    confidence: typeof disaster.severity === 'number' ? clamp01(disaster.severity) : null,
    occurredAt: observedAt,
  };
}

/** Builds the vehicle record for a simulation unit seen for the first time. */
function vehicleFromSim(unit) {
  return {
    callsign: sanitiseCallsign(unit.id),
    type: VEHICLE_TYPE[unit.type] || 'ambulance',
    status: 'idle',
    registration: null,
    capacity: unit.type === 'firetruck' ? 6 : 2,
    homeHospitalId: null,
    simUnitId: unit.id,
  };
}

/** The callsign column only accepts letters, numbers, - and _. */
function sanitiseCallsign(id) {
  const cleaned = String(id || '').replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 32);
  return cleaned.length >= 2 ? cleaned : `UNIT-${cleaned}`;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

module.exports = {
  MISSION_STATUS,
  VEHICLE_TYPE,
  INCIDENT_KIND,
  toPriority,
  severityFromScore,
  isFinished,
  missionFromSim,
  incidentFromSim,
  vehicleFromSim,
  sanitiseCallsign,
};
