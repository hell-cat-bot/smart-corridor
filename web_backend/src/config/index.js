'use strict';

/**
 * All environment configuration is read in exactly one place, so the rest of the
 * code never touches `process.env` directly. Every value has a safe default so
 * the server boots with no `.env` file at all.
 */

const path = require('path');
const dotenv = require('dotenv');

// Load .env from the project root (one level above src/config).
const ROOT_DIR = path.resolve(__dirname, '..', '..');
dotenv.config({ path: path.join(ROOT_DIR, '.env') });

function str(name, fallback) {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function int(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a number, got "${raw}"`);
  }
  return parsed;
}

function bool(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const normalised = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalised)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalised)) return false;
  throw new Error(`Environment variable ${name} must be true or false, got "${raw}"`);
}

function list(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return raw.split(',').map((item) => item.trim()).filter(Boolean);
}

const nodeEnv = str('NODE_ENV', 'development');
const jwtSecret = str('JWT_SECRET', 'packmen-dev-secret-change-me');

if (nodeEnv === 'production' && jwtSecret === 'packmen-dev-secret-change-me') {
  throw new Error('JWT_SECRET must be set to a real secret when NODE_ENV=production');
}

const config = {
  rootDir: ROOT_DIR,
  nodeEnv,
  isProduction: nodeEnv === 'production',
  isTest: nodeEnv === 'test',

  host: str('HOST', '0.0.0.0'),
  port: int('PORT', 4000),

  // `['*']` means "allow any origin".
  corsOrigins: list('CORS_ORIGIN', ['*']),

  databaseFile: path.resolve(ROOT_DIR, str('DATABASE_FILE', 'data/packmen.db')),

  jwtSecret,
  accessTokenTtl: str('ACCESS_TOKEN_TTL', '15m'),
  refreshTokenTtlDays: int('REFRESH_TOKEN_TTL_DAYS', 7),
  bcryptRounds: int('BCRYPT_ROUNDS', 10),

  seedAdmin: {
    email: str('SEED_ADMIN_EMAIL', 'admin@packmen.local'),
    password: str('SEED_ADMIN_PASSWORD', 'admin12345'),
    name: str('SEED_ADMIN_NAME', 'PackMen Admin'),
  },

  // --- the simulation backend, and the collector that mirrors it ---
  mlBackendUrl: str('ML_BACKEND_URL', 'http://localhost:8000'),

  collector: {
    // Off during tests so the suite never reaches for a real backend.
    enabled: bool('COLLECTOR_ENABLED', nodeEnv !== 'test'),
    autoRegisterVehicles: bool('COLLECTOR_AUTO_REGISTER_VEHICLES', true),
    reconnectBaseMs: int('COLLECTOR_RECONNECT_BASE_MS', 1000),
    reconnectMaxMs: int('COLLECTOR_RECONNECT_MAX_MS', 30000),
    requestTimeoutMs: int('COLLECTOR_REQUEST_TIMEOUT_MS', 5000),
  },
};

module.exports = config;
