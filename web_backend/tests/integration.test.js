'use strict';

/**
 * Integration test - `npm run test:integration`.
 *
 * Runs the real collector against a stand-in ml_backend and checks that the
 * simulation's missions and disasters land in this database correctly, exactly
 * once, with the right links between them.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const TEST_DB = path.join(__dirname, 'integration.test.db');
process.env.NODE_ENV = 'test';
process.env.DATABASE_FILE = path.relative(path.join(__dirname, '..'), TEST_DB);
process.env.JWT_SECRET = 'integration-test-secret';
process.env.COLLECTOR_ENABLED = 'true';
process.env.COLLECTOR_RECONNECT_BASE_MS = '50';

for (const suffix of ['', '-wal', '-shm', '-journal']) {
  fs.rmSync(`${TEST_DB}${suffix}`, { force: true });
}

const { createFakeSimBackend } = require('./fakeSimBackend');

let passed = 0;
const failures = [];

async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (err) {
    failures.push({ name, err });
    console.log(`  FAIL ${name}\n       ${err.message}`);
  }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Polls until `fn()` returns something truthy, or gives up. */
async function until(fn, { timeout = 4000, interval = 25 } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = fn();
    if (value) return value;
    if (Date.now() > deadline) return null;
    await wait(interval);
  }
}

/* ------------------------------------------------------------- sim payloads */

const NODES = [
  { id: 'N1', lat: 22.57, lng: 88.36, name: 'Central crossing', degree: 4, congestion: 0.1 },
  { id: 'N2', lat: 22.58, lng: 88.34, name: 'River gate', degree: 3, congestion: 0.2 },
];

const UNIT = {
  id: 'AMB-01',
  label: 'Ambulance Alpha',
  type: 'ambulance',
  service: 'medical',
  node: 'N1',
  pos: { lat: 22.57, lng: 88.36 },
};

const DISASTER = {
  id: 'DIS-1',
  type: 'flood',
  typeLabel: 'Flood',
  node: 'N2',
  severity: 0.85,
  note: 'Underpass submerged',
  label: 'Flood at River gate',
  simTime: 16,
  timestamp: '2026-09-15T10:00:00Z',
};

function mission(overrides = {}) {
  return {
    id: 'M-1',
    service: 'medical',
    emergencyClass: 'cardiac',
    emergencyLabel: 'Cardiac arrest',
    priority: 1,
    sceneNode: 'N2',
    status: 'pending',
    unitId: null,
    legs: [],
    createdAt: 10,
    replans: 0,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ the run */

async function run() {
  console.log('\nPackMen web backend - simulation integration test\n');

  const fake = createFakeSimBackend({ nodes: NODES, units: [UNIT], missions: [], disasters: [] });
  const port = await fake.listen();
  process.env.ML_BACKEND_URL = `http://127.0.0.1:${port}`;

  // Required after ML_BACKEND_URL is known, since config reads the environment once.
  const { db, migrate } = require('../src/db/connection');
  migrate();
  const collector = require('../src/integration/mlCollector');
  const missionService = require('../src/services/mission.service');
  const incidentService = require('../src/services/incident.service');
  const vehicleService = require('../src/services/vehicle.service');

  console.log('connection');
  collector.start();

  await check('the collector connects to the simulation stream', async () => {
    const connected = await until(() => collector.getState().status === 'connected');
    assert.ok(connected, `never connected (status: ${collector.getState().status})`);
    assert.strictEqual(fake.clientCount(), 1);
  });

  await check('the snapshot registers the fleet it finds', async () => {
    const vehicle = await until(() => vehicleService.findBySimUnitId('AMB-01'));
    assert.ok(vehicle, 'AMB-01 was never registered');
    assert.strictEqual(vehicle.callsign, 'AMB-01');
    assert.strictEqual(vehicle.type, 'ambulance');
  });

  console.log('\ndisasters -> incidents');
  await check('a disaster becomes an incident with coordinates from the node', async () => {
    fake.send({ type: 'disaster.created', disaster: DISASTER });
    const incident = await until(() => incidentService.findBySimId('DIS-1'));
    assert.ok(incident, 'incident was never created');
    assert.strictEqual(incident.kind, 'flood');
    assert.strictEqual(incident.severity, 'p1', 'severity 0.85 maps to p1');
    assert.strictEqual(incident.status, 'open');
    assert.strictEqual(incident.source, 'sim');
    assert.strictEqual(incident.nodeId, 'N2');
    assert.strictEqual(incident.lat, 22.58, 'coordinates came from the node list');
  });

  await check('the same disaster arriving twice does not create a second incident', async () => {
    fake.send({ type: 'disaster.created', disaster: DISASTER });
    await wait(150);
    const total = db.prepare("SELECT COUNT(*) AS n FROM incidents WHERE sim_disaster_id = 'DIS-1'").get().n;
    assert.strictEqual(total, 1);
  });

  console.log('\nmissions');
  await check('a pending mission is recorded', async () => {
    fake.send({ type: 'mission.created', mission: mission() });
    const stored = await until(() => missionService.findBySimId('M-1'));
    assert.ok(stored, 'mission was never created');
    assert.strictEqual(stored.status, 'pending');
    assert.strictEqual(stored.priority, 'p1', 'numeric priority 1 maps to p1');
    assert.strictEqual(stored.destNode, 'N2');
    assert.strictEqual(stored.vehicleId, null, 'no unit assigned yet');
  });

  await check('assignment links the mission to the registered vehicle', async () => {
    fake.send({
      type: 'mission.updated',
      mission: mission({
        status: 'en_route_scene',
        unitId: 'AMB-01',
        approvedAt: 12,
        legs: [{ type: 'to_scene', from: 'N1', to: 'N2', distance: 2400, plannedEta: 300 }],
      }),
    });

    const linked = await until(() => {
      const m = missionService.findBySimId('M-1');
      return m && m.vehicleId ? m : null;
    });
    assert.ok(linked, 'mission never picked up a vehicle');
    assert.strictEqual(linked.status, 'enroute', 'en_route_scene maps to enroute');
    assert.strictEqual(linked.vehicleCallsign, 'AMB-01');
    assert.strictEqual(linked.etaSeconds, 300);
    assert.strictEqual(linked.distanceM, 2400);
    assert.ok(linked.dispatchedAt, 'dispatchedAt was stamped');
  });

  await check('completion stores the response time the simulation measured', async () => {
    fake.send({
      type: 'mission.updated',
      mission: mission({
        status: 'completed',
        unitId: 'AMB-01',
        approvedAt: 12,
        onSceneAt: 260,
        completedAt: 540,
        legs: [
          { type: 'to_scene', from: 'N1', to: 'N2', distance: 2400, plannedEta: 300 },
          { type: 'to_hospital', from: 'N2', to: 'N1', distance: 2600, plannedEta: 280 },
        ],
      }),
    });

    const done = await until(() => {
      const m = missionService.findBySimId('M-1');
      return m && m.status === 'completed' ? m : null;
    });
    assert.ok(done, 'mission never completed');
    assert.strictEqual(done.actualSeconds, 528, 'completedAt 540 - approvedAt 12');
    assert.strictEqual(done.distanceM, 5000, 'both legs summed');
    assert.ok(done.completedAt, 'completedAt was stamped');
  });

  await check('all those updates produced exactly one mission row', async () => {
    const total = db.prepare("SELECT COUNT(*) AS n FROM missions WHERE sim_mission_id = 'M-1'").get().n;
    assert.strictEqual(total, 1);
  });

  await check('a mission raised by a disaster is linked to that incident', async () => {
    fake.send({
      type: 'mission.created',
      mission: mission({ id: 'M-2', sourceDisasterId: 'DIS-1', priority: 2, sceneNode: 'N2' }),
    });
    const linked = await until(() => {
      const m = missionService.findBySimId('M-2');
      return m && m.incidentId ? m : null;
    });
    assert.ok(linked, 'mission was never linked to its incident');
    assert.strictEqual(linked.incidentTitle, 'Flood at River gate');
    assert.strictEqual(linked.priority, 'p2');
  });

  console.log('\nclearing and resilience');
  await check('clearing a disaster resolves its incident', async () => {
    fake.send({ type: 'disaster.cleared', disasterId: 'DIS-1' });
    const resolved = await until(() => {
      const i = incidentService.findBySimId('DIS-1');
      return i && i.status === 'resolved' ? i : null;
    });
    assert.ok(resolved, 'incident was never resolved');
    assert.ok(resolved.resolvedAt, 'resolvedAt was stamped');
  });

  await check('ticks and unknown message types are ignored, not stored', async () => {
    const before = db.prepare('SELECT COUNT(*) AS n FROM missions').get().n;
    fake.send({ type: 'tick', simTime: 50, tick: 500, units: [], lights: {}, nodes: NODES });
    fake.send({ type: 'metrics', metrics: { replans: 3 } });
    fake.send({ type: 'log', entries: [{ id: 'L1', message: 'hello' }] });
    fake.send({ type: 'something.new', payload: {} });
    await wait(200);
    assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM missions').get().n, before);
  });

  await check('a malformed frame is counted, not fatal', async () => {
    const before = collector.getState().counts.errors;
    collector.handleMessage('{not json');
    assert.strictEqual(collector.getState().counts.errors, before + 1);
    assert.strictEqual(collector.getState().status, 'connected', 'still connected afterwards');
  });

  await check('the collector reconnects after the simulation drops', async () => {
    fake.close();
    const dropped = await until(() => ['disconnected', 'reconnecting'].includes(collector.getState().status));
    assert.ok(dropped, `status stayed ${collector.getState().status}`);

    const revived = createFakeSimBackend({ nodes: NODES, units: [UNIT] });
    await new Promise((resolve) => revived.server.listen(port, '127.0.0.1', resolve));

    const reconnected = await until(() => collector.getState().status === 'connected', { timeout: 8000 });
    assert.ok(reconnected, `never reconnected (status: ${collector.getState().status})`);
    revived.close();
  });

  console.log(`\n${passed} passed, ${failures.length} failed\n`);
  if (failures.length) for (const f of failures) console.error(`FAILED: ${f.name}\n${f.err.stack}\n`);

  collector.stop();
  db.close();
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    fs.rmSync(`${TEST_DB}${suffix}`, { force: true });
  }
  process.exit(failures.length ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
