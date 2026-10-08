'use strict';

/** `npm run db:migrate` - creates every table and index. */

const { db, migrate } = require('./connection');
const config = require('../config');

migrate();

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
  .all()
  .map((row) => row.name);

console.log(`Database ready at ${config.databaseFile}`);
console.log(`Tables: ${tables.join(', ')}`);
