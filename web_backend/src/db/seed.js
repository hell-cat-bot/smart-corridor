'use strict';

/**
 * `npm run db:seed` - creates the admin account plus a small, realistic set of
 * demo data. Safe to run more than once: anything that already exists is left
 * alone rather than duplicated.
 */

const { db, migrate } = require('./connection');
const config = require('../config');
const userService = require('../services/user.service');
const hospitalService = require('../services/hospital.service');
const vehicleService = require('../services/vehicle.service');
const incidentService = require('../services/incident.service');
const missionService = require('../services/mission.service');

migrate();

function ensureUser({ name, email, password, role }) {
  const existing = userService.findRawByEmail(email);
  if (existing) {
    console.log(`user      ${email} (exists)`);
    return userService.toPublic(existing);
  }
  const user = userService.create({ name, email, password, role, isActive: true });
  console.log(`user      ${email} (created, role=${role})`);
  return user;
}

function ensureHospital(payload) {
  const existing = db.prepare('SELECT * FROM hospitals WHERE code = ?').get(payload.code);
  if (existing) {
    console.log(`hospital  ${payload.code} (exists)`);
    return hospitalService.toPublic(existing);
  }
  const hospital = hospitalService.create(payload);
  console.log(`hospital  ${payload.code} (created)`);
  return hospital;
}

function ensureVehicle(payload) {
  const existing = db.prepare('SELECT * FROM vehicles WHERE callsign = ?').get(payload.callsign);
  if (existing) {
    console.log(`vehicle   ${payload.callsign} (exists)`);
    return vehicleService.toPublic(existing);
  }
  const vehicle = vehicleService.create(payload);
  console.log(`vehicle   ${payload.callsign} (created)`);
  return vehicle;
}

// --- Accounts -------------------------------------------------------------

const admin = ensureUser({
  name: config.seedAdmin.name,
  email: config.seedAdmin.email.toLowerCase(),
  password: config.seedAdmin.password,
  role: 'admin',
});

ensureUser({
  name: 'Demo Dispatcher',
  email: 'dispatcher@packmen.local',
  password: 'dispatch12345',
  role: 'dispatcher',
});

ensureUser({
  name: 'Demo Viewer',
  email: 'viewer@packmen.local',
  password: 'viewer12345',
  role: 'viewer',
});

// --- Hospitals ------------------------------------------------------------

const cityGeneral = ensureHospital({
  name: 'City General Hospital',
  code: 'CGH',
  nodeId: null,
  lat: 22.5726,
  lng: 88.3639,
  phone: '+91-33-2200-0001',
  totalBeds: 220,
  availableBeds: 48,
  hasTraumaUnit: true,
});

const riverside = ensureHospital({
  name: 'Riverside Trauma Centre',
  code: 'RTC',
  nodeId: null,
  lat: 22.5850,
  lng: 88.3400,
  phone: '+91-33-2200-0002',
  totalBeds: 120,
  availableBeds: 21,
  hasTraumaUnit: true,
});

ensureHospital({
  name: 'Northgate Community Clinic',
  code: 'NCC',
  nodeId: null,
  lat: 22.6100,
  lng: 88.3800,
  phone: '+91-33-2200-0003',
  totalBeds: 60,
  availableBeds: 34,
  hasTraumaUnit: false,
});

// --- Fleet ----------------------------------------------------------------

const amb01 = ensureVehicle({
  callsign: 'AMB-01',
  type: 'ambulance',
  status: 'idle',
  registration: 'WB-01-AA-1101',
  capacity: 2,
  homeHospitalId: cityGeneral.id,
  simUnitId: null,
});

ensureVehicle({
  callsign: 'AMB-02',
  type: 'ambulance',
  status: 'idle',
  registration: 'WB-01-AA-1102',
  capacity: 2,
  homeHospitalId: riverside.id,
  simUnitId: null,
});

ensureVehicle({
  callsign: 'FIRE-01',
  type: 'firetruck',
  status: 'idle',
  registration: 'WB-01-FF-2201',
  capacity: 6,
  homeHospitalId: null,
  simUnitId: null,
});

ensureVehicle({
  callsign: 'POL-01',
  type: 'police',
  status: 'idle',
  registration: 'WB-01-PP-3301',
  capacity: 4,
  homeHospitalId: null,
  simUnitId: null,
});

// --- One sample incident and mission --------------------------------------

const existingIncidents = db.prepare('SELECT COUNT(*) AS total FROM incidents').get().total;

if (existingIncidents === 0) {
  const incident = incidentService.create(
    {
      title: 'Multi-vehicle collision on the bypass',
      kind: 'accident',
      severity: 'p1',
      status: 'dispatched',
      description: 'Two cars and a light truck. Reported by a traffic camera operator.',
      lat: 22.5790,
      lng: 88.3520,
      nodeId: null,
      source: 'manual',
      confidence: null,
      occurredAt: null,
    },
    admin.id,
  );
  console.log(`incident  ${incident.id} (created)`);

  const mission = missionService.create(
    {
      incidentId: incident.id,
      vehicleId: amb01.id,
      hospitalId: cityGeneral.id,
      simMissionId: null,
      priority: 'p1',
      status: 'assigned',
      originNode: null,
      destNode: null,
      etaSeconds: 420,
      distanceM: 3100,
      notes: 'Two casualties, one requires trauma care.',
      dispatchedAt: null,
    },
    admin.id,
  );
  console.log(`mission   ${mission.id} (created)`);
} else {
  console.log('incident  (skipped, incidents already present)');
}

console.log('\nSeed complete.');
console.log(`Admin login: ${config.seedAdmin.email} / ${config.seedAdmin.password}`);
