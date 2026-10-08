# System design ideas — ML service, web backend, and the dashboard

Not an implementation plan — a set of options and how they'd fit together, written against what actually exists in this project today. Pick and mix; none of this is committed to code.

## Where things stand right now

The dashboard is 100% client-side. Everything that looks like "backend logic" — dispatch ranking, A* routing, congestion, signal preemption — actually runs in the browser, in `src/engine/*`, driven by a local 10Hz `setInterval` tick (`engine/simulation.js`). State lives only in Zustand stores, in memory, in one browser tab. Nothing persists, nothing is shared between viewers, there's no server today.

That turns out to be a genuinely good starting position for adding a backend, because of one existing decision: **decision logic lives in `engine/*`, and stores hold state plus dumb setters only** (`updateUnit`, `addDisaster`, `setLight`, `updateMission`, ...). Components never call engine functions directly for state changes — they go through the store. That seam is exactly where a network boundary slots in later without touching a single component.

---

## The three services and what each one should — and shouldn't — know

**ML service (FastAPI)** — stays dumb on purpose. It takes a frame (or a batch, or a stream) and hands back structured detections: what it saw, where, how confident it is. It has no idea what a "mission" is, what "priority" means, or what a junction ID is used for elsewhere. That's deliberate — keeping it domain-ignorant means it can be retrained, redeployed, or swapped for a different model without anyone touching the backend or the dashboard. It's also the one component that actually wants GPU and wants to scale independently of everything else — inference load tracks camera count, not viewer count.

**Web backend** — this is the new "brain." It's the one place that should own the canonical world state going forward: the single shared `nodes/edges/units/missions/disasters/lights/congestion` model that today lives only in the browser's Zustand store. Moving that authority server-side is what makes multiple operators looking at the same map, real persistence, and a real audit trail all possible at once. It's also the natural home for the translation layer between "the ML model detected an accident at camera 12" and "junction J0231 now has a disaster on it" — more on that below.

**Dashboard** — becomes a client instead of the whole system. The interesting design question is whether it stays *only* a client, or keeps its current standalone-simulation ability too (see the two-mode idea below — worth keeping, it's a genuinely useful fallback).

---

## The idea I'd anchor the whole design on

Don't rewrite the frontend's state model. Keep `useWorldStore`, `useSettingsStore`, and every existing setter exactly as they are. The only thing that changes is **who calls them**:

- **Today:** the local tick loop in `engine/simulation.js` calls them, ten times a second, computed entirely in-browser.
- **Live mode:** a thin WebSocket adapter calls the exact same setters — `store.updateUnit(...)`, `store.addDisaster(...)`, `store.setLight(...)` — but the values come from the backend instead of a local computation.

Every component, every map layer, every panel keeps working unmodified, because they only ever read from the store — they never cared whether the tick loop or a network message put the data there. This turns "add a backend" from a rewrite into an additive change: build the WebSocket adapter, feature-flag it, and the existing 51 components don't need to know it exists.

It also means you get to **keep the offline demo mode**. That's worth protecting deliberately — it's what makes this project reliable to demo without depending on a live backend being up, a camera feed being connected, or network conditions on demo day. A `VITE_LIVE_MODE` (or similar) toggle picks whether `engine/simulation.js`'s local tick or the WebSocket adapter is the one driving the store. Never run both at once — that's the one rule.

---

## How ML detections become domain events

This seam is already half-designed — `IMPLEMENTATION_NOTES.md` describes it for the B.4 section that got deferred: a vision result writes a node's congestion index, or for hazard classes adds the node to the blocked set; an accident detection calls `createMission()` the same way the operator's New Mission dialog does.

The backend is where that translation happens, and it's worth keeping it a small, explicit, well-tested function rather than something buried in a network handler — something like `detection -> domain action`:

- low-confidence congestion signal → nudge the node's congestion index (cheap, reversible, no operator interruption)
- high-confidence hazard/accident detection → don't auto-inject a disaster blindly. Mirror the pattern this project already uses for missions: a suggestion that either auto-applies if "auto-approve" is on, or surfaces to an operator to confirm — same trust model as dispatch already has, just extended to ML-sourced events instead of only operator-sourced ones.
- every detection that leads to a domain action gets logged through the same structured log categories that already exist (`LOG_CATEGORY.DISASTER`, `.MISSION`, `.CONGESTION`), tagged with the model version and confidence that produced it, so "why did the system do X" stays answerable — that log is also your best hackathon Q&A material.

Two ways the ML service and backend can talk, worth deciding explicitly rather than defaulting into one:

- **Pull:** backend calls `POST /infer/frame` on the FastAPI service when it wants an inference — simplest, works well if inference is on-demand (operator clicks "check this camera") or on a slow poll.
- **Push:** the ML service (or a lightweight worker sitting in front of the camera streams) posts detections to the backend as they happen — better fit if cameras stream continuously and detections are event-driven rather than polled. A small queue (Redis stream, or even just an internal buffered channel) between them absorbs bursts so a flurry of detections doesn't hammer the backend's tick.

Either is fine to start with pull, since it's simpler to build and to demo deterministically — push is the thing to reach for once real camera feeds are actually continuous.

---

## Transport choices

- **REST** for anything that's a command or a cold read: create mission, approve dispatch, inject/clear disaster, fetch mission history, fetch analytics, fetch a fresh snapshot of the whole world on connect.
- **WebSocket** for the live stream — unit positions, congestion deltas, light states, new log entries. This is the direct network equivalent of today's 10Hz tick, so batch several deltas into one message rather than one message per changed field; the existing `patch()` / bulk-setter pattern in the store already assumes batched updates, so this maps naturally.
- A **snapshot-then-stream** bootstrap for a newly connecting dashboard: `GET /world/snapshot` once to hydrate full state, then subscribe to the delta stream — avoids replaying the whole event history to every new viewer.
- SSE is worth a mention as a lighter alternative to WebSocket if the stream only ever needs to go server→client (it does, today) — simpler infra, no bidirectional handshake, but WebSocket keeps the door open for the dashboard to send small live commands (e.g. "focus this unit," multi-operator cursors) later without adding a second transport.

---

## What starts needing persistence that doesn't have it today

Right now everything lives in memory and vanishes on refresh. Worth deciding what actually needs a database versus what can stay ephemeral:

- **Missions, disasters, facilities, structured logs** → a real database (Postgres is the obvious default) — this is what makes the Analytics view show real history instead of whatever happened to be in memory during one session, and what makes an audit trail actually durable.
- **Congestion history** → could just be a table in the same Postgres, or a proper time-series store if the sampling rate grows — no need to reach for that complexity yet.
- **Camera frames / clips the ML model flagged** → object storage (S3-compatible), referenced by URL from the detection record — useful for an operator to actually look at what triggered an auto-suggested disaster.
- **Live world state (positions, current congestion, current lights)** → doesn't need to hit a database every tick; keep it in the backend process's memory the way the frontend does today, and only persist the *decisions* (missions created, disasters injected, replans) — that's the same distinction the existing structured log already draws between high-frequency congestion samples and discrete logged events.

---

## Auth and trust boundaries

- Dashboard ↔ backend: operator auth (session or JWT) — this is also where "who approved this dispatch" becomes a real, attributable fact instead of just "the operator," which matters if this ever needs to be defensible.
- Backend ↔ ML service: service-to-service auth only (API key or mTLS) — no end-user ever talks to the ML service directly.
- Auto-approve settings should probably be a backend-side, per-operator setting rather than a client toggle once there's a real backend — right now `autoApprove` lives in the browser's settings store, which is fine for a demo but not for a system where an ML-triggered action needs to be attributable to a policy someone actually set.

---

## Deployment shape

- ML service: separate deployable, scale by camera/inference load, GPU nodes if the model needs them.
- Backend: one instance owns the live simulation "tick" (it's the same single-writer-many-readers shape the frontend already uses, just moved server-side) — if this ever needs to scale horizontally, the tick/authority stays pinned to one process while WebSocket fan-out to many dashboard viewers can go through a pub/sub layer (Redis pub/sub or NATS) in front of it.
- Dashboard: stays a static build, same as today — just needs the backend's REST + WebSocket URLs as config, nothing else changes about how it's hosted.

---

## A sane build order

Not because sequencing is code, but because it changes what's low-risk to try first:

1. **Backend first, no ML yet.** Stand up the backend as a live mirror of what `engine/simulation.js` already does — same formulas, same domain model, just server-side. Add the dashboard's live-mode WebSocket adapter. At this point you've proven the plumbing and you still have a fully working offline demo as a fallback if anything's flaky.
2. **ML service, standalone.** Build and test the FastAPI service against sample frames with no integration at all — it should be independently demoable before it's wired to anything.
3. **Wire them together last.** By this point the backend already knows how to create missions and inject disasters — that logic doesn't change. All that's new is a translation function turning a detection into a call to logic that already exists and is already trusted.

This order means a demo is never blocked on the riskiest, newest piece (the ML integration) — the fallback at every stage is something that already works.
