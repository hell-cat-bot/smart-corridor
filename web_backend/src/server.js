'use strict';

const app = require('./app');
const config = require('./config');
const { db, migrate } = require('./db/connection');
const authService = require('./services/auth.service');
const collector = require('./integration/mlCollector');

// Applying the schema on boot means a fresh clone just works: `npm start` is
// enough, and running the migration separately stays available for CI.
migrate();

// Housekeeping: drop refresh tokens that can no longer be used.
authService.pruneRefreshTokens();

const server = app.listen(config.port, config.host, () => {
  console.log(`PackMen web backend listening on http://${config.host}:${config.port}`);
  console.log(`Environment: ${config.nodeEnv}`);
  console.log(`Database:    ${config.databaseFile}`);
  console.log(`Simulation:  ${config.mlBackendUrl} (collector ${config.collector.enabled ? 'on' : 'off'})`);

  // Subscribe to the simulation once this service is actually accepting
  // traffic, so a slow or absent ml_backend never delays our own startup.
  collector.start();
});

/** Close the HTTP server and the database cleanly on Ctrl+C or a container stop. */
function shutdown(signal) {
  console.log(`\n${signal} received, shutting down...`);
  collector.stop();
  server.close(() => {
    db.close();
    process.exit(0);
  });
  // Do not hang forever if a connection refuses to close.
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  console.error('[fatal] unhandled promise rejection:', reason);
});

module.exports = server;
