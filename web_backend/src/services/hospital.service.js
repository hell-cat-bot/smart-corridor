'use strict';

const { db } = require('../db/connection');
const ApiError = require('../utils/ApiError');
const { newId, now, buildUpdate, toDbBool, fromDbBool } = require('../utils/helpers');
const { runGuarded, buildWhere } = require('../utils/sqlite');

function toPublic(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    nodeId: row.node_id,
    lat: row.lat,
    lng: row.lng,
    phone: row.phone,
    totalBeds: row.total_beds,
    availableBeds: row.available_beds,
    hasTraumaUnit: fromDbBool(row.has_trauma_unit),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function findById(id) {
  return toPublic(db.prepare('SELECT * FROM hospitals WHERE id = ?').get(id));
}

function getByIdOrFail(id) {
  const hospital = findById(id);
  if (!hospital) throw ApiError.notFound('Hospital not found');
  return hospital;
}

function list({ limit, offset, order, search, hasTraumaUnit }) {
  const like = search ? `%${search}%` : undefined;
  const trauma = hasTraumaUnit === undefined ? undefined : hasTraumaUnit === 'true' ? 1 : 0;

  const where = buildWhere([
    ['(name LIKE ? OR code LIKE ?)', like, like],
    ['has_trauma_unit = ?', trauma],
  ]);

  const rows = db
    .prepare(
      `SELECT * FROM hospitals ${where.clause}
       ORDER BY created_at ${order === 'asc' ? 'ASC' : 'DESC'}
       LIMIT ? OFFSET ?`,
    )
    .all(...where.values, limit, offset);

  const total = db
    .prepare(`SELECT COUNT(*) AS total FROM hospitals ${where.clause}`)
    .get(...where.values).total;

  return { items: rows.map(toPublic), total, limit, offset };
}

function create(payload) {
  const id = newId();
  const timestamp = now();

  runGuarded(
    () =>
      db
        .prepare(
          `INSERT INTO hospitals
             (id, name, code, node_id, lat, lng, phone,
              total_beds, available_beds, has_trauma_unit, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          payload.name,
          payload.code,
          payload.nodeId ?? null,
          payload.lat ?? null,
          payload.lng ?? null,
          payload.phone ?? null,
          payload.totalBeds,
          payload.availableBeds,
          toDbBool(payload.hasTraumaUnit),
          timestamp,
          timestamp,
        ),
    { unique: 'A hospital with that code already exists' },
  );

  return findById(id);
}

function update(id, payload) {
  const existing = getByIdOrFail(id);

  // Only one of the two bed counts may be sent; compare against what is stored.
  const totalBeds = payload.totalBeds ?? existing.totalBeds;
  const availableBeds = payload.availableBeds ?? existing.availableBeds;
  if (availableBeds > totalBeds) {
    throw ApiError.badRequest('availableBeds cannot exceed totalBeds', [
      { field: 'availableBeds', message: `must be <= totalBeds (${totalBeds})` },
    ]);
  }

  const fields = { ...payload };
  if (fields.hasTraumaUnit !== undefined) fields.hasTraumaUnit = toDbBool(fields.hasTraumaUnit);

  const patch = buildUpdate(fields, {
    name: 'name',
    code: 'code',
    nodeId: 'node_id',
    lat: 'lat',
    lng: 'lng',
    phone: 'phone',
    totalBeds: 'total_beds',
    availableBeds: 'available_beds',
    hasTraumaUnit: 'has_trauma_unit',
  });
  if (!patch) throw ApiError.badRequest('No fields to update');

  runGuarded(
    () =>
      db
        .prepare(`UPDATE hospitals SET ${patch.clause}, updated_at = ? WHERE id = ?`)
        .run(...patch.values, now(), id),
    { unique: 'A hospital with that code already exists' },
  );

  return findById(id);
}

function remove(id) {
  getByIdOrFail(id);
  // Vehicles and missions reference hospitals with ON DELETE SET NULL,
  // so removing a hospital never orphans a row.
  db.prepare('DELETE FROM hospitals WHERE id = ?').run(id);
}

module.exports = { toPublic, findById, getByIdOrFail, list, create, update, remove };
