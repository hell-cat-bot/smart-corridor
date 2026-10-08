'use strict';

const { db } = require('../db/connection');
const { newId, now } = require('../utils/helpers');
const { buildWhere } = require('../utils/sqlite');

/**
 * Append-only trail of who changed what. Recording an audit entry must never
 * break the request that triggered it, so failures are logged and swallowed.
 */
function record({ userId = null, action, entity, entityId = null, details = null }) {
  try {
    db.prepare(
      `INSERT INTO audit_logs (id, user_id, action, entity, entity_id, details, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(newId(), userId, action, entity, entityId, details ? JSON.stringify(details) : null, now());
  } catch (err) {
    console.error('[audit] failed to record entry:', err.message);
  }
}

function toPublic(row) {
  if (!row) return null;
  let details = null;
  if (row.details) {
    try {
      details = JSON.parse(row.details);
    } catch {
      details = row.details;
    }
  }
  return {
    id: row.id,
    userId: row.user_id,
    action: row.action,
    entity: row.entity,
    entityId: row.entity_id,
    details,
    createdAt: row.created_at,
  };
}

function list({ limit, offset, order, entity, entityId, userId }) {
  const where = buildWhere([
    ['entity = ?', entity],
    ['entity_id = ?', entityId],
    ['user_id = ?', userId],
  ]);

  const rows = db
    .prepare(
      `SELECT * FROM audit_logs ${where.clause}
       ORDER BY created_at ${order === 'asc' ? 'ASC' : 'DESC'}
       LIMIT ? OFFSET ?`,
    )
    .all(...where.values, limit, offset);

  const total = db
    .prepare(`SELECT COUNT(*) AS total FROM audit_logs ${where.clause}`)
    .get(...where.values).total;

  return { items: rows.map(toPublic), total, limit, offset };
}

module.exports = { record, list };
