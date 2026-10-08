-- PackMen web backend schema.
-- Plain SQL, applied by `npm run db:migrate`. Every statement is idempotent
-- (IF NOT EXISTS), so running the migration twice is harmless.
--
-- Conventions used everywhere:
--   * ids are UUID strings
--   * timestamps are ISO-8601 UTC strings (e.g. 2026-09-15T10:30:00.000Z)
--   * booleans are INTEGER 0 / 1

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'viewer'
                CHECK (role IN ('admin', 'dispatcher', 'viewer')),
  is_active     INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);

CREATE TABLE IF NOT EXISTS hospitals (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  code            TEXT NOT NULL UNIQUE COLLATE NOCASE,
  node_id         TEXT,                       -- matching node in the simulation network
  lat             REAL,
  lng             REAL,
  phone           TEXT,
  total_beds      INTEGER NOT NULL DEFAULT 0 CHECK (total_beds >= 0),
  available_beds  INTEGER NOT NULL DEFAULT 0 CHECK (available_beds >= 0),
  has_trauma_unit INTEGER NOT NULL DEFAULT 0 CHECK (has_trauma_unit IN (0, 1)),
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vehicles (
  id               TEXT PRIMARY KEY,
  callsign         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  type             TEXT NOT NULL
                   CHECK (type IN ('ambulance', 'firetruck', 'police')),
  status           TEXT NOT NULL DEFAULT 'idle'
                   CHECK (status IN ('idle', 'enroute', 'onscene', 'returning', 'offline')),
  registration     TEXT,
  capacity         INTEGER NOT NULL DEFAULT 1 CHECK (capacity >= 0),
  home_hospital_id TEXT REFERENCES hospitals(id) ON DELETE SET NULL,
  sim_unit_id      TEXT,                      -- matching unit id in the simulation
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vehicles_status ON vehicles(status);
CREATE INDEX IF NOT EXISTS idx_vehicles_hospital ON vehicles(home_hospital_id);

CREATE TABLE IF NOT EXISTS incidents (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL
              CHECK (kind IN ('fire', 'flood', 'accident', 'collapse', 'medical', 'other')),
  severity    TEXT NOT NULL DEFAULT 'p2' CHECK (severity IN ('p1', 'p2', 'p3')),
  status      TEXT NOT NULL DEFAULT 'open'
              CHECK (status IN ('open', 'dispatched', 'resolved', 'cancelled')),
  title       TEXT NOT NULL,
  description TEXT,
  lat         REAL,
  lng         REAL,
  node_id     TEXT,
  -- where the report came from: a human, the ML detector, or the simulation
  source      TEXT NOT NULL DEFAULT 'manual'
              CHECK (source IN ('manual', 'ml', 'sim')),
  -- id of the same disaster inside the simulation, so the collector can
  -- re-import the same event without creating a duplicate row
  sim_disaster_id TEXT UNIQUE,
  confidence  REAL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  reported_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  occurred_at TEXT,
  resolved_at TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_source ON incidents(source);
CREATE INDEX IF NOT EXISTS idx_incidents_created ON incidents(created_at);

CREATE TABLE IF NOT EXISTS missions (
  id             TEXT PRIMARY KEY,
  incident_id    TEXT REFERENCES incidents(id) ON DELETE SET NULL,
  vehicle_id     TEXT REFERENCES vehicles(id) ON DELETE SET NULL,
  hospital_id    TEXT REFERENCES hospitals(id) ON DELETE SET NULL,
  sim_mission_id TEXT UNIQUE,                 -- id of the same mission inside the simulation
  priority       TEXT NOT NULL DEFAULT 'p2' CHECK (priority IN ('p1', 'p2', 'p3')),
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'assigned', 'enroute', 'onscene',
                                   'transporting', 'completed', 'cancelled')),
  origin_node    TEXT,
  dest_node      TEXT,
  eta_seconds    REAL CHECK (eta_seconds IS NULL OR eta_seconds >= 0),
  actual_seconds REAL CHECK (actual_seconds IS NULL OR actual_seconds >= 0),
  distance_m     REAL CHECK (distance_m IS NULL OR distance_m >= 0),
  notes          TEXT,
  dispatched_at  TEXT,
  arrived_at     TEXT,
  completed_at   TEXT,
  created_by     TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_missions_status ON missions(status);
CREATE INDEX IF NOT EXISTS idx_missions_vehicle ON missions(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_missions_incident ON missions(incident_id);
CREATE INDEX IF NOT EXISTS idx_missions_created ON missions(created_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id         TEXT PRIMARY KEY,
  user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,                   -- e.g. 'mission.create'
  entity     TEXT NOT NULL,                   -- e.g. 'mission'
  entity_id  TEXT,
  details    TEXT,                            -- JSON string, may be NULL
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity, entity_id);

CREATE TABLE IF NOT EXISTS citizen_reports (
  id              TEXT PRIMARY KEY,
  service         TEXT NOT NULL CHECK (service IN ('medical', 'fire')),
  emergency_class TEXT NOT NULL,
  emergency_label TEXT NOT NULL,
  priority        INTEGER NOT NULL DEFAULT 2 CHECK (priority IN (1, 2, 3)),
  scene_node      TEXT NOT NULL,
  scene_name      TEXT NOT NULL,
  note            TEXT,
  photo_data      TEXT,
  ml_assessment   TEXT,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'dispatched', 'cancelled')),
  dispatched_at   TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_citizen_reports_status ON citizen_reports(status);
CREATE INDEX IF NOT EXISTS idx_citizen_reports_created ON citizen_reports(created_at);
