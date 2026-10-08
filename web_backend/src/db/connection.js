'use strict';

/**
 * One SQLite connection for the whole process.
 *
 * This uses `node:sqlite`, the driver built into Node itself (18.5+ / 20+ /
 * 22.5+ / 24). That means SQLite needs no `npm install`, no native compilation
 * and no Visual Studio build tools on Windows - the whole backend installs from
 * pure-JavaScript packages only.
 *
 * `node:sqlite` is synchronous: every query returns its result immediately and
 * throws on error. That removes a whole class of async bugs (unhandled promise
 * rejections, forgotten `await`) and is plenty fast for this workload.
 *
 * The thin wrapper below adds the three conveniences the app relies on:
 *   1. `db.pragma(...)`
 *   2. `db.transaction(fn)` - all-or-nothing writes
 *   3. constraint errors tagged with `SQLITE_CONSTRAINT_*` codes, so
 *      `utils/sqlite.js` can turn them into clean 409 / 400 responses
 */

const fs = require('fs');
const path = require('path');

// Some Node versions print "SQLite is an experimental feature" the moment
// node:sqlite is loaded. The API is shipped and stable enough for this app, and
// the line is pure console noise during a demo, so this one warning is filtered
// out - every other warning still comes through untouched.
const emitWarning = process.emitWarning;
process.emitWarning = function filtered(warning, ...rest) {
  const text = typeof warning === 'string' ? warning : warning && warning.message;
  if (/SQLite is an experimental feature/i.test(text || '')) return undefined;
  return emitWarning.call(process, warning, ...rest);
};

const { DatabaseSync } = require('node:sqlite');

process.emitWarning = emitWarning;

const config = require('../config');

/**
 * Tags a driver error with the constraint code the rest of the app checks.
 * SQLite reports these as extended result codes and in the message text; both
 * are checked so a change in either still classifies correctly.
 */
const CONSTRAINT_CODES = {
  1555: 'SQLITE_CONSTRAINT_PRIMARYKEY',
  2067: 'SQLITE_CONSTRAINT_UNIQUE',
  787: 'SQLITE_CONSTRAINT_FOREIGNKEY',
  275: 'SQLITE_CONSTRAINT_CHECK',
  1299: 'SQLITE_CONSTRAINT_NOTNULL',
};

function tagError(err) {
  if (!err || err.code === undefined) return err;

  const byNumber = CONSTRAINT_CODES[err.errcode];
  if (byNumber) {
    err.code = byNumber;
    return err;
  }

  const message = String(err.message || '');
  if (/UNIQUE constraint failed/i.test(message)) err.code = 'SQLITE_CONSTRAINT_UNIQUE';
  else if (/FOREIGN KEY constraint failed/i.test(message)) err.code = 'SQLITE_CONSTRAINT_FOREIGNKEY';
  else if (/CHECK constraint failed/i.test(message)) err.code = 'SQLITE_CONSTRAINT_CHECK';
  else if (/NOT NULL constraint failed/i.test(message)) err.code = 'SQLITE_CONSTRAINT_NOTNULL';

  return err;
}

/** Rows come back with a null prototype; copy them into ordinary objects. */
function toPlainObject(row) {
  return row === undefined || row === null ? row : Object.assign({}, row);
}

class Statement {
  constructor(statement) {
    this.statement = statement;
  }
  /** Returns { changes, lastInsertRowid }. */
  run(...params) {
    try { return this.statement.run(...params); } catch (err) { throw tagError(err); }
  }
  /** Returns the first row, or undefined. */
  get(...params) {
    try { return toPlainObject(this.statement.get(...params)); } catch (err) { throw tagError(err); }
  }
  /** Returns every row as an array. */
  all(...params) {
    try { return this.statement.all(...params).map(toPlainObject); } catch (err) { throw tagError(err); }
  }
}

class Connection {
  constructor(file) {
    this.database = new DatabaseSync(file);
    this.transactionDepth = 0;
  }

  prepare(sql) {
    try { return new Statement(this.database.prepare(sql)); } catch (err) { throw tagError(err); }
  }

  exec(sql) {
    try { this.database.exec(sql); } catch (err) { throw tagError(err); }
  }

  pragma(setting) {
    this.exec(`PRAGMA ${setting};`);
  }

  /**
   * Wraps a function so everything it writes either all lands or none does.
   *
   *   const save = db.transaction(() => { ... });
   *   save();
   *
   * A transaction started inside another one joins the outer transaction
   * instead of failing, so services are free to call each other.
   */
  transaction(fn) {
    const connection = this;
    return function runInTransaction(...args) {
      if (connection.transactionDepth > 0) return fn.apply(this, args);

      connection.transactionDepth += 1;
      connection.exec('BEGIN');
      try {
        const result = fn.apply(this, args);
        connection.exec('COMMIT');
        return result;
      } catch (err) {
        connection.exec('ROLLBACK');
        throw err;
      } finally {
        connection.transactionDepth -= 1;
      }
    };
  }

  close() {
    this.database.close();
  }
}

// Make sure the folder holding the database file exists.
fs.mkdirSync(path.dirname(config.databaseFile), { recursive: true });

const db = new Connection(config.databaseFile);

// WAL gives much better concurrent read performance and survives crashes well.
db.pragma('journal_mode = WAL');
// SQLite does NOT enforce foreign keys unless you ask it to, per connection.
db.pragma('foreign_keys = ON');

/**
 * Columns added to a table after it first shipped.
 *
 * `CREATE TABLE IF NOT EXISTS` does nothing to a table that already exists, so a
 * database created by an earlier version would silently miss a new column. Each
 * entry here is applied with `ALTER TABLE ... ADD COLUMN` only when the column
 * is genuinely absent, which keeps `npm run db:migrate` safe to re-run.
 */
const ADDED_COLUMNS = [
  { table: 'incidents', column: 'sim_disaster_id', definition: 'TEXT', unique: true },
  { table: 'citizen_reports', column: 'ml_assessment', definition: 'TEXT', unique: false },
];

function applyAddedColumns() {
  // Ensure legacy erroneous unique index on ml_assessment is dropped
  try {
    db.exec('DROP INDEX IF EXISTS idx_citizen_reports_ml_assessment;');
  } catch {
    // Ignore if not present
  }

  for (const { table, column, definition, unique } of ADDED_COLUMNS) {
    const existing = db.prepare(`PRAGMA table_info(${table})`).all();
    if (existing.length === 0) continue; // table not created yet
    if (!existing.some((c) => c.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
    }
    if (unique) {
      db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_${table}_${column} ON ${table}(${column});`);
    }
  }
}

/** Applies schema.sql and any later column additions. Safe to call repeatedly. */
function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(sql);
  applyAddedColumns();
}

module.exports = { db, migrate };
