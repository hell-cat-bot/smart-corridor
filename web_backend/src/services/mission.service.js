'use strict';

const { db } = require('../db/connection');
const ApiError = require('../utils/ApiError');
const { newId, now, buildUpdate } = require('../utils/helpers');
const { runGuarded, buildWhere } = require('../utils/sqlite');
const { STATUS_TRANSITIONS } = require('../validators/mission.schema');

/** Vehicle status that matches each mission status, or null to leave it alone. */
const VEHICLE_STATUS_FOR_MISSION = {
  pending: null,
  assigned: null,
  enroute: 'enroute',
  onscene: 'onscene',
  transporting: 'enroute',
  completed: 'idle',
  cancelled: 'idle',
};

function toPublic(row) {
  if (!row) return null;
  return {
    id: row.id,
    incidentId: row.incident_id,
    incidentTitle: row.incident_title ?? undefined,
    vehicleId: row.vehicle_id,
    vehicleCallsign: row.vehicle_callsign ?? undefined,
    hospitalId: row.hospital_id,
    hospitalName: row.hospital_name ?? undefined,
    simMissionId: row.sim_mission_id,
    priority: row.priority,
    status: row.status,
    originNode: row.origin_node,
    destNode: row.dest_node,
    etaSeconds: row.eta_seconds,
    actualSeconds: row.actual_seconds,
    distanceM: row.distance_m,
    notes: row.notes,
    dispatchedAt: row.dispatched_at,
    arrivedAt: row.arrived_at,
    completedAt: row.completed_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_JOINED = `
  SELECT m.*,
         i.title    AS incident_title,
         v.callsign AS vehicle_callsign,
         h.name     AS hospital_name
  FROM missions m
  LEFT JOIN incidents i ON i.id = m.incident_id
  LEFT JOIN vehicles  v ON v.id = m.vehicle_id
  LEFT JOIN hospitals h ON h.id = m.hospital_id
`;

function findById(id) {
  return toPublic(db.prepare(`${SELECT_JOINED} WHERE m.id = ?`).get(id));
}

function getByIdOrFail(id) {
  const mission = findById(id);
  if (!mission) throw ApiError.notFound('Mission not found');
  return mission;
}

function list({ limit = 50, offset = 0, order = 'desc', status, priority, vehicleId, incidentId } = {}) {
  const lim = Number.isInteger(Number(limit)) ? Number(limit) : 50;
  const off = Number.isInteger(Number(offset)) ? Number(offset) : 0;
  const where = buildWhere([
    ['m.status = ?', status],
    ['m.priority = ?', priority],
    ['m.vehicle_id = ?', vehicleId],
    ['m.incident_id = ?', incidentId],
  ]);

  const rows = db
    .prepare(
      `${SELECT_JOINED} ${where.clause}
       ORDER BY m.created_at ${order === 'asc' ? 'ASC' : 'DESC'}
       LIMIT ? OFFSET ?`,
    )
    .all(...where.values, lim, off);

  const total = db
    .prepare(`SELECT COUNT(*) AS total FROM missions m ${where.clause}`)
    .get(...where.values).total;

  return { items: rows.map(toPublic), total, limit: lim, offset: off };
}

function create(payload, createdBy = null) {
  if (payload.status !== 'pending' && !payload.vehicleId) {
    throw ApiError.badRequest('vehicleId is required unless the mission status is "pending"', [
      { field: 'vehicleId', message: 'required for a mission that is already assigned' },
    ]);
  }

  const id = newId();
  const timestamp = now();
  const dispatchedAt =
    payload.dispatchedAt ?? (payload.status === 'pending' || payload.status === 'assigned' ? null : timestamp);

  const insert = db.transaction(() => {
    runGuarded(
      () =>
        db
          .prepare(
            `INSERT INTO missions
               (id, incident_id, vehicle_id, hospital_id, sim_mission_id, priority, status,
                origin_node, dest_node, eta_seconds, actual_seconds, distance_m, notes,
                dispatched_at, arrived_at, completed_at, created_by, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, NULL, NULL, ?, ?, ?)`,
          )
          .run(
            id,
            payload.incidentId ?? null,
            payload.vehicleId ?? null,
            payload.hospitalId ?? null,
            payload.simMissionId ?? null,
            payload.priority,
            payload.status,
            payload.originNode ?? null,
            payload.destNode ?? null,
            payload.etaSeconds ?? null,
            payload.distanceM ?? null,
            payload.notes ?? null,
            dispatchedAt,
            createdBy,
            timestamp,
            timestamp,
          ),
      {
        unique: 'A mission with that simMissionId already exists',
        foreignKey: 'incidentId, vehicleId or hospitalId does not match an existing record',
      },
    );

    applyVehicleStatus(payload.vehicleId, payload.status, timestamp);
  });

  insert();
  return findById(id);
}

/** Mirrors the mission status onto its vehicle, when there is one. */
function applyVehicleStatus(vehicleId, missionStatus, timestamp) {
  if (!vehicleId) return;
  const vehicleStatus = VEHICLE_STATUS_FOR_MISSION[missionStatus];
  if (!vehicleStatus) return;
  db.prepare("UPDATE vehicles SET status = ?, updated_at = ? WHERE id = ? AND status != 'offline'").run(
    vehicleStatus,
    timestamp,
    vehicleId,
  );
}

function update(id, payload) {
  const existing = getByIdOrFail(id);
  if (existing.status === 'completed' || existing.status === 'cancelled') {
    throw ApiError.conflict(`A ${existing.status} mission can no longer be edited`);
  }

  const patch = buildUpdate(payload, {
    incidentId: 'incident_id',
    vehicleId: 'vehicle_id',
    hospitalId: 'hospital_id',
    priority: 'priority',
    originNode: 'origin_node',
    destNode: 'dest_node',
    etaSeconds: 'eta_seconds',
    actualSeconds: 'actual_seconds',
    distanceM: 'distance_m',
    notes: 'notes',
  });
  if (!patch) throw ApiError.badRequest('No fields to update');

  runGuarded(
    () =>
      db
        .prepare(`UPDATE missions SET ${patch.clause}, updated_at = ? WHERE id = ?`)
        .run(...patch.values, now(), id),
    { foreignKey: 'incidentId, vehicleId or hospitalId does not match an existing record' },
  );

  return findById(id);
}

/**
 * Moves a mission to the next status, refusing transitions that make no sense
 * (for example completed -> enroute) and filling in the matching timestamp.
 */
function setStatus(id, status) {
  const mission = getByIdOrFail(id);

  if (mission.status === status) return mission;

  const allowed = STATUS_TRANSITIONS[mission.status] || [];
  if (!allowed.includes(status)) {
    throw ApiError.conflict(
      `Cannot change status from "${mission.status}" to "${status}"` +
        (allowed.length ? `. Allowed: ${allowed.join(', ')}` : ' (this mission is finished)'),
    );
  }
  if (status !== 'cancelled' && !mission.vehicleId) {
    throw ApiError.badRequest('Assign a vehicle before moving this mission forward');
  }

  const timestamp = now();

  const apply = db.transaction(() => {
    db.prepare('UPDATE missions SET status = ?, updated_at = ? WHERE id = ?').run(status, timestamp, id);

    if (status === 'enroute') {
      db.prepare('UPDATE missions SET dispatched_at = COALESCE(dispatched_at, ?) WHERE id = ?').run(
        timestamp,
        id,
      );
    }
    if (status === 'onscene') {
      db.prepare('UPDATE missions SET arrived_at = COALESCE(arrived_at, ?) WHERE id = ?').run(timestamp, id);
    }
    if (status === 'completed') {
      db.prepare('UPDATE missions SET completed_at = COALESCE(completed_at, ?) WHERE id = ?').run(
        timestamp,
        id,
      );
      // Real elapsed time, measured from dispatch. Left null if it was never dispatched.
      const row = db.prepare('SELECT dispatched_at, completed_at FROM missions WHERE id = ?').get(id);
      if (row.dispatched_at) {
        const seconds = (new Date(row.completed_at) - new Date(row.dispatched_at)) / 1000;
        db.prepare('UPDATE missions SET actual_seconds = ? WHERE id = ?').run(Math.max(0, seconds), id);
      }
    }

    applyVehicleStatus(mission.vehicleId, status, timestamp);
  });

  apply();
  return findById(id);
}

function remove(id) {
  getByIdOrFail(id);
  db.prepare('DELETE FROM missions WHERE id = ?').run(id);
}

function findBySimId(simMissionId) {
  return toPublic(db.prepare(`${SELECT_JOINED} WHERE m.sim_mission_id = ?`).get(simMissionId));
}

/**
 * Records a mission the simulation owns.
 *
 * This deliberately bypasses the status state machine used by `setStatus`: the
 * simulation is the system of record for its own missions, so this service
 * mirrors whatever state it reports rather than second-guessing the order the
 * transitions arrived in. Keyed on `sim_mission_id`, so replaying the same
 * event updates the one row instead of creating another.
 *
 * Returns { mission, created }.
 */
function upsertFromSim(record) {
  const existing = db
    .prepare('SELECT id FROM missions WHERE sim_mission_id = ?')
    .get(record.simMissionId);
  const timestamp = now();

  if (existing) {
    // COALESCE keeps the first timestamp seen for each milestone, so a later
    // update never moves a dispatch or arrival time that was already recorded.
    db.prepare(
      `UPDATE missions SET
         incident_id    = COALESCE(?, incident_id),
         vehicle_id     = COALESCE(?, vehicle_id),
         hospital_id    = COALESCE(?, hospital_id),
         priority       = ?,
         status         = ?,
         origin_node    = COALESCE(?, origin_node),
         dest_node      = COALESCE(?, dest_node),
         eta_seconds    = COALESCE(?, eta_seconds),
         actual_seconds = COALESCE(?, actual_seconds),
         distance_m     = COALESCE(?, distance_m),
         notes          = COALESCE(?, notes),
         dispatched_at  = COALESCE(dispatched_at, ?),
         arrived_at     = COALESCE(arrived_at, ?),
         completed_at   = COALESCE(completed_at, ?),
         updated_at     = ?
       WHERE id = ?`,
    ).run(
      record.incidentId ?? null,
      record.vehicleId ?? null,
      record.hospitalId ?? null,
      record.priority,
      record.status,
      record.originNode ?? null,
      record.destNode ?? null,
      record.etaSeconds ?? null,
      record.actualSeconds ?? null,
      record.distanceM ?? null,
      record.notes ?? null,
      record.dispatchedAt ?? null,
      record.arrivedAt ?? null,
      record.completedAt ?? null,
      timestamp,
      existing.id,
    );
    return { mission: findById(existing.id), created: false };
  }

  const id = newId();
  db.prepare(
    `INSERT INTO missions
       (id, incident_id, vehicle_id, hospital_id, sim_mission_id, priority, status,
        origin_node, dest_node, eta_seconds, actual_seconds, distance_m, notes,
        dispatched_at, arrived_at, completed_at, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
  ).run(
    id,
    record.incidentId ?? null,
    record.vehicleId ?? null,
    record.hospitalId ?? null,
    record.simMissionId,
    record.priority,
    record.status,
    record.originNode ?? null,
    record.destNode ?? null,
    record.etaSeconds ?? null,
    record.actualSeconds ?? null,
    record.distanceM ?? null,
    record.notes ?? null,
    record.dispatchedAt ?? null,
    record.arrivedAt ?? null,
    record.completedAt ?? null,
    timestamp,
    timestamp,
  );

  return { mission: findById(id), created: true };
}

function countByStatus() {
  const rows = db.prepare('SELECT status, COUNT(*) AS total FROM missions GROUP BY status').all();
  return Object.fromEntries(rows.map((row) => [row.status, row.total]));
}

/** Average completion time in seconds, or null when nothing has completed yet. */
function averageResponseSeconds() {
  const row = db
    .prepare("SELECT AVG(actual_seconds) AS avg FROM missions WHERE status = 'completed' AND actual_seconds IS NOT NULL")
    .get();
  return row.avg === null ? null : Number(row.avg.toFixed(1));
}

module.exports = {
  toPublic,
  findById,
  getByIdOrFail,
  list,
  create,
  update,
  setStatus,
  remove,
  countByStatus,
  averageResponseSeconds,
  findBySimId,
  upsertFromSim,
};
