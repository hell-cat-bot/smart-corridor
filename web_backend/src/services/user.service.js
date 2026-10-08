'use strict';

const { db } = require('../db/connection');
const ApiError = require('../utils/ApiError');
const { newId, now, buildUpdate, toDbBool, fromDbBool } = require('../utils/helpers');
const { runGuarded, buildWhere } = require('../utils/sqlite');
const { hashPassword } = require('../utils/password');

const COLUMNS = `id, name, email, role, is_active, created_at, updated_at`;

/** Database row -> API object. The password hash never leaves this module. */
function toPublic(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    isActive: fromDbBool(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function findById(id) {
  const row = db.prepare(`SELECT ${COLUMNS} FROM users WHERE id = ?`).get(id);
  return toPublic(row);
}

/** Returns the raw row including `password_hash`. Only auth.service should use it. */
function findRawByEmail(email) {
  return db.prepare(`SELECT * FROM users WHERE email = ?`).get(email);
}

function findRawById(id) {
  return db.prepare(`SELECT * FROM users WHERE id = ?`).get(id);
}

function getByIdOrFail(id) {
  const user = findById(id);
  if (!user) throw ApiError.notFound('User not found');
  return user;
}

function count() {
  return db.prepare('SELECT COUNT(*) AS total FROM users').get().total;
}

function list({ limit, offset, order, role, search }) {
  const like = search ? `%${search}%` : undefined;
  const where = buildWhere([
    ['role = ?', role],
    ['(name LIKE ? OR email LIKE ?)', like, like],
  ]);

  const rows = db
    .prepare(
      `SELECT ${COLUMNS} FROM users ${where.clause}
       ORDER BY created_at ${order === 'asc' ? 'ASC' : 'DESC'}
       LIMIT ? OFFSET ?`,
    )
    .all(...where.values, limit, offset);

  const total = db
    .prepare(`SELECT COUNT(*) AS total FROM users ${where.clause}`)
    .get(...where.values).total;

  return { items: rows.map(toPublic), total, limit, offset };
}

function create({ name, email, password, role = 'viewer', isActive = true }) {
  const timestamp = now();
  const id = newId();

  runGuarded(
    () =>
      db
        .prepare(
          `INSERT INTO users (id, name, email, password_hash, role, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(id, name, email, hashPassword(password), role, toDbBool(isActive), timestamp, timestamp),
    { unique: 'An account with that email already exists' },
  );

  return findById(id);
}

function update(id, payload) {
  getByIdOrFail(id);

  const fields = { ...payload };
  if (fields.password !== undefined) {
    fields.passwordHash = hashPassword(fields.password);
    delete fields.password;
  }
  if (fields.isActive !== undefined) {
    fields.isActive = toDbBool(fields.isActive);
  }

  const update = buildUpdate(fields, {
    name: 'name',
    email: 'email',
    role: 'role',
    isActive: 'is_active',
    passwordHash: 'password_hash',
  });
  if (!update) throw ApiError.badRequest('No fields to update');

  runGuarded(
    () =>
      db
        .prepare(`UPDATE users SET ${update.clause}, updated_at = ? WHERE id = ?`)
        .run(...update.values, now(), id),
    { unique: 'An account with that email already exists' },
  );

  return findById(id);
}

function remove(id) {
  getByIdOrFail(id);
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
}

module.exports = {
  toPublic,
  findById,
  findRawById,
  findRawByEmail,
  getByIdOrFail,
  count,
  list,
  create,
  update,
  remove,
};
