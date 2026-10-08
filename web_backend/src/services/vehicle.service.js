'use strict';

const { db } = require('../db/connection');
const ApiError = require('../utils/ApiError');
const { newId, now, buildUpdate } = require('../utils/helpers');
const { runGuarded, buildWhere } = require('../utils/sqlite');

function toPublic(row) {
  if (!row) return null;
  return {
    id: row.id,
    callsign: row.callsign,
    type: row.type,
    status: row.status,
    registration: row.registration,
    capacity: row.capacity,
    homeHospitalId: row.home_hospital_id,
    homeHospitalName: row.home_hospital_name ?? undefined,
    simUnitId: row.sim_unit_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_WITH_HOSPITAL = `
  SELECT v.*, h.name AS home_hospital_name
  FROM vehicles v
  LEFT JOIN hospitals h ON h.id = v.home_hospital_id
`;

function findById(id) {
  return toPublic(db.prepare(`${SELECT_WITH_HOSPITAL} WHERE v.id = ?`).get(id));
}

function getByIdOrFail(id) {
  const vehicle = findById(id);
  if (!vehicle) throw ApiError.notFound('Vehicle not found');
  return vehicle;
}

function list({ limit = 50, offset = 0, order = 'desc', type, status, search } = {}) {
  const lim = Number.isInteger(Number(limit)) ? Number(limit) : 50;
  const off = Number.isInteger(Number(offset)) ? Number(offset) : 0;
  const like = search ? `%${search}%` : undefined;
  const where = buildWhere([
    ['v.type = ?', type],
    ['v.status = ?', status],
    ['(v.callsign LIKE ? OR v.registration LIKE ?)', like, like],
  ]);

  const rows = db
    .prepare(
      `${SELECT_WITH_HOSPITAL} ${where.clause}
       ORDER BY v.created_at ${order === 'asc' ? 'ASC' : 'DESC'}
       LIMIT ? OFFSET ?`,
    )
    .all(...where.values, lim, off);

  const total = db
    .prepare(`SELECT COUNT(*) AS total FROM vehicles v ${where.clause}`)
    .get(...where.values).total;

  return { items: rows.map(toPublic), total, limit: lim, offset: off };
}

function create(payload) {
  const id = newId();
  const timestamp = now();

  runGuarded(
    () =>
      db
        .prepare(
          `INSERT INTO vehicles
             (id, callsign, type, status, registration, capacity,
              home_hospital_id, sim_unit_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          payload.callsign,
          payload.type,
          payload.status,
          payload.registration ?? null,
          payload.capacity,
          payload.homeHospitalId ?? null,
          payload.simUnitId ?? null,
          timestamp,
          timestamp,
        ),
    {
      unique: 'A vehicle with that callsign already exists',
      foreignKey: 'homeHospitalId does not match any hospital',
    },
  );

  return findById(id);
}

function update(id, payload) {
  getByIdOrFail(id);

  const patch = buildUpdate(payload, {
    callsign: 'callsign',
    type: 'type',
    status: 'status',
    registration: 'registration',
    capacity: 'capacity',
    homeHospitalId: 'home_hospital_id',
    simUnitId: 'sim_unit_id',
  });
  if (!patch) throw ApiError.badRequest('No fields to update');

  runGuarded(
    () =>
      db
        .prepare(`UPDATE vehicles SET ${patch.clause}, updated_at = ? WHERE id = ?`)
        .run(...patch.values, now(), id),
    {
      unique: 'A vehicle with that callsign already exists',
      foreignKey: 'homeHospitalId does not match any hospital',
    },
  );

  return findById(id);
}

function setStatus(id, status) {
  getByIdOrFail(id);
  db.prepare('UPDATE vehicles SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), id);
  return findById(id);
}

function remove(id) {
  getByIdOrFail(id);

  const active = db
    .prepare(
      `SELECT COUNT(*) AS total FROM missions
       WHERE vehicle_id = ? AND status NOT IN ('completed', 'cancelled')`,
    )
    .get(id).total;

  if (active > 0) {
    throw ApiError.conflict(`Vehicle is assigned to ${active} active mission(s)`);
  }

  db.prepare('DELETE FROM vehicles WHERE id = ?').run(id);
}

function findBySimUnitId(simUnitId) {
  return toPublic(db.prepare(`${SELECT_WITH_HOSPITAL} WHERE v.sim_unit_id = ?`).get(simUnitId));
}

/**
 * Returns the vehicle for a simulation unit, registering it on first sight.
 *
 * A unit that appears in the simulation but has never been entered into the
 * fleet register would otherwise leave every mission it runs with no vehicle
 * attached. Matching is by `sim_unit_id` first, then by callsign, so a vehicle
 * an operator already created by hand gets linked rather than duplicated.
 */
function ensureFromSim(record) {
  const bySimId = findBySimUnitId(record.simUnitId);
  if (bySimId) return { vehicle: bySimId, created: false };

  const byCallsign = db.prepare('SELECT * FROM vehicles WHERE callsign = ?').get(record.callsign);
  if (byCallsign) {
    db.prepare('UPDATE vehicles SET sim_unit_id = ?, updated_at = ? WHERE id = ?').run(
      record.simUnitId,
      now(),
      byCallsign.id,
    );
    return { vehicle: findById(byCallsign.id), created: false };
  }

  return { vehicle: create(record), created: true };
}

/** Counts per status, e.g. { idle: 4, enroute: 2 }. Used by the stats endpoint. */
function countByStatus() {
  const rows = db.prepare('SELECT status, COUNT(*) AS total FROM vehicles GROUP BY status').all();
  return Object.fromEntries(rows.map((row) => [row.status, row.total]));
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
  findBySimUnitId,
  ensureFromSim,
};
