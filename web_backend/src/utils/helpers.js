'use strict';

const crypto = require('crypto');

/** New unique id. Node has this built in, so no uuid dependency is needed. */
function newId() {
  return crypto.randomUUID();
}

/** Current time as an ISO-8601 UTC string - the format stored in every table. */
function now() {
  return new Date().toISOString();
}

/**
 * Builds an `UPDATE` SET clause from only the fields the caller actually sent.
 * Returns null when there is nothing to update.
 *
 *   buildUpdate({ name: 'X', role: undefined }, { name: 'name', role: 'role' })
 *   -> { clause: 'name = ?', values: ['X'] }
 *
 * @param {object} payload validated request body
 * @param {Record<string, string>} columnMap payload key -> database column
 */
function buildUpdate(payload, columnMap) {
  const parts = [];
  const values = [];

  for (const [key, column] of Object.entries(columnMap)) {
    if (Object.prototype.hasOwnProperty.call(payload, key) && payload[key] !== undefined) {
      parts.push(`${column} = ?`);
      values.push(payload[key]);
    }
  }

  if (parts.length === 0) return null;
  return { clause: parts.join(', '), values };
}

/** SQLite has no boolean type: convert to 0 / 1, leaving undefined alone. */
function toDbBool(value) {
  if (value === undefined || value === null) return value;
  return value ? 1 : 0;
}

/** Converts 0 / 1 back into a real boolean for JSON responses. */
function fromDbBool(value) {
  if (value === undefined || value === null) return value;
  return Boolean(value);
}

module.exports = { newId, now, buildUpdate, toDbBool, fromDbBool };
