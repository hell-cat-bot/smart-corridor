'use strict';

/**
 * `npm run db:reset` - deletes every row but keeps the tables.
 * Handy before a demo. It does NOT delete the database file.
 */

const { db, migrate } = require('./connection');

migrate();

const TABLES = ['audit_logs', 'missions', 'incidents', 'vehicles', 'hospitals', 'refresh_tokens', 'users'];

const clear = db.transaction(() => {
  for (const table of TABLES) {
    db.prepare(`DELETE FROM ${table}`).run();
  }
});

clear();

console.log(`Cleared: ${TABLES.join(', ')}`);
console.log('Run `npm run db:seed` to recreate the admin account and demo data.');
