'use strict';

const { db } = require('../db/connection');
const ApiError = require('../utils/ApiError');
const { newId, now, buildUpdate } = require('../utils/helpers');
const { runGuarded, buildWhere } = require('../utils/sqlite');

function toPublic(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    severity: row.severity,
    status: row.status,
    description: row.description,
    lat: row.lat,
    lng: row.lng,
    nodeId: row.node_id,
    source: row.source,
    simDisasterId: row.sim_disaster_id ?? null,
    confidence: row.confidence,
    reportedBy: row.reported_by,
    occurredAt: row.occurred_at,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function findById(id) {
  return toPublic(db.prepare('SELECT * FROM incidents WHERE id = ?').get(id));
}

function getByIdOrFail(id) {
  const incident = findById(id);
  if (!incident) throw ApiError.notFound('Incident not found');
  return incident;
}

function list({ limit = 50, offset = 0, order = 'desc', status, kind, severity, source, search } = {}) {
  const lim = Number.isInteger(Number(limit)) ? Number(limit) : 50;
  const off = Number.isInteger(Number(offset)) ? Number(offset) : 0;
  const like = search ? `%${search}%` : undefined;
  const where = buildWhere([
    ['status = ?', status],
    ['kind = ?', kind],
    ['severity = ?', severity],
    ['source = ?', source],
    ['(title LIKE ? OR description LIKE ?)', like, like],
  ]);

  const rows = db
    .prepare(
      `SELECT * FROM incidents ${where.clause}
       ORDER BY created_at ${order === 'asc' ? 'ASC' : 'DESC'}
       LIMIT ? OFFSET ?`,
    )
    .all(...where.values, lim, off);

  const total = db
    .prepare(`SELECT COUNT(*) AS total FROM incidents ${where.clause}`)
    .get(...where.values).total;

  return { items: rows.map(toPublic), total, limit: lim, offset: off };
}

function create(payload, reportedBy = null) {
  const id = newId();
  const timestamp = now();

  runGuarded(() =>
    db
      .prepare(
        `INSERT INTO incidents
           (id, kind, severity, status, title, description, lat, lng, node_id,
            source, confidence, reported_by, occurred_at, resolved_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      )
      .run(
        id,
        payload.kind,
        payload.severity,
        payload.status,
        payload.title,
        payload.description ?? null,
        payload.lat ?? null,
        payload.lng ?? null,
        payload.nodeId ?? null,
        payload.source,
        payload.confidence ?? null,
        reportedBy,
        payload.occurredAt ?? timestamp,
        timestamp,
        timestamp,
      ),
  );

  return findById(id);
}

function update(id, payload) {
  getByIdOrFail(id);

  const patch = buildUpdate(payload, {
    title: 'title',
    kind: 'kind',
    severity: 'severity',
    status: 'status',
    description: 'description',
    lat: 'lat',
    lng: 'lng',
    nodeId: 'node_id',
    confidence: 'confidence',
    occurredAt: 'occurred_at',
  });
  if (!patch) throw ApiError.badRequest('No fields to update');

  runGuarded(() =>
    db
      .prepare(`UPDATE incidents SET ${patch.clause}, updated_at = ? WHERE id = ?`)
      .run(...patch.values, now(), id),
  );

  // Keep resolved_at in step with the status whenever the status was part of the patch.
  if (payload.status === 'resolved') {
    db.prepare('UPDATE incidents SET resolved_at = COALESCE(resolved_at, ?) WHERE id = ?').run(now(), id);
  } else if (payload.status !== undefined) {
    db.prepare('UPDATE incidents SET resolved_at = NULL WHERE id = ?').run(id);
  }

  return findById(id);
}

function resolve(id) {
  const incident = getByIdOrFail(id);
  if (incident.status === 'resolved') return incident;

  const timestamp = now();
  db.prepare(
    "UPDATE incidents SET status = 'resolved', resolved_at = ?, updated_at = ? WHERE id = ?",
  ).run(timestamp, timestamp, id);

  return findById(id);
}

function remove(id) {
  getByIdOrFail(id);
  db.prepare('DELETE FROM incidents WHERE id = ?').run(id);
}

function countByStatus() {
  const rows = db.prepare('SELECT status, COUNT(*) AS total FROM incidents GROUP BY status').all();
  return Object.fromEntries(rows.map((row) => [row.status, row.total]));
}

function findBySimId(simDisasterId) {
  return toPublic(db.prepare('SELECT * FROM incidents WHERE sim_disaster_id = ?').get(simDisasterId));
}

/**
 * Records a disaster raised inside the simulation as an incident here, keyed on
 * `sim_disaster_id` so the same event is never stored twice.
 *
 * Returns { incident, created }.
 */
function upsertFromSim(record) {
  const existing = db
    .prepare('SELECT id FROM incidents WHERE sim_disaster_id = ?')
    .get(record.simDisasterId);
  const timestamp = now();

  if (existing) {
    db.prepare(
      `UPDATE incidents SET
         title = ?, kind = ?, severity = ?, description = COALESCE(?, description),
         lat = COALESCE(?, lat), lng = COALESCE(?, lng), node_id = COALESCE(?, node_id),
         confidence = COALESCE(?, confidence), updated_at = ?
       WHERE id = ?`,
    ).run(
      record.title,
      record.kind,
      record.severity,
      record.description ?? null,
      record.lat ?? null,
      record.lng ?? null,
      record.nodeId ?? null,
      record.confidence ?? null,
      timestamp,
      existing.id,
    );
    return { incident: findById(existing.id), created: false };
  }

  const id = newId();
  db.prepare(
    `INSERT INTO incidents
       (id, kind, severity, status, title, description, lat, lng, node_id,
        source, sim_disaster_id, confidence, reported_by, occurred_at, resolved_at,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?, ?)`,
  ).run(
    id,
    record.kind,
    record.severity,
    record.status || 'open',
    record.title,
    record.description ?? null,
    record.lat ?? null,
    record.lng ?? null,
    record.nodeId ?? null,
    record.source || 'sim',
    record.simDisasterId,
    record.confidence ?? null,
    record.occurredAt ?? timestamp,
    timestamp,
    timestamp,
  );

  return { incident: findById(id), created: true };
}

/** The simulation cleared a blockage: close the incident it opened. */
function resolveBySimId(simDisasterId) {
  const existing = db
    .prepare("SELECT id FROM incidents WHERE sim_disaster_id = ? AND status != 'resolved'")
    .get(simDisasterId);
  if (!existing) return null;

  const timestamp = now();
  db.prepare(
    "UPDATE incidents SET status = 'resolved', resolved_at = ?, updated_at = ? WHERE id = ?",
  ).run(timestamp, timestamp, existing.id);
  return findById(existing.id);
}

module.exports = {
  toPublic,
  findById,
  getByIdOrFail,
  list,
  create,
  update,
  resolve,
  remove,
  countByStatus,
  findBySimId,
  upsertFromSim,
  resolveBySimId,
};
