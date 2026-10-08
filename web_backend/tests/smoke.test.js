'use strict';

/**
 * End-to-end smoke test - `npm test`.
 *
 * Starts the real server against a throwaway database file and walks every
 * endpoint over real HTTP, checking status codes, role rules and the mission
 * state machine. No test framework needed: plain Node, exits non-zero on the
 * first failure.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Must be set before anything reads the config.
const TEST_DB = path.join(__dirname, 'smoke.test.db');
process.env.NODE_ENV = 'test';
process.env.DATABASE_FILE = path.relative(path.join(__dirname, '..'), TEST_DB);
process.env.JWT_SECRET = 'smoke-test-secret';
process.env.PORT = process.env.SMOKE_PORT || '4555';

for (const suffix of ['', '-wal', '-shm', '-journal']) {
  fs.rmSync(`${TEST_DB}${suffix}`, { force: true });
}

const server = require('../src/server');
const { db } = require('../src/db/connection');

const BASE = `http://127.0.0.1:${process.env.PORT}`;

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

async function api(method, url, { token, body } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';

  const res = await fetch(`${BASE}${url}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  let json = null;
  if (text) {
    try { json = JSON.parse(text); } catch { json = text; }
  }
  return { status: res.status, body: json };
}

function expectStatus(res, expected, label) {
  assert.strictEqual(
    res.status,
    expected,
    `${label}: expected ${expected}, got ${res.status} - ${JSON.stringify(res.body)}`,
  );
}

async function run() {
  console.log('\nPackMen web backend - smoke test\n');

  // --- health ------------------------------------------------------------
  console.log('health');
  await check('GET /health returns ok', async () => {
    const res = await api('GET', '/health');
    expectStatus(res, 200, 'health');
    assert.strictEqual(res.body.status, 'ok');
  });
  await check('unknown route returns 404 JSON', async () => {
    const res = await api('GET', '/api/nope');
    expectStatus(res, 404, 'unknown route');
    assert.ok(res.body.error.message.includes('Route not found'));
  });

  // --- auth --------------------------------------------------------------
  console.log('\nauth');
  let admin;
  let dispatcher;
  let viewer;

  await check('first registered account becomes admin', async () => {
    const res = await api('POST', '/api/auth/register', {
      body: { name: 'Root Admin', email: 'root@packmen.test', password: 'rootpass123' },
    });
    expectStatus(res, 201, 'register');
    assert.strictEqual(res.body.user.role, 'admin');
    assert.ok(res.body.accessToken && res.body.refreshToken);
    admin = res.body;
  });

  await check('second account is a viewer', async () => {
    const res = await api('POST', '/api/auth/register', {
      body: { name: 'Plain User', email: 'plain@packmen.test', password: 'plainpass123' },
    });
    expectStatus(res, 201, 'register 2');
    assert.strictEqual(res.body.user.role, 'viewer');
    viewer = res.body;
  });

  await check('duplicate email is rejected with 409', async () => {
    const res = await api('POST', '/api/auth/register', {
      body: { name: 'Copy', email: 'root@packmen.test', password: 'rootpass123' },
    });
    expectStatus(res, 409, 'duplicate email');
  });

  await check('short password fails validation with field details', async () => {
    const res = await api('POST', '/api/auth/register', {
      body: { name: 'Short', email: 'short@packmen.test', password: 'abc' },
    });
    expectStatus(res, 400, 'short password');
    assert.strictEqual(res.body.error.details[0].field, 'password');
  });

  await check('login with wrong password returns 401', async () => {
    const res = await api('POST', '/api/auth/login', {
      body: { email: 'root@packmen.test', password: 'wrongpass123' },
    });
    expectStatus(res, 401, 'bad login');
  });

  await check('login with unknown email returns the same 401', async () => {
    const res = await api('POST', '/api/auth/login', {
      body: { email: 'ghost@packmen.test', password: 'whatever123' },
    });
    expectStatus(res, 401, 'unknown email');
    assert.strictEqual(res.body.error.message, 'Invalid email or password');
  });

  await check('login is case-insensitive on email', async () => {
    const res = await api('POST', '/api/auth/login', {
      body: { email: 'ROOT@packmen.test', password: 'rootpass123' },
    });
    expectStatus(res, 200, 'login');
    admin = res.body;
  });

  await check('GET /api/auth/me needs a token', async () => {
    expectStatus(await api('GET', '/api/auth/me'), 401, 'me without token');
    expectStatus(await api('GET', '/api/auth/me', { token: 'garbage' }), 401, 'me with junk token');
  });

  await check('GET /api/auth/me returns the caller', async () => {
    const res = await api('GET', '/api/auth/me', { token: admin.accessToken });
    expectStatus(res, 200, 'me');
    assert.strictEqual(res.body.email, 'root@packmen.test');
    assert.strictEqual(res.body.passwordHash, undefined, 'password hash must never be returned');
  });

  await check('refresh rotates the token and the old one stops working', async () => {
    const first = await api('POST', '/api/auth/refresh', { body: { refreshToken: admin.refreshToken } });
    expectStatus(first, 200, 'refresh');
    assert.notStrictEqual(first.body.refreshToken, admin.refreshToken);

    const replay = await api('POST', '/api/auth/refresh', { body: { refreshToken: admin.refreshToken } });
    expectStatus(replay, 401, 'refresh replay');
    admin = first.body;
  });

  await check('logout revokes the refresh token', async () => {
    const session = await api('POST', '/api/auth/login', {
      body: { email: 'plain@packmen.test', password: 'plainpass123' },
    });
    expectStatus(await api('POST', '/api/auth/logout', { body: { refreshToken: session.body.refreshToken } }), 204, 'logout');
    expectStatus(
      await api('POST', '/api/auth/refresh', { body: { refreshToken: session.body.refreshToken } }),
      401,
      'refresh after logout',
    );
  });

  // --- users (admin only) -------------------------------------------------
  console.log('\nusers');
  await check('a viewer cannot list users', async () => {
    expectStatus(await api('GET', '/api/users', { token: viewer.accessToken }), 403, 'viewer lists users');
  });

  await check('admin creates a dispatcher', async () => {
    const res = await api('POST', '/api/users', {
      token: admin.accessToken,
      body: { name: 'Dispatch One', email: 'dispatch@packmen.test', password: 'dispatch123', role: 'dispatcher' },
    });
    expectStatus(res, 201, 'create dispatcher');
    const login = await api('POST', '/api/auth/login', {
      body: { email: 'dispatch@packmen.test', password: 'dispatch123' },
    });
    expectStatus(login, 200, 'dispatcher login');
    dispatcher = login.body;
  });

  await check('admin lists users with paging metadata', async () => {
    const res = await api('GET', '/api/users?limit=2&offset=0', { token: admin.accessToken });
    expectStatus(res, 200, 'list users');
    assert.strictEqual(res.body.items.length, 2);
    assert.strictEqual(res.body.total, 3);
    assert.strictEqual(res.body.limit, 2);
  });

  await check('a bad id is a 400, a well-formed unknown id is a 404', async () => {
    expectStatus(await api('GET', '/api/users/not-a-uuid', { token: admin.accessToken }), 400, 'bad id');
    expectStatus(
      await api('GET', '/api/users/11111111-2222-3333-4444-555555555555', { token: admin.accessToken }),
      404,
      'unknown id',
    );
  });

  await check('an admin cannot change their own role or deactivate themselves', async () => {
    expectStatus(
      await api('PATCH', `/api/users/${admin.user.id}`, { token: admin.accessToken, body: { role: 'viewer' } }),
      400,
      'self role change',
    );
    expectStatus(
      await api('PATCH', `/api/users/${admin.user.id}`, { token: admin.accessToken, body: { isActive: false } }),
      400,
      'self deactivate',
    );
    expectStatus(
      await api('DELETE', `/api/users/${admin.user.id}`, { token: admin.accessToken }),
      400,
      'self delete',
    );
  });

  await check('deactivating a user blocks their existing token', async () => {
    expectStatus(await api('GET', '/api/auth/me', { token: viewer.accessToken }), 200, 'viewer before');
    expectStatus(
      await api('PATCH', `/api/users/${viewer.user.id}`, { token: admin.accessToken, body: { isActive: false } }),
      200,
      'deactivate',
    );
    expectStatus(await api('GET', '/api/auth/me', { token: viewer.accessToken }), 403, 'viewer after');
    expectStatus(
      await api('PATCH', `/api/users/${viewer.user.id}`, { token: admin.accessToken, body: { isActive: true } }),
      200,
      'reactivate',
    );
  });

  // --- hospitals ----------------------------------------------------------
  console.log('\nhospitals');
  let hospitalId;

  await check('a viewer cannot create a hospital', async () => {
    expectStatus(
      await api('POST', '/api/hospitals', {
        token: viewer.accessToken,
        body: { name: 'Nope', code: 'NOPE', totalBeds: 1, availableBeds: 1 },
      }),
      403,
      'viewer creates hospital',
    );
  });

  await check('a dispatcher creates a hospital', async () => {
    const res = await api('POST', '/api/hospitals', {
      token: dispatcher.accessToken,
      body: {
        name: 'Test General',
        code: 'TG1',
        lat: 22.57,
        lng: 88.36,
        totalBeds: 100,
        availableBeds: 40,
        hasTraumaUnit: true,
      },
    });
    expectStatus(res, 201, 'create hospital');
    assert.strictEqual(res.body.hasTraumaUnit, true, 'booleans come back as real booleans');
    assert.strictEqual(res.body.availableBeds, 40);
    hospitalId = res.body.id;
  });

  await check('duplicate hospital code returns 409', async () => {
    expectStatus(
      await api('POST', '/api/hospitals', {
        token: dispatcher.accessToken,
        body: { name: 'Clash', code: 'tg1', totalBeds: 1, availableBeds: 0 },
      }),
      409,
      'duplicate code',
    );
  });

  await check('availableBeds cannot exceed totalBeds, on create or on patch', async () => {
    expectStatus(
      await api('POST', '/api/hospitals', {
        token: dispatcher.accessToken,
        body: { name: 'Bad Beds', code: 'BAD1', totalBeds: 5, availableBeds: 9 },
      }),
      400,
      'create bad beds',
    );
    // Only availableBeds is sent, so this must be compared against the stored total.
    expectStatus(
      await api('PATCH', `/api/hospitals/${hospitalId}`, {
        token: dispatcher.accessToken,
        body: { availableBeds: 500 },
      }),
      400,
      'patch bad beds',
    );
  });

  await check('a viewer can read hospitals', async () => {
    const res = await api('GET', '/api/hospitals?search=Test', { token: viewer.accessToken });
    expectStatus(res, 200, 'list hospitals');
    assert.strictEqual(res.body.total, 1);
  });

  // --- vehicles -----------------------------------------------------------
  console.log('\nvehicles');
  let vehicleId;

  await check('a dispatcher creates a vehicle linked to the hospital', async () => {
    const res = await api('POST', '/api/vehicles', {
      token: dispatcher.accessToken,
      body: { callsign: 'AMB-T1', type: 'ambulance', capacity: 2, homeHospitalId: hospitalId },
    });
    expectStatus(res, 201, 'create vehicle');
    assert.strictEqual(res.body.status, 'idle');
    assert.strictEqual(res.body.homeHospitalName, 'Test General', 'join returns the hospital name');
    vehicleId = res.body.id;
  });

  await check('an unknown hospital id is rejected with 400', async () => {
    expectStatus(
      await api('POST', '/api/vehicles', {
        token: dispatcher.accessToken,
        body: {
          callsign: 'AMB-T9',
          type: 'ambulance',
          homeHospitalId: '11111111-2222-3333-4444-555555555555',
        },
      }),
      400,
      'bad foreign key',
    );
  });

  await check('an invalid vehicle type is rejected', async () => {
    expectStatus(
      await api('POST', '/api/vehicles', {
        token: dispatcher.accessToken,
        body: { callsign: 'AMB-T8', type: 'submarine' },
      }),
      400,
      'bad type',
    );
  });

  await check('vehicle status can be set directly', async () => {
    const res = await api('PATCH', `/api/vehicles/${vehicleId}/status`, {
      token: dispatcher.accessToken,
      body: { status: 'returning' },
    });
    expectStatus(res, 200, 'set status');
    assert.strictEqual(res.body.status, 'returning');
    await api('PATCH', `/api/vehicles/${vehicleId}/status`, {
      token: dispatcher.accessToken,
      body: { status: 'idle' },
    });
  });

  await check('filtering vehicles by status works', async () => {
    const res = await api('GET', '/api/vehicles?status=idle', { token: viewer.accessToken });
    expectStatus(res, 200, 'filter vehicles');
    assert.strictEqual(res.body.total, 1);
  });

  // --- incidents ----------------------------------------------------------
  console.log('\nincidents');
  let incidentId;

  await check('a dispatcher reports an incident', async () => {
    const res = await api('POST', '/api/incidents', {
      token: dispatcher.accessToken,
      body: {
        title: 'Warehouse fire',
        kind: 'fire',
        severity: 'p1',
        description: 'Smoke visible from the main road',
        lat: 22.58,
        lng: 88.35,
        source: 'ml',
        confidence: 0.91,
      },
    });
    expectStatus(res, 201, 'create incident');
    assert.strictEqual(res.body.status, 'open');
    assert.strictEqual(res.body.reportedBy, dispatcher.user.id);
    assert.ok(res.body.occurredAt, 'occurredAt defaults to now');
    incidentId = res.body.id;
  });

  await check('confidence above 1 is rejected', async () => {
    expectStatus(
      await api('POST', '/api/incidents', {
        token: dispatcher.accessToken,
        body: { title: 'Bad', kind: 'fire', source: 'ml', confidence: 1.4 },
      }),
      400,
      'bad confidence',
    );
  });

  await check('resolving an incident stamps resolvedAt', async () => {
    const other = await api('POST', '/api/incidents', {
      token: dispatcher.accessToken,
      body: { title: 'Minor flooding', kind: 'flood' },
    });
    const res = await api('POST', `/api/incidents/${other.body.id}/resolve`, { token: dispatcher.accessToken });
    expectStatus(res, 200, 'resolve');
    assert.strictEqual(res.body.status, 'resolved');
    assert.ok(res.body.resolvedAt);
  });

  await check('filtering incidents by severity works', async () => {
    const res = await api('GET', '/api/incidents?severity=p1', { token: viewer.accessToken });
    expectStatus(res, 200, 'filter incidents');
    assert.strictEqual(res.body.total, 1);
  });

  // --- missions -----------------------------------------------------------
  console.log('\nmissions');
  let missionId;

  await check('a mission that is already assigned needs a vehicle', async () => {
    expectStatus(
      await api('POST', '/api/missions', {
        token: dispatcher.accessToken,
        body: { incidentId, status: 'assigned', priority: 'p1' },
      }),
      400,
      'assigned without vehicle',
    );
  });

  await check('a dispatcher creates a mission', async () => {
    const res = await api('POST', '/api/missions', {
      token: dispatcher.accessToken,
      body: {
        incidentId,
        vehicleId,
        hospitalId,
        priority: 'p1',
        status: 'assigned',
        etaSeconds: 300,
        distanceM: 2400,
        notes: 'Two casualties',
      },
    });
    expectStatus(res, 201, 'create mission');
    assert.strictEqual(res.body.incidentTitle, 'Warehouse fire', 'join returns the incident title');
    assert.strictEqual(res.body.vehicleCallsign, 'AMB-T1');
    missionId = res.body.id;
  });

  await check('an illegal status jump is refused', async () => {
    const res = await api('PATCH', `/api/missions/${missionId}/status`, {
      token: dispatcher.accessToken,
      body: { status: 'completed' },
    });
    expectStatus(res, 409, 'illegal jump');
    assert.ok(res.body.error.message.includes('Allowed'));
  });

  await check('the mission walks its state machine and drives the vehicle status', async () => {
    let res = await api('PATCH', `/api/missions/${missionId}/status`, {
      token: dispatcher.accessToken,
      body: { status: 'enroute' },
    });
    expectStatus(res, 200, 'enroute');
    assert.ok(res.body.dispatchedAt, 'dispatchedAt is stamped');

    let vehicle = await api('GET', `/api/vehicles/${vehicleId}`, { token: viewer.accessToken });
    assert.strictEqual(vehicle.body.status, 'enroute', 'vehicle follows the mission');

    res = await api('PATCH', `/api/missions/${missionId}/status`, {
      token: dispatcher.accessToken,
      body: { status: 'onscene' },
    });
    expectStatus(res, 200, 'onscene');
    assert.ok(res.body.arrivedAt, 'arrivedAt is stamped');

    res = await api('PATCH', `/api/missions/${missionId}/status`, {
      token: dispatcher.accessToken,
      body: { status: 'completed' },
    });
    expectStatus(res, 200, 'completed');
    assert.ok(res.body.completedAt, 'completedAt is stamped');
    assert.strictEqual(typeof res.body.actualSeconds, 'number', 'actualSeconds is computed');

    vehicle = await api('GET', `/api/vehicles/${vehicleId}`, { token: viewer.accessToken });
    assert.strictEqual(vehicle.body.status, 'idle', 'vehicle is released');
  });

  await check('a completed mission can no longer be edited or moved', async () => {
    expectStatus(
      await api('PATCH', `/api/missions/${missionId}`, { token: dispatcher.accessToken, body: { notes: 'late edit' } }),
      409,
      'edit completed',
    );
    expectStatus(
      await api('PATCH', `/api/missions/${missionId}/status`, {
        token: dispatcher.accessToken,
        body: { status: 'enroute' },
      }),
      409,
      'reopen completed',
    );
  });

  await check('a vehicle on an active mission cannot be deleted', async () => {
    const second = await api('POST', '/api/missions', {
      token: dispatcher.accessToken,
      body: { incidentId, vehicleId, priority: 'p2', status: 'assigned' },
    });
    expectStatus(second, 201, 'second mission');

    expectStatus(await api('DELETE', `/api/vehicles/${vehicleId}`, { token: admin.accessToken }), 409, 'delete busy vehicle');

    expectStatus(
      await api('PATCH', `/api/missions/${second.body.id}/status`, {
        token: dispatcher.accessToken,
        body: { status: 'cancelled' },
      }),
      200,
      'cancel second',
    );
  });

  await check('a duplicate simMissionId returns 409', async () => {
    const body = { incidentId, vehicleId, simMissionId: 'sim-1', priority: 'p3' };
    expectStatus(await api('POST', '/api/missions', { token: dispatcher.accessToken, body }), 201, 'sim mission');
    expectStatus(await api('POST', '/api/missions', { token: dispatcher.accessToken, body }), 409, 'duplicate sim id');
  });

  await check('a viewer cannot change a mission', async () => {
    expectStatus(
      await api('PATCH', `/api/missions/${missionId}/status`, { token: viewer.accessToken, body: { status: 'cancelled' } }),
      403,
      'viewer moves mission',
    );
  });

  // --- stats --------------------------------------------------------------
  console.log('\nstats');
  await check('the overview fills every bucket', async () => {
    const res = await api('GET', '/api/stats/overview', { token: viewer.accessToken });
    expectStatus(res, 200, 'overview');
    assert.strictEqual(res.body.totals.hospitals, 1);
    assert.strictEqual(res.body.totals.vehicles, 1);
    assert.strictEqual(res.body.beds.occupied, 60);
    assert.strictEqual(res.body.vehiclesByStatus.offline, 0, 'missing statuses are zero-filled');
    assert.strictEqual(res.body.missionsByStatus.completed, 1);
    assert.strictEqual(typeof res.body.averageResponseSeconds, 'number');
  });

  await check('daily rollups respond', async () => {
    const res = await api('GET', '/api/stats/daily?days=7', { token: viewer.accessToken });
    expectStatus(res, 200, 'daily');
    assert.strictEqual(res.body.days, 7);
    assert.ok(Array.isArray(res.body.missions));
  });

  await check('the audit trail is admin-only and records writes', async () => {
    expectStatus(await api('GET', '/api/stats/audit', { token: dispatcher.accessToken }), 403, 'dispatcher audit');
    const res = await api('GET', '/api/stats/audit?entity=mission', { token: admin.accessToken });
    expectStatus(res, 200, 'audit');
    assert.ok(res.body.total > 0, 'mission writes were recorded');
  });

  // --- password change ----------------------------------------------------
  console.log('\npassword change');
  await check('changing a password revokes existing refresh tokens', async () => {
    const session = (await api('POST', '/api/auth/login', {
      body: { email: 'dispatch@packmen.test', password: 'dispatch123' },
    })).body;

    expectStatus(
      await api('POST', '/api/auth/change-password', {
        token: session.accessToken,
        body: { currentPassword: 'wrongone123', newPassword: 'newpass12345' },
      }),
      401,
      'wrong current password',
    );

    expectStatus(
      await api('POST', '/api/auth/change-password', {
        token: session.accessToken,
        body: { currentPassword: 'dispatch123', newPassword: 'newpass12345' },
      }),
      204,
      'change password',
    );

    expectStatus(
      await api('POST', '/api/auth/refresh', { body: { refreshToken: session.refreshToken } }),
      401,
      'old refresh token',
    );
    expectStatus(
      await api('POST', '/api/auth/login', { body: { email: 'dispatch@packmen.test', password: 'newpass12345' } }),
      200,
      'login with new password',
    );
  });

  // --- malformed input ----------------------------------------------------
  console.log('\nmalformed input');
  await check('invalid JSON returns 400, not 500', async () => {
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    assert.strictEqual(res.status, 400, `expected 400, got ${res.status}`);
  });

  await check('an unknown query value is rejected', async () => {
    expectStatus(
      await api('GET', '/api/missions?status=teleporting', { token: viewer.accessToken }),
      400,
      'bad query enum',
    );
  });

  await check('an empty PATCH body is rejected', async () => {
    expectStatus(
      await api('PATCH', `/api/hospitals/${hospitalId}`, { token: dispatcher.accessToken, body: {} }),
      400,
      'empty patch',
    );
  });

  // --- results ------------------------------------------------------------
  console.log(`\n${passed} passed, ${failures.length} failed\n`);
  if (failures.length) {
    for (const f of failures) console.error(`FAILED: ${f.name}\n${f.err.stack}\n`);
  }

  server.close();
  db.close();
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    fs.rmSync(`${TEST_DB}${suffix}`, { force: true });
  }
  process.exit(failures.length ? 1 : 0);
}

// Give the server a moment to bind before the first request.
server.on('listening', () => {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
});
