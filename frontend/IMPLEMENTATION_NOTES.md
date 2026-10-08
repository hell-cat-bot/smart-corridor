# Smart-Corridor dashboard — Part B implementation notes

This build implements the web side of *04_Current_State_and_Planned_Improvements*.
Everything in Part B is in except **B.4 (ML / vision channel)**, which was
explicitly out of scope for now.

Run it the way you always have:

```bash
cd frontend
npm run dev
```

No new dependencies were added.

---

## The road network

The map runs on a real OpenStreetMap road network for **central Ghaziabad**,
already extracted and committed at `src/data/network.json` — 769 junctions,
1094 road segments, 5 hospitals taken from OSM. Nothing queries the internet at
runtime, so a flaky network on demo day cannot break the map.

You only need the rest of this section if you want to **rebuild** it — a
different area, a denser street grid, or fresher data.

### Rebuilding from the browser (recommended)

`scripts/browser-extract.js` does the whole extraction inside a browser tab, so
there is no CLI and nothing on your machine talks to Overpass directly.

1. open <https://overpass-turbo.eu>, press **F12** → **Console**
2. first time only, Chrome makes you type `allow pasting`
3. paste the whole of `scripts/browser-extract.js`, press Enter
4. it downloads `network.json`; move it to `src/data/network.json`

Edit the `CONFIG` block at the top of that file to change the bounding box, the
area name, the junction cap, or to include residential streets. Watch progress
with `__pm.stage`; `__pm.summary` reports the final counts.

Running it from a browser session also sidesteps the rate limiting that hits
bare scripted requests — a plain Node request to Overpass gets a 429 on sight
far more readily.

### Rebuilding from the CLI

```bash
node scripts/fetch-osm-network.mjs                        # same extraction, from Node
node scripts/fetch-osm-network.mjs --residential          # denser street grid
node scripts/fetch-osm-network.mjs --max-nodes=1400       # allow a bigger graph
node scripts/fetch-osm-network.mjs --bbox=28.60,77.30,28.68,77.40 --name="Indirapuram"
```

It rotates through five Overpass mirrors and backs off across four rounds. If
every mirror is out of query slots (HTTP 429) — which is common — use
`--status` to see which frees up first, or bypass the API entirely:

```bash
node scripts/fetch-osm-network.mjs --print-query
#  1. paste each query at https://overpass-turbo.eu and press Run
#  2. Export > raw OSM data, saving roads.json and places.json
node scripts/fetch-osm-network.mjs --from-file=roads.json --places-file=places.json
```

Both scripts run the identical pipeline and produce the identical file shape.

If `src/data/network.json` is ever missing or replaced with the placeholder
lattice, the Operations view shows a banner saying so.

### What "real roads" changes

* Vehicles drive the **actual road polyline**, curves included, instead of
  cutting in a straight line between junctions.
* Segment cost uses the measured along-the-road length, so distances and ETAs are
  real distances.
* Junctions are named after the roads that meet there (`GT Road / Hapur Road`),
  and the junction pickers in New Mission, Inject Disaster and the corridor
  builder are searchable by road name rather than dropdowns of every node.
* Hospitals and fire stations come from OSM where they are tagged; where the
  extract is thin, the script tops up with well-spread synthetic ones (flagged
  `synthetic: true` in the file) so the fleet is always usable.
* On a city-scale network only *notable* junctions are drawn by default —
  blocked, preempted, congested, or carrying a facility. Everything else appears
  from zoom 15, or via **Settings → Show every junction**.

---

## What changed at a glance

The old model was *vehicle → destination → one path*, driven by a scripted
17-second timeline (`mockTimeline.js`). That is gone. The system now runs a real
tick-based simulation clock over a single shared world state, and the operator's
primary action is **New mission**, not **Add vehicle**.

Superseded files were moved to `frontend/_legacy_src/` rather than deleted, so
you can still read the old implementations. Nothing imports them.

---

## B.1 — Mission-based emergency flow

* `src/engine/missions.js` owns the whole lifecycle.
* Facilities are first-class: 3 hospitals and 2 fire stations seeded on the grid
  (`src/data/worldSeed.js`), each with units based there.
* **Medical**: call at scene → suggested unit ranked by congestion-aware ETA →
  operator approves → LEG 1 to scene → `ON_SCENE` dwell (per emergency class) →
  LEG 2 replanned fresh to the chosen hospital → complete, unit available at that
  hospital.
* **Fire**: call → LEG 1 → dwell → primary response complete. The return to
  station happens but is deliberately *not* an optimised response leg (it is
  planned with α = 0, i.e. plain distance).
* Hospital choice prefers the unit's home hospital when it is within 10% of the
  nearest feasible one; the alternatives considered are written to the log.
* Approve/dispatch stays in the loop unless **auto-approve** is switched on in
  Settings (demo mode).
* Pending calls are re-evaluated as units free up.

## B.2 — Live congestion index driving A*

* `src/engine/congestion.js`. A background civilian population (default 45
  agents, adjustable) circulates on the grid. Node density → congestion index
  `c_v` ∈ [0,1], smoothed with an EMA. Junction status uses hysteresis
  (enters "congested" above 0.60, leaves below 0.45) so badges do not flicker.
* Segment cost, in `src/utils/pathfinding.js`:

  ```
  W(u,v) = d(u,v) × (1 + α · c_v · ω_priority)
  ```

  `ω` is per vehicle class and controls how strongly congestion penalises that
  class — emergency units are partly shielded because preemption clears their
  approach. Both α and ω are sliders in Settings.
* Blocked (disaster) junctions are removed from the graph entirely — infinite
  cost, independent of congestion.
* **Replanning** lives in `src/engine/replanning.js`, deliberately *outside* the
  tick loop. Injecting or clearing a disaster changes the graph immediately, so
  `injectDisaster` / `clearDisasterAtNode` call the same passes the clock does —
  the new optimal path appears at once whether the simulation is running or
  paused. Congestion replans are gated by a cooldown (default 10 s per unit)
  *and* a minimum ETA improvement (default 12%), so paths do not thrash. Solid
  active path + dashed previous path is retained on the map.
* A replan is planned from the junction the vehicle is heading into, then
  **grafted onto the segment it is already part-way along** (`spliceRoute`), so
  the route ahead changes without the vehicle jumping forward to that junction.
* **Stranded units.** When a blockage cuts *every* route to the destination the
  unit no longer carries on through it. It drives up to a stop line 30 m short
  of the blocked junction, parks, and is flagged `unit.blocked`. That surfaces
  as a red alert bar on Operations, a toast, a `STRANDED` chip in the top bar, a
  badge in the fleet rail and a red halo on the map. It retries every 2 s and
  releases itself the moment a route reopens — clearing the disaster is enough,
  no operator action needed.

## B.3 — Green Corridor view

* Separate view (`/corridor`), `src/engine/corridor.js` + `CorridorMap.jsx`.
* Paths are planned once at session start and then **frozen**.
* Traffic lights sit on every junction along the paths and run a normal cycle
  when nobody is asking for them.
* A vehicle requests a green on every signalised junction within the approach
  radius (default 260 m). On grant the light goes to preempt-green; after the
  vehicle clears it, the light releases back to the normal cycle.
* **Multi-vehicle arbitration**: priority class → ETA to the junction → request
  order → deterministic unit-id tie-break. The loser physically holds at the stop
  line. Every request, grant, hold, release and contest is recorded in the
  session timeline *and* the structured log.
* Three presets ship with it, including a two-vehicle and a three-vehicle
  scenario built to force contested junctions.

## B.5 — Structured, separated logs

* `src/store/useLogStore.js` + the Logs view.
* Categories: mission, dispatch, routing, congestion, disaster, signal,
  conflict, simulation.
* Every record carries wall-clock time, **simulation time**, category, severity,
  entity references (mission / unit / node / facility) and the structured data
  behind the decision — e.g. the full candidate ranking for a dispatch, or the
  contenders and tie-break rule for a junction contest.
* Filter by category and severity, full-text search across messages, refs and
  payloads, expand any row to see the raw JSON, export the whole log.
* Congestion is high-volume, so it is *sampled* into the log every 20 simulation
  seconds rather than logged on every change.

## Operator input — presets are a starting point, not a cage

Every classification dropdown offers its presets plus **Other — type your own**
(`ComboSelect` in `src/components/common/ui.jsx`). Real calls do not always fit
a list.

* **New mission**: a typed emergency class takes an optional on-scene dwell and
  an explicit priority (automatic resolves to P2 with no preset to read).
* **Inject disaster**: a typed disaster type, plus an optional display label and
  operator note. Custom types get their own violet marker on the map.
* Typed values flow through to the mission/disaster record, the map, the panels
  and the structured log, flagged `operatorEntered` so they are distinguishable
  from preset ones after the fact.
* Nothing here is mandatory — leaving the custom fields empty falls back to the
  defaults.

## Dashboard shell

* The **bottom panel is resizable**: drag its top edge, arrow-keys when the
  handle is focused, double-click to reset, `Home` to reset from the keyboard.
  Height is clamped to leave the map at least 260 px and is re-clamped when the
  window shrinks. It survives navigation via `useUIStore`.
* Tabs carry live counts (pending dispatches, log entries).
* The top bar's status readouts are one grouped instrument cluster; stat tiles
  turn red when they are reporting a problem rather than just a number.
* Keyboard focus is visible everywhere and mouse focus never draws a ring;
  modals close on `Escape` and on backdrop click.

## B.6 — Supporting platform changes

| Area | Where |
|---|---|
| Domain model (missions, legs, units, facilities, lights, corridor sessions) | `src/domain/constants.js`, `src/store/*` |
| Simulation clock — tick based, 10 Hz, 1×–8× | `src/engine/simulation.js` |
| Single shared world state | `src/store/useWorldStore.js` |
| Priority usage — dispatch ordering and junction tie-break | `missions.js`, `preemption.js` |
| Demo seeding — facilities, units, scenario presets | `src/data/worldSeed.js`, `src/engine/scenarios.js` |

Decision logic deliberately lives in `src/engine/*`; the stores hold state and
primitive setters only, so there is one place where dispatch, routing and
preemption rules are defined.

## B.7 — Information architecture

```
Operations       map · missions · units · disasters · live A* · congestion
Green Corridor   frozen path · traffic lights · preemption · conflicts
Missions         dispatch queue · active · history · route comparison
Fleet            units and facilities
Disasters        active blockages
Analytics        response and corridor metrics
Logs             structured, filterable
Settings         calibration · demo scenarios · reset
```

## Retained from Part A

Node status colours, disaster injection from the map or the top bar, the four
disaster types, dashed original route after a reroute, dispatch approval, route
comparison (now A* vs Dijkstra *and* A* vs pre-replan path), analytics shell,
activity logging, settings and full reset. The 6×6 synthetic grid is gone,
replaced by the real Ghaziabad network described above.

---

## Not implemented (by request)

**B.4 — ML / vision channel.** No ML view, no observation intake, no inference.
The seam it plugs into already exists: a vision result would only need to write
a node's congestion index and, for hazard classes, add the node to the blocked
set — both of which are already the inputs routing consumes. Accident detections
would call `createMission()` exactly as the operator's New Mission dialog does.

---

## Verification performed

Package installation was unavailable in the environment this was written in, so
verification was done statically and headlessly rather than by running Vite:

* Every source file transpiled with the TypeScript compiler (JSX-aware) —
  0 syntax errors across 51 files.
* Every relative import resolved and every named binding checked against the
  target module's exports — 0 unresolved.
* Rules-of-hooks pass (no hook after an early return, no conditional hooks).
* Zustand selector audit — no selector returns a freshly built array/object
  (which would re-render on every tick).
* **Headless engine test** driving the real simulation with a stubbed clock:
  medical mission through both legs, fire mission single-leg completion,
  blockage-driven replanning with the original path retained, dispatch queueing
  when the fleet is exhausted, corridor preemption with contested junctions and
  a vehicle actually held, log category coverage, and numeric sanity on unit
  positions and congestion bounds.
* The same suite run against **four different networks**: the placeholder
  lattice, a synthetic city-scale network (712 junctions, 1147 curved segments,
  dead ends and a genuine articulation point), a network produced by the fetch
  script from a stubbed Overpass response, and **the real committed Ghaziabad
  extract** (769 junctions, 1094 segments). All pass on all four; the whole
  suite runs in about five seconds at city scale.
* The committed `network.json` separately checked for structural integrity:
  single connected component, every segment endpoint coincident with its
  junction to within 0.00 m, every stored length matching its polyline to
  within 0.5 m, no duplicate or self-referencing segments, every facility on a
  real junction, and 73% of segments carrying intermediate curve points
  (8.4 points per segment on average).
* **The fetch script tested end to end** against a synthetic Overpass payload
  shaped like real OSM data — shared crossing nodes, per-point way geometry, a
  dead-end spur and a disconnected island. Verified: intersections detected from
  shared node ids, ways split at them, pass-through junctions merged, the island
  dropped by largest-connected-component, junction names composed from the
  crossing road names, OSM hospitals and fire stations snapped on with synthetic
  top-ups, and every segment's geometry endpoints matching its junctions with no
  duplicates or dangling references.

Two behaviours worth knowing, both confirmed correct rather than bugs:

* A blockage on a junction the vehicle has **already driven past** does not
  trigger a replan. Only the part of the route still ahead is checked.
* If a blockage cuts the destination off entirely (a bridge, an articulation
  point), the unit **holds at the stop line** and raises an alert rather than
  driving through, teleporting, or failing silently.

The suite covers those explicitly. On the real Ghaziabad network it drives a
unit 7.1 km up to a cut vertex and asserts it comes to rest within 1 m of the
stop line, never advances past it however long the clock runs, and starts moving
again the instant the junction reopens. A separate section injects a disaster
with the clock **paused** and asserts the route is replanned with zero ticks
elapsed, the vehicle does not move (0.0 m of drift through the graft), progress
along the leg is preserved and the dashed comparison path is kept.

Static checks alongside it, all clean:

* Whole app parsed and module-resolved with the project's own bundler
  (`node scripts/check-build.mjs`) — 57 modules, no unresolved imports, no
  missing named exports. Runs in about a second, unlike a full production build.
* Rules-of-hooks and Zustand-selector audits across all 56 source files. Both
  checkers were themselves verified against a deliberately broken file first, so
  a clean result means clean rather than vacuous.

Please still run `npm run dev` once and click through — the above covers logic
and module wiring, not pixel layout.
