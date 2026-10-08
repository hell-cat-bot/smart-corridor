'use strict';

const { db } = require('../db/connection');
const vehicleService = require('./vehicle.service');
const incidentService = require('./incident.service');
const missionService = require('./mission.service');

/** Turns a partial count map into a complete one, filling missing keys with 0. */
function fill(keys, counts) {
  return Object.fromEntries(keys.map((key) => [key, counts[key] || 0]));
}

const VEHICLE_STATUSES = ['idle', 'enroute', 'onscene', 'returning', 'offline'];
const INCIDENT_STATUSES = ['open', 'dispatched', 'resolved', 'cancelled'];
const MISSION_STATUSES = [
  'pending',
  'assigned',
  'enroute',
  'onscene',
  'transporting',
  'completed',
  'cancelled',
];

/** One request the dashboard can call to fill every summary card. */
function overview() {
  const totals = {
    users: db.prepare('SELECT COUNT(*) AS total FROM users').get().total,
    hospitals: db.prepare('SELECT COUNT(*) AS total FROM hospitals').get().total,
    vehicles: db.prepare('SELECT COUNT(*) AS total FROM vehicles').get().total,
    incidents: db.prepare('SELECT COUNT(*) AS total FROM incidents').get().total,
    missions: db.prepare('SELECT COUNT(*) AS total FROM missions').get().total,
  };

  const beds = db
    .prepare('SELECT COALESCE(SUM(total_beds), 0) AS total, COALESCE(SUM(available_beds), 0) AS available FROM hospitals')
    .get();

  const missionsByPriority = db
    .prepare("SELECT priority, COUNT(*) AS total FROM missions WHERE status NOT IN ('completed', 'cancelled') GROUP BY priority")
    .all();

  return {
    totals,
    beds: { total: beds.total, available: beds.available, occupied: beds.total - beds.available },
    vehiclesByStatus: fill(VEHICLE_STATUSES, vehicleService.countByStatus()),
    incidentsByStatus: fill(INCIDENT_STATUSES, incidentService.countByStatus()),
    missionsByStatus: fill(MISSION_STATUSES, missionService.countByStatus()),
    activeMissionsByPriority: fill(
      ['p1', 'p2', 'p3'],
      Object.fromEntries(missionsByPriority.map((row) => [row.priority, row.total])),
    ),
    averageResponseSeconds: missionService.averageResponseSeconds(),
    generatedAt: new Date().toISOString(),
  };
}

/** Missions and incidents created per day, newest day first. */
function daily(days) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const missions = db
    .prepare(
      `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS total
       FROM missions WHERE created_at >= ?
       GROUP BY day ORDER BY day DESC`,
    )
    .all(since);

  const incidents = db
    .prepare(
      `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS total
       FROM incidents WHERE created_at >= ?
       GROUP BY day ORDER BY day DESC`,
    )
    .all(since);

  return { since, days, missions, incidents };
}

module.exports = { overview, daily };
