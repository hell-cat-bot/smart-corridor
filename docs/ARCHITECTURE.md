# PackMen — Architecture & Implementation

Smart-Corridor emergency dispatch: a live simulation of a city road network with
emergency vehicles, congestion-aware routing, traffic-signal preemption and
ML hazard detection — plus the accounts and permanent record that make it a
system rather than a demo.

This document is the map of the whole thing: what each service does, how they
are wired together, what is implemented and how, and how to run it.

---

## 1. The three services

```
                    ┌─────────────────────────────────────┐
                    │           frontend                  │
                    │  React 19 + Vite + Leaflet          │
                    │  http://localhost:5173              │
                    └──────────┬─────────────┬────────────┘
                               │             │
         accounts, history     │             │   live world + control
         REST + JWT            │             │   REST + WebSocket
                               ▼             ▼
        ┌──────────────────────────┐   ┌────────────────────────────┐
        │      web_backend         │   │        ml_backend          │
        │  Node 22 + Express       │   │  Python + FastAPI          │
        │  SQLite (node:sqlite)    │   │  YOLOv8 + ResNet50         │
        │  http://localhost:4000   │   │  http://localhost:8000     │
        └──────────────────────────┘   └────────────────────────────┘
                     ▲                              │
                     │                              │
                     └──────────────────────────────┘
                        collector: web_backend subscribes
                        to ml_backend's /ws and records
                        missions and disasters as history
```

| Service | Owns | Language |
|---|---|---|
| **ml_backend** | The simulation: road network, units, missions, routing, congestion, signal preemption. Plus ML inference on camera frames. | Python / FastAPI |
| **web_backend** | Accounts and roles, the fleet register, hospitals, and the permanent record of incidents and missions. | Node / Express |
| **frontend** | The operations console: map, dispatch, corridor view, analytics, dashboard. | React / Vite |

**The dependency arrows only point one way.** `web_backend` reaches into
`ml_backend`; `ml_backend` has never heard of `web_backend`. That means the
simulation runs perfectly well on its own, and nothing in the web tier can break
it. The frontend talks to both, and knows which is which.

---

## 2. How a single emergency flows through all three

This is the whole system in one sequence. Follow it once and the rest of the
document is detail.

1. **A dispatcher raises a call.** They click *New mission* in the console. The
   frontend does **not** run its own dispatch logic — it `POST`s to
   `ml_backend /api/missions`.
2. **The simulation decides.** ml_backend ranks available units by A\* cost over
   the congestion-weighted graph, picks a receiving hospital, and creates the
   mission. It broadcasts `mission.created` on its WebSocket.
3. **Two listeners hear it at once.**
   - The **frontend** puts the mission in the queue and draws the route.
   - The **collector inside web_backend** writes a row into `missions`, keyed on
     `sim_mission_id`, and links it to the vehicle in the fleet register.
4. **The unit drives.** ml_backend ticks ~10×/second and broadcasts `tick`
   frames with positions, headings and congestion. The frontend moves the
   markers. The collector ignores ticks entirely — position is not history.
5. **A junction goes green.** As the unit closes on a junction, ml_backend's
   preemption logic holds the signal and includes it in the `lights` map on the
   next tick. The corridor view renders it.
6. **A flood blocks the route.** Someone injects a disaster (or the ML detector
   raises one). ml_backend removes that junction from the routing graph, replans
   every affected leg, and broadcasts `disaster.created`. The frontend redraws;
   the collector writes an `incidents` row with `source = 'sim'`.
7. **The mission completes.** ml_backend broadcasts `mission.updated` with
   `status = completed`. The collector updates the same row — never creating a
   second — and stores the response time the simulation measured.
8. **Tomorrow morning**, a dispatcher signs in and the dashboard shows it, along
   with everything else that happened overnight. Nobody needed a browser open
   for any of that to be recorded.

---

## 3. web_backend — accounts and the permanent record

Node + Express + SQLite. No ORM: plain, readable SQL.

### Why `node:sqlite`

SQLite comes from **Node's own built-in `node:sqlite` module**, not
`better-sqlite3`. `better-sqlite3` is a native addon; on Node 24 there was no
prebuilt binary, so `npm install` tried to compile C++ and failed on a machine
with no Visual Studio toolchain. Using the driver Node already ships means every
dependency is pure JavaScript and `npm install` works everywhere.

**This is why the project needs Node 22.5 or newer.** On an older Node,
`require('node:sqlite')` fails at startup — upgrade Node rather than adding a
database package.

`src/db/connection.js` is the only file that touches the driver. It adds the
three things the app needs on top: `transaction()`, `pragma()`, and tagging of
constraint errors so a duplicate email becomes a `409` instead of a `500`.

### Layout

```
web_backend/src/
├── server.js            boot: migrate, listen, start collector, graceful shutdown
├── app.js               middleware order, /health, /api mount
├── config/index.js      the only place that reads process.env
├── db/
│   ├── schema.sql       the whole schema, plain SQL
│   ├── connection.js    the SQLite connection + driver adapter
│   ├── migrate.js       npm run db:migrate
│   ├── seed.js          npm run db:seed  (idempotent)
│   └── reset.js         npm run db:reset
├── routes/              URL → middleware → controller
├── controllers/         thin: read req.validated, call a service, respond
├── services/            all business logic and SQL
├── validators/          zod schemas for body / query / params
├── middleware/          authenticate, authorize, validate, errorHandler
├── integration/
│   ├── mlCollector.js   the WebSocket client that records the simulation
│   └── mapping.js       pure sim → records translation (unit-testable)
└── utils/               ApiError, tokens, password, small helpers
```

**The rule:** a route contains no logic, a controller contains no SQL, a service
never touches `req` or `res`.

Two conventions worth knowing:

- Validated input lands on **`req.validated.body` / `.query` / `.params`**, never
  back on `req.body`. `req.query` is a read-only getter in Express, so writing to
  it silently does nothing — a classic source of bugs.
- Every handler is wrapped in `asyncHandler`, so a thrown error always reaches
  the one central error handler instead of hanging the request.

### Data model

| Table | Holds |
|---|---|
| `users` | accounts, bcrypt password hash, role |
| `refresh_tokens` | SHA-256 hashes of refresh tokens, rotated on use |
| `hospitals` | facilities, bed counts, optional sim `node_id` |
| `vehicles` | fleet register, live status, `sim_unit_id` |
| `incidents` | reports — manual, from the ML detector, or from the simulation |
| `missions` | dispatch history with timestamps and a status state machine |
| `audit_logs` | who changed what |

Ids are UUID strings, timestamps are ISO-8601 UTC, booleans are stored `0`/`1`
and returned as real JSON booleans.

`vehicles.sim_unit_id`, `missions.sim_mission_id` and `incidents.sim_disaster_id`
are the join keys to the simulation. They are what makes the collector
idempotent, and what lets a stored mission be matched to the one running in
ml_backend without either side depending on the other.

### Auth

- **Access token**: a signed JWT, 15 minutes, sent as `Authorization: Bearer …`.
- **Refresh token**: an opaque random string, 7 days. Only its SHA-256 hash is
  stored, so a leaked database cannot be used to log in.
- **Rotation**: refreshing revokes the old token immediately, so a stolen one
  works at most once.
- The user row is re-read from the database on **every** request rather than
  trusted from the token, so deactivating an account takes effect at once
  instead of whenever the token happens to expire.
- Changing a password revokes every refresh token for that user.

Roles:

| Role | Can do |
|---|---|
| `admin` | everything, including user management and deletes |
| `dispatcher` | create and update hospitals, vehicles, incidents, missions; control the simulation |
| `viewer` | read only |

**The first account ever registered becomes the admin**, so a fresh database is
never locked out. Everyone after that starts as a `viewer`.

### The collector — `src/integration/mlCollector.js`

This is the bridge between the simulation and the permanent record.

- Opens its own WebSocket to `ml_backend /ws` using **Node's global
  `WebSocket`** (Node 22+), so it costs no dependency.
- Before subscribing it pulls `GET /api/world/snapshot` once, so a restart does
  not miss what is already in flight.
- **What it records**: `mission.created`, `mission.updated`, `disaster.created`,
  `disaster.cleared`.
- **What it ignores**: `tick` (10×/second — position is not history), `unit.route`,
  `log`, `metrics`, and any message type added later.
- **Idempotency**: every write is an upsert keyed on the simulation's own id.
  Replaying the same event a hundred times produces one row. `COALESCE` keeps the
  first timestamp seen for each milestone, so a later update never moves a
  dispatch time that was already recorded.
- **Auto-registration**: a simulation unit seen for the first time is added to the
  fleet register (matched by `sim_unit_id`, then by callsign, so a vehicle an
  operator typed in by hand is linked rather than duplicated). Switch off with
  `COLLECTOR_AUTO_REGISTER_VEHICLES=false`.
- **Resilience**: reconnects with exponential backoff capped at 30s; a malformed
  frame is counted and skipped; a failed write is logged and never crashes the
  process.
- Turn the whole thing off with `COLLECTOR_ENABLED=false` and web_backend runs
  completely standalone.

**A note on time.** The simulation has no wall clock — it measures everything in
*simulated seconds* since its world was seeded. So stored timestamps
(`dispatched_at`, `arrived_at`, `completed_at`) are the moment **this service
observed** the change, while `actual_seconds` preserves the simulation's own
elapsed time (`completedAt − approvedAt`) and remains a meaningful measure of
response performance.

`src/integration/mapping.js` holds every translation decision as pure functions —
no database, no network, no clock — which is what makes the integration testable
without a running Python backend.

### API reference

Everything under `/api`. 🔒 needs a token, 👤 admin only, ✏️ admin or dispatcher.

**Auth**

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/register` | `{ name, email, password }` → session |
| POST | `/auth/login` | `{ email, password }` → session |
| POST | `/auth/refresh` | `{ refreshToken }` → new session |
| POST | `/auth/logout` | `{ refreshToken }` → `204` |
| GET | `/auth/me` 🔒 | the current user |
| POST | `/auth/change-password` 🔒 | `{ currentPassword, newPassword }` → `204` |

**Records** — `GET`/`POST`/`GET :id`/`PATCH :id`/`DELETE :id` on each of
`/users` 👤, `/hospitals` 🔒✏️, `/vehicles` 🔒✏️, `/incidents` 🔒✏️,
`/missions` 🔒✏️. Plus `PATCH /vehicles/:id/status`,
`PATCH /missions/:id/status`, `POST /incidents/:id/resolve`.

Filters: `?limit=` `?offset=` `?order=asc|desc` everywhere, plus `?status=`
`?kind=` `?severity=` `?source=` `?type=` `?search=` `?priority=` `?vehicleId=`
`?incidentId=` where they apply.

**Stats and integration**

| Method | Path | Notes |
|---|---|---|
| GET | `/stats/overview` 🔒 | one call for every dashboard card |
| GET | `/stats/daily` 🔒 | `?days=14` — missions and incidents per day |
| GET | `/stats/audit` 👤 | the audit trail |
| GET | `/integration/status` 🔒 | collector state + a live probe of ml_backend |
| GET | `/health` | unauthenticated liveness probe |

**Shapes.** A list endpoint always returns
`{ items: [...], total, limit, offset }`. An error always returns
`{ error: { message, details? } }`.

| Status | When |
|---|---|
| 400 | validation failed, or a referenced id does not exist |
| 401 | missing, invalid or expired token; wrong credentials |
| 403 | signed in but the role is not allowed; account deactivated |
| 404 | no such record |
| 409 | duplicate value, or an action the current state does not allow |

### Mission state machine

```
pending ──► assigned ──► enroute ──► onscene ──► transporting ──► completed
   │            │            │           │              │
   └────────────┴────────────┴───────────┴──────────────┴──────► cancelled
```

Any other jump is refused with `409`. The server also stamps the right timestamp
at each transition, computes `actual_seconds`, moves the assigned vehicle's
status to match, refuses to edit a finished mission, and refuses to delete a
vehicle that is on an active one.

> The collector deliberately **bypasses** this state machine via
> `upsertFromSim`. For a mission the simulation owns, the simulation is the
> system of record — this service mirrors what it reports rather than
> second-guessing the order the transitions arrived in.

---

## 4. frontend — the console

React 19, Vite, Tailwind, Zustand, Leaflet, react-router.

### Two sources for the live world

The frontend can get the live world from either of two places, and it says which
in the top bar:

| Mode | What drives the map | History recorded? |
|---|---|---|
| **server** (default) | ml_backend, over its WebSocket | Yes — by the collector |
| **local** | the browser's own engine, `src/engine/*` | No |

`local` exists so the console is never dead in the water: if Python is not
running, one click keeps the demo going. The choice is remembered per browser
and can be changed any time from the pill in the top bar.

Only one of them runs at a time — `src/lib/simSource.js` always stops one before
starting the other, because if both wrote to the same store every tick the map
would visibly stutter between them.

### The files that were added

```
frontend/src/
├── lib/
│   ├── config.js        where the two backends live (VITE_ env vars)
│   ├── apiClient.js     web_backend client: tokens, silent refresh, ApiError
│   ├── simClient.js     ml_backend client: no auth, FastAPI error shape
│   ├── simControl.js    ★ one set of actions, routed to local engine or server
│   └── simSource.js     switching between the two modes
├── engine/
│   └── simBridge.js     ★ the live WebSocket link: hydrate, then apply deltas
├── store/
│   ├── useAuthStore.js       who is signed in
│   └── useConnectionStore.js which source, and how the connection is doing
└── components/
    ├── auth/  AuthLayout, LoginPage, RegisterPage, ProtectedRoute
    └── views/ DashboardView
```

### `simControl.js` — the piece that makes everything work in both modes

Every control in the console — play, pause, new mission, approve, inject a
disaster — goes through this one module. In local mode the call lands in the
browser's engine. In server mode it becomes a `POST` to ml_backend, and the
change comes back through the WebSocket like any other event, so the server
stays the single source of truth.

Two rules keep the call sites simple:

1. **Every function returns a Promise**, in both modes. A caller that needs the
   result awaits it; a caller that does not can ignore it.
2. **Nothing here rejects.** A failed request is reported to the operator with a
   toast and the promise resolves to `null`, so a fire-and-forget click can never
   produce an unhandled rejection.

It is also where **role enforcement** lives for simulation actions. ml_backend
has no concept of users, so a viewer is stopped here, in one place, with a
message explaining why.

This design is why the existing views barely changed: nine components had a
single import line rewritten from `../../engine/…` to `../../lib/simControl`, and
four call sites that use a return value gained an `await`. No view logic moved.

### `simBridge.js` — the live link

Connect order is deliberate:

1. `GET /api/network` — the road graph: junctions, segments with real road
   geometry, facilities. Static, fetched once per connection.
2. `GET /api/world/snapshot` — the current state of everything that moves.
3. `GET /api/settings` — the server's calibration, so the Settings sliders show
   the numbers the simulation is actually running on.
4. open `/ws` — deltas from here on.

**The snapshot before the socket is what makes a reconnect safe**: the stream
carries no history, so after a drop the world is re-read in full rather than left
holding whatever it had.

Two details worth knowing:

- **The road network is replaced, not merged.** The two services ship different
  `network.json` files, so junction ids from the server would mean nothing
  against the locally seeded graph. In server mode the server's graph is the only
  one used.
- **A tick is merged, not applied wholesale.** A unit's tick carries only
  `route.travelled`, not the whole route — the full route arrives separately as a
  `unit.route` event when it actually changes. Applying the tick naively would
  wipe the route every 100ms.

**One compatibility shim.** ml_backend serialises `Leg.from` as `from_`, because
the Python field is named `from_` to avoid the reserved word and Pydantic dumps
by field name rather than by alias. The shared contract says `from`, so the
bridge normalises legs at the boundary — one place, rather than a
`leg.from ?? leg.from_` scattered through the views. If ml_backend is ever
changed to dump `by_alias=True`, `normaliseMission` becomes a no-op and can be
deleted.

### Auth in the browser

- Tokens are kept in `localStorage`, wrapped in try/catch because it throws in a
  few browser configurations.
- On a 401, `apiClient` refreshes **once** and retries the request, so a
  15-minute token never interrupts anyone mid-task. One shared refresh promise
  means several requests failing at once trigger a single refresh rather than a
  stampede that would revoke each other's tokens.
- `useAuthStore.status` is `loading` / `authed` / `guest`. The `loading` state
  matters on a hard refresh: without it, a protected route would bounce you to
  `/login` for a moment before the stored token had been checked.
- On startup the stored token is **verified against the backend**, not trusted —
  so a deactivated account does not get a usable-looking session. But if the
  backend is merely *down*, the token is kept rather than discarded, so an outage
  does not silently log everyone out.

### Routes

| Path | Access |
|---|---|
| `/` | public — landing page |
| `/login`, `/register` | public |
| `/dashboard` | 🔒 service health and recorded history |
| `/operations` | 🔒 map, missions, units, disasters, live A\*, congestion |
| `/corridor` | 🔒 frozen path, preemption, junction arbitration |
| `/missions`, `/fleet`, `/disasters` | 🔒 |
| `/analytics`, `/logs`, `/settings` | 🔒 |

Where you were trying to go is remembered, so signing in returns you there
rather than dumping you on the default page.

---

## 5. ml_backend — the simulation (your teammate's service)

Not modified by this work. Summarised here because the other two services depend
on its contract.

**REST**

| Method | Path | Purpose |
|---|---|---|
| GET | `/` | health: `{ status, simTime, running }` |
| GET | `/api/network` | junctions, segments with geometry, facilities |
| GET | `/api/world/snapshot` | everything live, in one response |
| POST | `/api/sim/start` `/pause` `/step` `/speed` `/reset` | transport |
| GET/POST | `/api/missions` | list / create |
| POST | `/api/missions/{id}/approve` `/cancel` | dispatch control |
| POST/DELETE | `/api/disasters`, `/api/disasters/{id}`, `/api/disasters/by-node/{node}` | blockages |
| GET/PATCH | `/api/settings` | calibration (applies to the **next** plan only) |
| GET | `/api/logs`, `/api/analytics/summary` | structured log, metrics |
| POST | `/api/routes/compare` | A\* vs Dijkstra comparison |
| POST | `/infer/frame` | YOLOv8 + ResNet50 on a base64 camera frame |

**WebSocket `/ws`** — server → client only, batched:

| Message | Frequency | Consumed by |
|---|---|---|
| `tick` | ~10/s — positions, lights, congestion | frontend (collector ignores it) |
| `unit.route` | when a route actually changes | frontend |
| `mission.created` / `mission.updated` | on change | frontend **and** collector |
| `disaster.created` / `disaster.cleared` | on change | frontend **and** collector |
| `log` | as produced | frontend |
| `metrics` | every 10 ticks | frontend |

There is **no event replay** on reconnect, which is why both clients re-read the
snapshot before resubscribing.

---

## 6. Running it

Three terminals. Start ml_backend first so the others find it — though both
handle it being absent.

### 1 — ml_backend

```bash
cd ml_backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 2 — web_backend

```bash
cd web_backend
npm install
npm run setup        # create tables + seed demo data
npm run dev          # http://localhost:4000
```

### 3 — frontend

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

Then open <http://localhost:5173> and sign in.

### Demo accounts

Created by `npm run db:seed`:

| Email | Password | Role |
|---|---|---|
| admin@packmen.local | admin12345 | admin |
| dispatcher@packmen.local | dispatch12345 | dispatcher |
| viewer@packmen.local | viewer12345 | viewer |

Change `SEED_ADMIN_PASSWORD` and `JWT_SECRET` in `web_backend/.env` before
running this anywhere but a laptop.

### Configuration

Both `.env` files are optional — every value has a working local default.

**web_backend/.env**

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `4000` | |
| `CORS_ORIGIN` | `*` | comma separated, or `*` |
| `DATABASE_FILE` | `data/packmen.db` | relative to `web_backend/` |
| `JWT_SECRET` | dev placeholder | **change this** |
| `ML_BACKEND_URL` | `http://localhost:8000` | where the simulation is |
| `COLLECTOR_ENABLED` | `true` | `false` to run fully standalone |
| `COLLECTOR_AUTO_REGISTER_VEHICLES` | `true` | register sim units on first sight |

**frontend/.env**

| Variable | Default | Notes |
|---|---|---|
| `VITE_API_URL` | `http://localhost:4000` | web_backend |
| `VITE_SIM_URL` | `http://localhost:8000` | ml_backend |
| `VITE_SIM_SOURCE` | `server` | or `local` to start on the browser engine |

Vite reads `.env` at dev-server start — restart `npm run dev` after changing it.

### A five-minute demo script

1. Sign in as **dispatcher**. The top-bar pill should read **Live**.
2. Dashboard: all three services green, collector connected.
3. Operations → press play. Units move; congestion shifts.
4. *New mission* at a junction across the map. Watch the A\* route draw, the
   junctions ahead of the unit go green, the mission move through its stages.
5. *Inject disaster* on a junction along that route. The route replans live.
6. Back to the Dashboard → the mission and the incident are now in the recorded
   history, with the incident's source marked as coming from the simulation.
7. Sign out, sign in as **viewer**. Everything is visible; every control is
   disabled with an explanation. That is `simControl.js` doing its job.
8. Click the top-bar pill to switch to **Local engine** — the console keeps
   working with Python stopped.

---

## 7. Tests

### web_backend

```bash
cd web_backend
npm test                  # both suites
npm run test:api          # 48 checks, HTTP end to end
npm run test:integration  # 13 checks, the collector against a fake ml_backend
```

Plain Node, no test framework, non-zero exit on the first failure.

`test:api` walks every endpoint over real HTTP: role enforcement, refresh-token
rotation and replay rejection, deactivation killing a live token, duplicate-key
`409`s, foreign-key `400`s, every mission transition legal and illegal, and
malformed JSON returning `400` rather than `500`.

`test:integration` runs the real collector against a stand-in ml_backend
(`tests/fakeSimBackend.js` — a raw RFC 6455 WebSocket server in ~90 lines, so the
suite needs no dependency). It proves the connection, snapshot import,
idempotency, the mission→vehicle and mission→incident links, the response-time
calculation, disaster resolution, that ticks are ignored, that a malformed frame
is survivable, and that it reconnects after the simulation drops.

### frontend

The npm registry is blocked from the environment this was built in, so the
frontend could not be `npm install`ed or built here. What *was* verified:

- every `.js`/`.jsx` file parses as JSX;
- every relative import resolves to a file that exists;
- every named import from a local module is actually exported by it;
- every bare import is a package listed in `package.json`;
- **`simBridge.js` was run for real** against a stubbed `fetch` and `WebSocket` —
  22 checks covering hydration, the tick merge, route/mission/disaster handling,
  log de-duplication, metric merging, reconnect and clean teardown.

That last one found a genuine bug before delivery: `sim.settings` is an object,
not a function, and the resulting `TypeError` was being swallowed by a
`catch` — the server's calibration would have silently never loaded.

**Still unverified, and worth a careful first run:** anything that needs a real
browser — Leaflet rendering against the server's road network, Tailwind classes,
and React render behaviour. Run `npm run build` in `frontend/` as the first check
after `npm install`.

---

## 8. Design decisions, and why

**The simulation does not know about the web tier.** Every integration arrow
points from web_backend to ml_backend. Your teammate can keep changing the
simulation without touching anything here, and nothing in the web tier can take
the simulation down.

**History is collected server-side, not in the browser.** A dispatcher who signs
in tomorrow should see what happened overnight. A browser-driven sync only
records while a tab is open and logged in.

**Ticks are never stored.** Ten writes a second of position data is telemetry,
not history. The collector keeps missions, incidents and their outcomes — the
things you would want to answer a question about next week.

**Roles are enforced in the frontend for simulation actions.** ml_backend has no
users. Rather than bolt auth onto a service that does not want it, `simControl`
gates those actions in one place. This is honest about what it is: a UI-level
guard. Anyone who can reach ml_backend directly can still drive it — which is
fine when it is bound to localhost, and would need a real gateway before this
went anywhere public.

**The local engine was kept as a fallback rather than deleted.** A demo where
half the system has to be running for anything to appear on screen is a demo that
fails in the room.

---

## 9. Known limits and what to do next

- **Nothing here is public-facing.** ml_backend has no authentication at all, and
  CORS defaults to `*`. Before any deployment: put ml_backend behind web_backend
  or a gateway, pin `CORS_ORIGIN`, set a real `JWT_SECRET`, and move the refresh
  token to an httpOnly cookie (a change to `apiClient.js` and the auth routes
  only).
- **Simulated time is not wall-clock time.** Recorded timestamps are observation
  times; `actual_seconds` is simulated. Fine for comparing responses to each
  other, wrong for anything that needs real elapsed time.
- **The ML detector is wired but not fed.** `POST /infer/frame` works and the
  frontend has a client for it, but nothing polls a camera feed yet. Incidents
  with `source = 'ml'` are supported end to end and are waiting on that poller.
- **One simulation instance, one world.** ml_backend holds a single global
  `app_state`, so every connected client sees the same world. That is the right
  call for a control room and the wrong one for multi-tenancy.
- **`db:seed` hospitals are not linked to sim junctions.** `node_id` is left null,
  so the seeded hospitals are records rather than map positions. Fill it in with
  real junction ids from `GET /api/network` to link them.
- **SQLite inside OneDrive.** The database lives in `web_backend/data/`, which is
  inside a synced folder. If SQLite ever reports `database is locked`, point
  `DATABASE_FILE` somewhere outside OneDrive.
