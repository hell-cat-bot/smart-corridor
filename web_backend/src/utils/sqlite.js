'use strict';

const ApiError = require('./ApiError');

/**
 * Runs a write and converts SQLite constraint errors into clean HTTP errors.
 *
 *   runGuarded(() => stmt.run(...), {
 *     unique: 'A hospital with that code already exists',
 *     foreignKey: 'homeHospitalId does not exist',
 *   });
 */
function runGuarded(fn, messages = {}) {
  try {
    return fn();
  } catch (err) {
    const code = err && err.code;
    if (code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
      throw ApiError.conflict(messages.unique || 'That value is already taken');
    }
    if (code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
      throw ApiError.badRequest(messages.foreignKey || 'A referenced record does not exist');
    }
    if (code === 'SQLITE_CONSTRAINT_CHECK' || code === 'SQLITE_CONSTRAINT_NOTNULL') {
      throw ApiError.badRequest(messages.check || 'A field has an invalid value');
    }
    throw err;
  }
}

/**
 * Builds `WHERE` from a list of `[condition, value]` pairs, skipping any pair
 * whose value is undefined. Returns a ready-to-use clause and parameter array.
 */
function buildWhere(conditions) {
  const clauses = [];
  const values = [];

  for (const [clause, ...params] of conditions) {
    if (params.some((param) => param === undefined)) continue;
    clauses.push(clause);
    values.push(...params);
  }

  return {
    clause: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    values,
  };
}

module.exports = { runGuarded, buildWhere };
