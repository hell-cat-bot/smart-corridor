# PackMen — Web Backend

The web tier for PackMen: accounts and authentication, plus the records the
simulation does not own — hospitals, the vehicle fleet, incident reports,
mission history and an audit trail.

It runs **alongside** `ml_backend` (the FastAPI simulation + YOLO/ResNet
service) and does not touch it. The frontend talks to both:

```
frontend  ──► web_backend  (Node + Express, port 4000)   accounts, fleet, history
          └─► ml_backend   (FastAPI, port 8000)          live simulation + ML
```

Stack: **Node.js + Express + SQLite**, JWT auth, `zod` for input validation.
No ORM — plain, readable SQL.

SQLite comes from **`node:sqlite`, the driver built into Node itself**, so there
is nothing to compile: every npm dependency is pure JavaScript and `npm install`
works on any machine without Visual Studio build tools. Requires **Node 22.5 or
newer** (`node -v` to check).

---

## Quick start

```bash
cd web_backend
npm install
cp .env.example .env     # optional: every setting has a working default
npm run setup            # creates the tables and seeds demo data
npm run dev              # http://localhost:4000
```

Check it:

```bash
curl http://localhost:4000/health
```

Seeded accounts (from `npm run db:seed`):

| Email                      | Password        | Role       |
| -------------------------- | --------------- | ---------- |
| admin@packmen.local        | admin12345      | admin      |
| dispatcher@packmen.local   | dispatch12345   | dispatcher |
| viewer@packmen.local       | viewer12345     | viewer     |

> Change `SEED_ADMIN_PASSWORD` and `JWT_SECRET` in `.env` before running this
> anywhere other than a laptop.

### Scripts

| Command              | What it does                                        |
| -------------------- | --------------------------------------------------- |
| `npm start`          | Run the server                                      |
| `npm run dev`        | Run with auto-reload (nodemon)                      |
| `npm run db:migrate` | Create tables and indexes (safe to re-run)          |
| `npm run db:seed`    | Create the admin account and demo data (idempotent) |
| `npm run db:reset`   | Delete every row, keep the tables                   |
| `npm run setup`      | `db:migrate` then `db:seed`                         |
| `npm test`           | Both test suites                                    |
| `npm run test:api`   | End-to-end HTTP test (48 checks)                    |
| `npm run test:integration` | The collector against a fake ml_backend (13)  |

`npm start` applies the migration itself, so a fresh clone works with
`npm install && npm start`.

---

## Project layout

```
web_backend/
├── src/
│   ├── server.js            entry point: migrate, listen, graceful shutdown
│   ├── app.js               express app: middleware order, /health, /api mount
│   ├── config/index.js      the only place that reads process.env
│   ├── db/
│   │   ├── schema.sql       the whole schema, plain SQL
│   │   ├── connection.js    one SQLite connection (WAL + foreign keys on)
│   │   ├── migrate.js       npm run db:migrate
│   │   ├── seed.js          npm run db:seed
│   │   └── reset.js         npm run db:reset
│   ├── routes/              URL -> middleware -> controller
│   ├── controllers/         thin: read req.validated, call a service, respond
│   ├── services/            all business logic and SQL
│   ├── validators/          zod schemas for body / query / params
│   ├── middleware/          authenticate, authorize, validate, errorHandler
│   └── utils/               ApiError, tokens, password, small helpers
└── tests/smoke.test.js      end-to-end test, no framework required
```

**The rule of thumb:** a route never contains logic, a controller never
contains SQL, a service never touches `req` or `res`.

Two conventions worth knowing:

- Validated input lands on **`req.validated.body` / `.query` / `.params`**, not
  back on `req.body`. `req.query` is a read-only getter in Express, so writing
  to it silently does nothing — a classic source of bugs.
- Every handler is wrapped in `asyncHandler`, so a thrown error always reaches
  the one central error handler instead of hanging the request.

---

## Data model

| Table            | Holds                                                             |
| ---------------- | ----------------------------------------------------------------- |
| `users`          | accounts, bcrypt password hash, role                              |
| `refresh_tokens` | hashed refresh tokens (rotated on use)                            |
| `hospitals`      | facilities, bed counts, optional sim `node_id`                    |
| `vehicles`       | fleet register, live status, optional sim `unit_id`               |
| `incidents`      | reports — manual, from the ML detector, or from the simulation    |
| `missions`       | dispatch history with timestamps and a status state machine       |
| `audit_logs`     | who changed what                                                  |

Ids are UUID strings, timestamps are ISO-8601 UTC strings, booleans are stored
as `0`/`1` and returned as real JSON booleans.

`vehicles.sim_unit_id` and `missions.sim_mission_id` are the join keys to the
simulation, so a mission recorded here can be matched to the one running in
`ml_backend` without either side depending on the other.

### Mission state machine

```
pending ──► assigned ──► enroute ──► onscene ──► transporting ──► completed
   │            │            │           │              │
   └────────────┴────────────┴───────────┴──────────────┴──────► cancelled
```

Any other jump is refused with `409`. The server also:

- stamps `dispatchedAt` / `arrivedAt` / `completedAt` at the right transition,
- computes `actualSeconds` from dispatch to completion,
- moves the assigned vehicle's status to match (`enroute`, `onscene`, back to
  `idle` when the mission finishes or is cancelled),
- refuses to edit a mission that is already `completed` or `cancelled`,
- refuses to delete a vehicle that is on an active mission.

---

## Roles

| Role         | Can do                                                       |
| ------------ | ------------------------------------------------------------ |
| `admin`      | everything, including user management and deletes            |
| `dispatcher` | create and update hospitals, vehicles, incidents, missions   |
| `viewer`     | read only                                                    |

The **first account ever registered becomes the admin**, so a fresh database is
never locked out. Everyone after that starts as a `viewer`.

---

## Auth

`POST /api/auth/login` returns:

```json
{
  "user": { "id": "...", "name": "...", "email": "...", "role": "dispatcher", "isActive": true },
  "accessToken": "<JWT, expires in 15m>",
  "refreshToken": "<opaque string, expires in 7 days>"
}
```

Send the access token on every other request:

```
Authorization: Bearer <accessToken>
```

When it expires, `POST /api/auth/refresh` with the refresh token returns a new
pair. Refresh tokens are **rotated**: the old one is revoked immediately, so a
stolen token works at most once. Only the SHA-256 hash of a refresh token is
stored, and changing a password or deactivating an account revokes all of them.

---

## API reference

Everything below is under `/api`. `🔒` needs a token, `👤` admin only,
`✏️` admin or dispatcher.

### Auth

| Method | Path                    | Notes                                      |
| ------ | ----------------------- | ------------------------------------------ |
| POST   | `/auth/register`        | `{ name, email, password }` → session      |
| POST   | `/auth/login`           | `{ email, password }` → session            |
| POST   | `/auth/refresh`         | `{ refreshToken }` → new session           |
| POST   | `/auth/logout`          | `{ refreshToken }` → `204`                 |
| GET    | `/auth/me` 🔒           | the current user                           |
| POST   | `/auth/change-password` 🔒 | `{ currentPassword, newPassword }` → `204` |

### Users 👤

`GET /users` · `POST /users` · `GET /users/:id` · `PATCH /users/:id` · `DELETE /users/:id`

Filters: `?role=` `?search=` `?limit=` `?offset=` `?order=asc|desc`

### Hospitals 🔒 (write ✏️, delete 👤)

`GET /hospitals` · `POST /hospitals` · `GET /hospitals/:id` · `PATCH /hospitals/:id` · `DELETE /hospitals/:id`

Filters: `?search=` `?hasTraumaUnit=true|false` + paging.

### Vehicles 🔒 (write ✏️, delete 👤)

`GET /vehicles` · `POST /vehicles` · `GET /vehicles/:id` · `PATCH /vehicles/:id` ·
`PATCH /vehicles/:id/status` · `DELETE /vehicles/:id`

Filters: `?type=` `?status=` `?search=` + paging.

### Incidents 🔒 (write ✏️, delete 👤)

`GET /incidents` · `POST /incidents` · `GET /incidents/:id` · `PATCH /incidents/:id` ·
`POST /incidents/:id/resolve` · `DELETE /incidents/:id`

Filters: `?status=` `?kind=` `?severity=` `?source=` `?search=` + paging.

`source` is `manual`, `ml` or `sim` — so a detection posted by the ML backend is
distinguishable from a human report, and carries its `confidence`.

### Missions 🔒 (write ✏️, delete 👤)

`GET /missions` · `POST /missions` · `GET /missions/:id` · `PATCH /missions/:id` ·
`PATCH /missions/:id/status` · `DELETE /missions/:id`

Filters: `?status=` `?priority=` `?vehicleId=` `?incidentId=` + paging.

### Stats

| Method | Path               | Notes                                            |
| ------ | ------------------ | ------------------------------------------------ |
| GET    | `/stats/overview` 🔒 | one call for every dashboard card               |
| GET    | `/stats/daily` 🔒    | `?days=14` — missions and incidents per day     |
| GET    | `/stats/audit` 👤    | `?entity=` `?entityId=` `?userId=` + paging     |
| GET    | `/integration/status` 🔒 | collector state + a live probe of ml_backend |

### Response shapes

A list endpoint always returns:

```json
{ "items": [ ... ], "total": 42, "limit": 50, "offset": 0 }
```

An error always returns:

```json
{ "error": { "message": "Validation failed", "details": [ { "field": "email", "message": "Invalid email" } ] } }
```

| Status | When                                                          |
| ------ | ------------------------------------------------------------- |
| 400    | validation failed, or a referenced id does not exist           |
| 401    | missing, invalid or expired token; wrong credentials           |
| 403    | signed in but the role is not allowed; account deactivated     |
| 404    | no such record                                                 |
| 409    | duplicate value, or an action the current state does not allow |

---

## The simulation collector

On startup this service opens its own WebSocket to `ml_backend /ws` and records
what the simulation does as permanent history:

- `mission.created` / `mission.updated` → a row in `missions`, keyed on
  `sim_mission_id`
- `disaster.created` → a row in `incidents` with `source = 'sim'`, keyed on
  `sim_disaster_id`
- `disaster.cleared` → that incident is resolved
- `tick`, `unit.route`, `log`, `metrics` → ignored; position is not history

Every write is an upsert on the simulation's own id, so replaying an event never
creates a duplicate. A unit seen for the first time is added to the fleet
register automatically, which is why missions always have a vehicle attached.

It reconnects on its own with backoff, and a failure to reach ml_backend never
affects anything else this service does. `GET /api/integration/status` reports
what it is doing. Set `COLLECTOR_ENABLED=false` to run completely standalone.

Timestamps stored here are the moment this service *observed* a change, because
the simulation has no wall clock — it counts simulated seconds. The simulation's
own elapsed time is preserved in `actualSeconds`.

Full detail, including the message contract, is in `../docs/ARCHITECTURE.md`.

---

## Example session

```bash
# 1. log in
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"dispatcher@packmen.local","password":"dispatch12345"}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).accessToken')

# 2. report an incident
curl -s -X POST http://localhost:4000/api/incidents \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"title":"Fire at the depot","kind":"fire","severity":"p1","source":"ml","confidence":0.93}'

# 3. see the dashboard summary
curl -s http://localhost:4000/api/stats/overview -H "authorization: Bearer $TOKEN"
```

---

## Configuration

Every variable is optional; see `.env.example` for the defaults.

| Variable                 | Default              | Notes                                       |
| ------------------------ | -------------------- | ------------------------------------------- |
| `PORT`                   | `4000`               |                                             |
| `HOST`                   | `0.0.0.0`            |                                             |
| `NODE_ENV`               | `development`        | `production` requires a real `JWT_SECRET`   |
| `CORS_ORIGIN`            | `*`                  | comma separated list, or `*`                |
| `DATABASE_FILE`          | `data/packmen.db`    | relative to `web_backend/`                  |
| `JWT_SECRET`             | dev placeholder      | **change this**                             |
| `ACCESS_TOKEN_TTL`       | `15m`                |                                             |
| `REFRESH_TOKEN_TTL_DAYS` | `7`                  |                                             |
| `BCRYPT_ROUNDS`          | `10`                 |                                             |

### Frontend CORS

The Vite dev server runs on `http://localhost:5173`, which is already in
`.env.example`. Add any other origin you serve the frontend from.

### Moving to PostgreSQL later

All SQL lives in `src/services/*` and `src/db/schema.sql`. Nothing else knows
what database is underneath, so swapping in `pg` is a change to
`src/db/connection.js` plus making the service calls `await`.

---

## Notes

- **Node 22.5+ is required**, because SQLite comes from Node's own
  `node:sqlite` module. On an older Node, `require('node:sqlite')` fails at
  startup — upgrade Node rather than adding a database package.
- `src/db/connection.js` is the only file that talks to the driver. It adds
  transactions, `pragma`, and tagging of constraint errors so the API can
  answer `409` instead of `500`.
- The SQLite file lives in `data/` and is gitignored, so nobody commits
  someone else's demo state.
- Passwords are hashed with bcrypt and never returned by any endpoint.

### If `npm install` misbehaves on Windows

This project sits inside a OneDrive folder. OneDrive syncs files while npm is
writing them, which shows up as `EPERM: operation not permitted, rmdir ...` in
`node_modules`. If that happens:

```powershell
# pause OneDrive sync from the tray icon first, then:
Remove-Item -Recurse -Force node_modules
npm install
```

For the same reason, if SQLite ever reports `database is locked`, point
`DATABASE_FILE` at a path outside OneDrive, for example
`DATABASE_FILE=C:/packmen-data/packmen.db` in your `.env`.
