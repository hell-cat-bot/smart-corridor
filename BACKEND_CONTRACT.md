# Packmen — backend contract & core logic specification

**Audience:** whoever is building the FastAPI/web backend.
**Purpose:** everything the dashboard currently computes in the browser, specified precisely enough to reimplement server-side, plus the API surface the dashboard needs back.

Every number, formula and rule below was read out of the working frontend code — file paths are given so you can check any of it. Where the spec says "exactly", it means the dashboard's tests assert it.

---

## 0. The single most important thing to understand

The dashboard today is **100% client-side**. There is no server. All of the logic in this document runs in the browser at 10 Hz.

But it is structured in a way that makes it straightforward to move server-side, because of one existing rule:

> **Decision logic lives in `src/engine/*`. Stores hold state plus dumb setters only.**

Components never compute anything — they read from a Zustand store. The engine calls setters like `updateUnit(id, patch)`, `addDisaster(d)`, `setLight(nodeId, patch)`, `updateMission(id, patch)`.

So the migration is: **you reimplement `src/engine/*` in Python; a thin WebSocket adapter in the browser calls the same setters with your values instead of locally-computed ones.** No component changes. The frontend keeps the ability to run standalone (offline demo mode) as a fallback — the two must never run at the same time.

**What this means for you:** you own everything in sections 3–7. The frontend keeps rendering, map drawing, and operator input. Section 8 is the wire format between us.

---

## 1. File → responsibility map (where to read the reference implementation)

| Concern | File | Notes |
|---|---|---|
| Vocabulary, enums, tunables | `src/domain/constants.js` | Source of truth for all IDs and literals |
| World state shape | `src/store/useWorldStore.js` | The exact object you must be able to serialise |
| Tunable parameters | `src/store/useSettingsStore.js` | All defaults listed in §7 |
| Tick loop & movement | `src/engine/simulation.js` | Ordering matters — see §6 |
| A*, Dijkstra, cost fn | `src/utils/pathfinding.js` | `segmentCost`, `effectiveSpeed`, `aStar`, `planRoute` |
| Route geometry | `src/utils/geo.js` | `measurePath` — read §4.6 carefully |
| Dispatch & mission lifecycle | `src/engine/missions.js` | `rankUnits`, `chooseHospital`, state machine |
| Congestion model | `src/engine/congestion.js` | Civilian sim → density → EMA → hysteresis |
| Replanning & stranding | `src/engine/replanning.js` | Blockage + congestion replans, hold logic |
| Signal preemption | `src/engine/preemption.js` | `collectRequests`, `arbitrate`, `stepPreemption` |
| Disasters | `src/engine/disasters.js` | Inject/clear, limits |
| Structured log | `src/store/useLogStore.js` | Log record shape |
| Road network data | `src/data/network.json` | 769 junctions / 1094 segments, central Ghaziabad |

---

## 2. Domain vocabulary — use these exact string values

These are wire values. Do not translate, pluralise or re-case them.

```
SERVICE            medical | fire
UNIT_TYPE          ambulance | firetruck
SERVICE→UNIT_TYPE  medical→ambulance, fire→firetruck

UNIT_STATUS        available | assigned | en_route | on_scene | transporting | returning

FACILITY_TYPE      hospital | fire_station

MISSION_STATUS     pending | assigned | en_route_scene | on_scene | transporting | completed | cancelled
ACTIVE_MISSION_STATUSES = [assigned, en_route_scene, on_scene, transporting]

LEG_TYPE           to_scene | to_hospital        (plus the literal "return" used on route.legType only)

PRIORITY           1 = P1 Critical, 2 = P2 High, 3 = P3 Normal

NODE_STATUS        normal | congested | blocked

LIGHT_STATE        normal_green | normal_red | preempt_green | releasing

LOG_CATEGORY       mission | dispatch | routing | congestion | disaster | signal | conflict | simulation
SEVERITY           info | success | warning | critical
```

### Emergency classes (drive default priority and on-scene dwell)

```
medical:
  cardiac    Cardiac arrest          P1  dwell 45s
  trauma     Major trauma            P1  dwell 60s
  rta        Road accident           P1  dwell 50s
  stroke     Suspected stroke        P2  dwell 40s
  obstetric  Obstetric emergency     P2  dwell 55s
  transfer   Inter-facility transfer P3  dwell 30s

fire:
  structure_fire  Structure fire     P1  dwell 90s
  vehicle_fire    Vehicle fire       P2  dwell 60s
  hazmat          Hazmat spill       P1  dwell 100s
  rescue          Technical rescue   P2  dwell 80s
  alarm           Automatic alarm    P3  dwell 40s
```

An operator can also submit a **custom** class: `emergencyClass: "custom"` with a typed `emergencyLabel`, optional `dwellSeconds`, optional explicit `priority`. When no preset matches, defaults are **P2** and **45s dwell**. The mission carries `customEmergency: true`.

### Disaster types

Presets: `flood | landslide | earthquake | tsunami`. Operators may also submit `type: "custom"` with a typed `typeLabel`. Treat `type` as a free string; `typeLabel` is what humans see.

---

## 3. The road network (static input)

Loaded once from `src/data/network.json`. This does **not** change at runtime. Your backend should load the same file (or serve it to the frontend — see §8.1).

```jsonc
{
  "meta": {
    "placeholder": false,
    "area": "Central Ghaziabad, Uttar Pradesh",
    "source": "OpenStreetMap contributors (ODbL)",
    "bbox": { "south": 28.63, "west": 77.38, "north": 28.71, "east": 77.47 },
    "junctions": 769,
    "segments": 1094
  },
  "center": { "lat": 28.661449, "lng": 77.42458 },
  "zoom": 14,

  "nodes": [
    { "id": "J0001", "osmId": 9987982808, "lat": 28.661449, "lng": 77.425685,
      "name": "Delhi Gate Flyover junction", "degree": 3 }
  ],

  "edges": [
    { "from": "J0004", "to": "J0005",
      "length": 475,                       // metres, measured along the polyline
      "roadName": "Wazirabad Road",
      "roadClass": "trunk",
      "geometry": [[28.66,77.42], [28.661,77.421], ...]   // [lat,lng] pairs
    }
  ],

  "facilities": [
    { "id": "HOSP-01", "type": "hospital", "node": "J0444",
      "name": "Sakshi Medicare", "short": "Sakshi Medicare", "beds": 10 },
    { "id": "FS-01", "type": "fire_station", "node": "J0266",
      "name": "Fire Station 1", "short": "Fire Station 1", "bays": 2, "synthetic": true }
  ]
}
```

**Critical properties you must preserve:**
- The graph is **undirected** and **a single connected component**.
- `edge.length` is the real measured road distance — **always use it**, never recompute haversine between the two junctions (roads curve; the error is significant).
- `edge.geometry` runs `from → to`. Reverse it when traversing `to → from`.
- Build an edge index keyed by the **sorted** pair: `f"{min(a,b)}|{max(a,b)}"`. The frontend does exactly this (`src/data/network.js` → `edgeKey`).

---

## 4. Entity shapes

These are what you serialise to the dashboard. Field names must match exactly.

### 4.1 Node (mutable runtime state on top of the static node)

```jsonc
{
  "id": "J0231", "lat": 28.66, "lng": 77.42, "name": "GT Road / Hapur Road", "degree": 4,
  "congestion": 0.42,        // float 0..1, EMA-smoothed
  "rawDensity": 1.8,         // float, pre-smoothing (debug/telemetry)
  "status": "normal"         // normal | congested | blocked
}
```

### 4.2 Unit

```jsonc
{
  "id": "AMB-01",
  "label": "Ambulance Alpha",
  "type": "ambulance",
  "service": "medical",
  "homeFacilityId": "HOSP-01",     // where it returns to
  "baseFacilityId": "HOSP-02",     // where it currently is based (changes after a hospital drop-off)
  "status": "en_route",
  "missionId": "M-003",            // null when idle
  "node": "J0122",                 // last junction cleared
  "pos": { "lat": 28.66, "lng": 77.42 },
  "heading": 143.2,                // degrees, 0 = north
  "route": { ... },                // see 4.6; null when idle
  "blocked": null,                 // see 4.7
  "dwellRemaining": 0,             // seconds, counts down while on_scene
  "lastReplanAt": -999,            // simTime of last replan (cooldown bookkeeping)
  "replanCount": 0,
  "missionsCompleted": 0
}
```

**Seeding rule** (`src/data/worldSeed.js`): 2 ambulances at the first hospital, 1 at each additional hospital; 2 engines at the first station, 1 at each additional. IDs `AMB-01..`, `FT-01..`.

### 4.3 Mission

```jsonc
{
  "id": "M-001",
  "service": "medical",
  "emergencyClass": "cardiac",
  "emergencyLabel": "Cardiac arrest",
  "customEmergency": false,
  "priority": 1,
  "sceneNode": "J0455",
  "note": "",
  "status": "en_route_scene",
  "unitId": "AMB-02",              // null until approved
  "suggestedUnitId": "AMB-02",
  "suggestedEta": 184.3,
  "candidates": [ /* top 5 from rankUnits, see 5.3 */ ],
  "originFacilityId": "HOSP-01",
  "hospitalFacilityId": "HOSP-03", // null until leg 2 starts
  "legs": [ /* see 4.4 */ ],
  "activeLeg": 0,                  // index into legs, -1 before dispatch
  "dwellTotal": 45,
  "dwellRemaining": 0,
  "createdAt": 12.4,               // simTime
  "approvedAt": 13.1,
  "onSceneAt": null,
  "completedAt": null,
  "replans": 0
}
```

IDs are `M-001`, `M-002`, … zero-padded to 3.

### 4.4 Leg

```jsonc
{
  "type": "to_scene",
  "from": "J0122", "to": "J0455",
  "path": ["J0122", "J0130", ...],   // current path (updated on replan)
  "originalPath": null,              // set on first replan — the pre-replan path, drawn dashed
  "distance": 2114,                  // metres
  "plannedEta": 168.2,               // seconds, congestion-aware at plan time
  "freeFlowEta": 126.5,              // seconds, zero-congestion — denominator of the efficiency metric
  "startedAt": 13.1,
  "completedAt": null,
  "replans": 0
}
```

### 4.5 Facility / Disaster / Light

```jsonc
// Facility — static, from network.json

// Disaster
{ "id": "DIS-001", "type": "flood", "typeLabel": "Flood", "node": "J0231",
  "severity": 0.85, "note": "", "label": "Flood — GT Road / Hapur Road",
  "simTime": 44.2, "timestamp": "2026-08-19T04:15:36.727Z" }

// Light — map keyed by nodeId; a junction absent from the map is on its normal cycle
{ "nodeId": "J0231", "state": "preempt_green", "servingUnitId": "AMB-01",
  "missionId": "M-001", "since": 44.2, "releaseAt": null,
  "contested": true, "queue": ["FT-02"] }
```

### 4.6 Route — read this section carefully, it is the subtlest part

A route carries **two parallel measurement systems**. Getting this wrong breaks preemption and ETAs in ways that are hard to debug.

```jsonc
{
  "path":           ["J0122","J0130","J0141"],   // junctions only — few entries
  "coords":         [[lat,lng], ...],            // full road polyline — MANY entries (avg 8.4 pts/segment)
  "cumulative":     [0, 12.3, 25.1, ...],        // metres at each polyline point — same length as coords
  "nodeCumulative": [0, 475, 1210],              // metres at each JUNCTION — same length as path
  "total":          1210,                        // metres
  "travelled":      340.5,                       // metres covered so far
  "legType":        "to_scene",                  // to_scene | to_hospital | return
  "destNode":       "J0141",
  "originalPath":   null,
  "unitType":       "ambulance",
  "plannedAt":      13.1
}
```

- **`coords` / `cumulative`** → drawing the line and positioning the vehicle. Follows the real road curve.
- **`nodeCumulative`** → anything reasoning about *junctions*: preemption distance, replan anchors, ETA slicing.

**Never index `path` with a `coords` index.** They are different lengths.

Construction (`measurePath` in `src/utils/geo.js`): start at `path[0]`; for each hop look up the edge, append its geometry (reversed if traversing `to→from`), skipping duplicate points; push the running total into `nodeCumulative` at each junction.

Helper semantics you will need:
- `nextNodeIndex(nodeCumulative, travelled)` → index of first junction at or beyond current position (tolerance 0.001 m).
- `lastNodeAt(...)` → last junction reached (this is `unit.node`).
- `nextNodeAt(...)` → the junction being driven *into* (this sets the current speed).
- `positionAlongPath(coords, cumulative, travelled)` → binary search + linear interpolation → `{lat, lng, heading}`.

### 4.7 Blocked (stranded) state

```jsonc
"blocked": {
  "node": "J0598",        // the impassable junction
  "since": 88.4,          // simTime the hold started
  "lastTry": 96.0,        // simTime of the last replan attempt
  "stopAt": 7143.0,       // metres along the route where the vehicle must stop
  "destNode": "J0700"
}
```

### 4.8 Log record

```jsonc
{
  "id": "LOG-412", "seq": 412,
  "wallTime": "2026-08-19T04:15:36.727Z",
  "simTime": 88.4,
  "category": "routing",
  "severity": "critical",
  "message": "Ambulance Alpha is stranded — every route to its destination is cut by a blockage at J0598",
  "refs": { "unitId": "AMB-01", "missionId": "M-003", "nodeId": "J0598" },
  "data": { /* the structured decision payload — free-form per event */ }
}
```

Frontend keeps the newest 800, newest-first. Server-side this should go to a real table.

---

## 5. Core algorithms

### 5.1 Congestion pipeline

Four stages, in order:

**(a) Ambient baseline** — computed once at init, static per node. Stops the network being uniformly empty:

```
centroid = mean(lat), mean(lng) over all nodes
central  = 1 - distance_to_centroid / max_distance      # 0..1
busy     = (degree - 1) / max(max_degree - 1, 1)        # 0..1
ambient[v] = 0.04 + 0.16 * central + 0.08 * busy        # range ≈ 0.04 .. 0.28
```

**(b) Civilian agents** — 45 by default. Each has `{node, nextNode, progress 0..1, speedFactor 0.7..1.3}`. Per tick:

```
seg_length = edge.length (from the edge index)
speed      = FREE_FLOW_SPEED.civilian (9.7 m/s) * speedFactor
progress  += speed * dt / seg_length
on arrival (progress >= 1): node = nextNode; progress = 0
  pick nextNode from neighbours, excluding blocked junctions,
  preferring not to immediately double back
```

**(c) Density → target index:**

```
# each civilian contributes to the two junctions it is between
density[civ.node]     += 1 - civ.progress
density[civ.nextNode] += civ.progress

target[v] = min(1, ambient[v] + density[v] / max(densitySaturation, 0.5))    # densitySaturation = 4
```

**(d) EMA smoothing + hysteresis:**

```
c[v] = clamp(c[v] + 0.18 * (target[v] - c[v]), 0, 1)      # congestionSmoothing = 0.18

status transition:
  if v is blocked by a disaster        -> blocked
  elif previous status == congested    -> normal if c < 0.45 else congested
  else                                 -> congested if c > 0.60 else normal
```

The 0.60 / 0.45 gap is **hysteresis** — it exists so junction badges don't flicker on the threshold. Do not collapse it to a single threshold.

Runs every **5 ticks** (twice a second), not every tick. Congestion is logged only every **20 simulation seconds** — it is high-volume and would drown the feed otherwise.

### 5.2 Routing cost function and A*

```python
def segment_cost(length, congestion, alpha, omega):
    c = clamp(congestion, 0, 1)
    return length * (1 + alpha * c * omega)
```

- `length` = `edge.length` (measured road metres).
- `congestion` = the index of the **destination** node of that edge (the junction being entered).
- `alpha` = `congestionFactor`, default **2.0**.
- `omega` = per vehicle class: **ambulance 0.6, firetruck 0.8, civilian 1.0**. Emergency vehicles are partly shielded from congestion because preemption is already clearing their approach.

A* heuristic is **haversine straight-line distance to the goal** — admissible because `segment_cost >= length >= haversine`.

Blocked (disaster) junctions are **removed from the graph entirely** before search — infinite cost, independent of congestion.

Speed model:

```python
def effective_speed(base_speed, congestion):
    c = clamp(congestion, 0, 1)
    return max(base_speed * (1 - 0.65 * c), base_speed * 0.2)   # CONGESTION_SLOWDOWN = 0.65
```

Free-flow speeds: ambulance **16.7 m/s**, firetruck **13.9 m/s**, civilian **9.7 m/s**.

ETA of a path:

```python
def path_travel_time(path, congestion, base_speed):
    return sum(edge_length(path[i], path[i+1]) / effective_speed(base_speed, congestion[path[i+1]])
               for i in range(len(path) - 1))
```

`free_flow_eta` is the same with all congestion = 0. It is the denominator of the efficiency metric.

A plan result must carry: `{found, path, cost, distance, expanded, eta, freeFlowEta, algorithm}`. `expanded` (nodes popped) is shown in the UI's route-comparison panel — keep it.

Dijkstra is retained as the heuristic-free baseline for the A*-vs-Dijkstra comparison view. Same cost function, no heuristic.

### 5.3 Dispatch ranking — `rankUnits(service, sceneNode)`

This is the part people misread. **Dispatch is ETA-based, not distance-based.**

```
wantedType = SERVICE_UNIT_TYPE[service]

for each unit:
    skip if unit.type != wantedType
    skip if unit.status not in (available, returning)
    plan = A*(from = unit.node, to = sceneNode, omega = omega(unit.type))
    skip if not plan.found
    atBase = 0 if status == available else 12        # returning units pay a 12s penalty
    candidate = { unitId, label, fromNode, facilityId, eta, distance, cost,
                  score = plan.eta + atBase, path }

sort by score ascending
```

Consequence worth stating explicitly, because it is the headline behaviour: **a nearer ambulance whose route runs through congestion can lose to a farther one on clear roads**, because congestion inflates both the path cost (via `alpha·c·omega`) and the travel time (via `effective_speed`).

The **full candidate list (top 5)** is stored on the mission and written to the log — this is the auditability story, don't drop it.

### 5.4 Hospital choice — `chooseHospital(sceneNode, unit)`

```
options = [ A*(sceneNode -> hospital.node) for every hospital, where found ]
sort by eta ascending
best = options[0]
home = the option whose facility.id == unit.homeFacilityId

chosen = home if (home exists and home.eta <= best.eta * 1.1) else best
```

The 10% tolerance is a deliberate preference for the unit's home hospital when it is effectively as good. All alternatives considered are logged.

### 5.5 Mission lifecycle state machine

```
                  createMission()
                        │
                        ▼
                   [pending] ──────── cancelMission() ──────► [cancelled]
                        │
              approveMission()  (auto if settings.autoApprove)
                        │
                        ▼
              [en_route_scene]  unit: en_route,  leg 1 = to_scene
                        │  arrival (travelled >= total - 0.25 m)
                        ▼
                  [on_scene]    unit: on_scene, route = null, dwellRemaining = dwellTotal
                        │  dwell expires
            ┌───────────┴────────────┐
   service == medical         service == fire
            │                        │
            ▼                        ▼
    [transporting]              [completed]
    leg 2 = to_hospital,        then sendUnitHome() → unit: returning
    replanned fresh from             (planned with alpha = 0 — NOT an optimised
    the scene                         response leg, plain shortest distance)
            │ arrival                      │ arrival
            ▼                              ▼
      [completed]                    unit: available at home facility
   unit: available at the
   destination hospital;
   baseFacilityId := that hospital
```

Notes that matter:
- Leg 2 is **planned fresh at dwell-completion**, not precomputed at dispatch — congestion has moved on by then.
- After a medical mission the ambulance's `baseFacilityId` becomes the **receiving hospital**, not its home. `homeFacilityId` is unchanged.
- Fire has **one** optimised leg. The return to station is explicitly not part of the response and is planned with `alpha = 0`.
- If no hospital is reachable at dwell-completion, the unit holds on scene with `dwellRemaining = 15` and retries.
- Pending missions are re-evaluated as units free up (`refreshPendingSuggestions`) — a queued call gets picked up automatically. When re-evaluating multiple pending missions in one pass, a unit already claimed by an earlier mission in that pass must not be offered to a later one.

### 5.6 Replanning

Two independent passes with very different trigger conditions.

**(a) Blockage replan** — runs **every tick**, and additionally **immediately on disaster inject/clear** (see §6.1):

```
blocked = { d.node for d in disasters }
early-exit if blocked is empty AND no unit is currently held

for each unit with a route:
    hit = first junction in path[nextNodeIndex(...):] that is in blocked
    if no hit:
        if unit was held -> release it, log success
        continue
    if unit is already held and (simTime - blocked.lastTry) < 2s:
        continue                                  # don't run A* every tick while stuck
    anchor = path[nextNodeIndex(...)]             # the junction being driven into
    from   = unit.node if anchor in blocked else anchor
    plan   = A*(from -> route.destNode)
    if plan is None:  -> HOLD (see 5.7)
    else:             -> apply replan
```

**(b) Congestion replan** — runs every **10 ticks** (once a second), heavily gated so paths don't thrash:

```
skip if unit has no route, or is held, or legType == "return"
skip if (simTime - unit.lastReplanAt) < replanCooldown          # 10 s
anchor = next junction ahead; skip if anchor == destNode
currentEta = ETA of the remaining path
plan       = A*(anchor -> destNode)
improvement = (currentEta - plan.eta) / currentEta
if path unchanged OR improvement < replanImprovement (0.12):
    just stamp lastReplanAt and skip
else apply replan
```

**Applying a replan — the position-preservation rule.** A replan is planned *from the junction ahead*, so naively swapping the route would teleport the vehicle forward to that junction. Instead, graft the current partial segment onto the front:

```
idx      = nextNodeIndex(nodeCumulative, travelled)
prevNode = path[max(0, idx - 1)]
into     = travelled - nodeCumulative[max(0, idx - 1)]     # metres into the current segment

if idx > 0 and newTail[0] != prevNode:
    newPath      = [prevNode] + newTail
    newTravelled = min(into, newNodeCumulative[1])
else:
    newPath      = newTail        # U-turn case: restart from prevNode
    newTravelled = 0
```

Also: set `leg.originalPath = leg.originalPath or previousPath` (so the map can draw the dashed pre-replan line), increment `unit.replanCount`, `mission.replans`, `leg.replans`, and the `replans` + (`blockageReplans` | `congestionReplans`) metrics.

### 5.7 Stranded vehicles (hold behaviour)

When a blockage cuts off **every** route to the destination, the vehicle must **not** drive through it.

```
stopAt = nodeCumulative[index of blocked junction] - 30 m     # STOP_MARGIN
unit.blocked = { node, since (preserved across retries), lastTry, stopAt, destNode }
log once at severity=critical — do not re-log on every retry
```

In the movement loop the travel limit becomes `min(stopAt, route.total)` instead of `route.total`, and a held unit **never** fires an arrival event.

Release is automatic: on the next blockage pass where the remaining path no longer hits a blocked junction, clear `blocked` and log a success. The frontend surfaces held units as a red alert bar, a red halo on the map, and a "Blocked" badge in the fleet list — so the `blocked` field must be present in the unit payload you stream.

`blocked` must be cleared anywhere a unit's route is set or cleared (dispatch, arrival, transport start, return, release).

### 5.8 Signal preemption and junction arbitration

**Collect requests** (`collectRequests`) — every tick:

```
for each unit where route exists and status in (en_route, transporting):
    priorityClass = 1 if unit.type == "ambulance" else 2
    for each nodeId in route.path:
        distance = nodeCumulative[index] - travelled      # ahead only; skip if negative/inf
        skip if distance > preemptRadius (260 m)
        speed = effective_speed(base_speed(unit.type), congestion[nodeId])
        eta   = distance / max(speed, 0.5)
        requests[nodeId].append({nodeId, unitId, unitLabel, missionId,
                                 priority: priorityClass, distance, eta, requestedAt: simTime})
```

> ⚠️ **Accuracy note.** The `priority` used at junctions today is the **vehicle class** (ambulance=1, firetruck=2), *not* the mission's P1/P2/P3 severity. If you want a P1 cardiac call to outrank a P3 transfer at a junction, that is a deliberate change: feed `mission.priority` into the request instead. Worth deciding explicitly rather than assuming.

**Arbitrate** (`arbitrate`) — deterministic, no randomness, no starvation:

```
sort requests by:
  1. priority              ascending
  2. eta                   ascending   (tolerance 0.001 s)
  3. requestedAt           ascending
  4. unitId                lexicographic       # final deterministic tie-break

winner = sorted[0]; losers = rest
reason = "higher priority class"
       | "equal priority, earlier ETA to junction"
       | "equal priority and ETA, earlier request"
       | "equal on all keys, deterministic unit-id tie-break"
       | "sole requester"
```

**Step lights** (`stepPreemption`):

```
for each requested junction:
    winner gets state = preempt_green, servingUnitId, missionId,
        since (preserved unless this is a new grant),
        contested = losers non-empty, queue = [loser unit ids]
    if new grant -> increment granted, emit a SIGNAL/success log
    if contested and (new grant or previously uncontested) -> increment conflicts,
        emit a CONFLICT/warning log containing the full contender list and the tie-break reason

for each previously-held junction no longer requested:
    releaseAt = light.releaseAt or (simTime + releaseDelay 3s)
    if simTime >= releaseAt -> drop from the map entirely, emit a SIGNAL/info release log
    else -> state = releasing, contested = false
```

A junction **absent from the lights map** is on its normal cycle (`signalCycle` = 16 s). Only preempted/releasing junctions appear in the map — don't stream 769 light objects.

---

## 6. Tick loop — order is part of the spec

`TICK_MS = 100` (10 Hz). `dt = 0.1 * speed` where `speed` is the operator's 1×–8× multiplier.

```
 1. simTime += dt;  tickCount += 1
 2. step civilian agents                              (every tick)
 3. update congestion + node status                   (every 5 ticks)
 4. move the fleet:
       for each unit:
         if on_scene and dwellRemaining > 0: dwellRemaining -= dt; queue dwell-complete at <= 0
         else if route exists:
           ahead    = nextNodeAt(path, nodeCumulative, travelled)
           speed    = effective_speed(base_speed(type), congestion[ahead])
           limit    = blocked ? min(blocked.stopAt, total) : total
           travelled = min(travelled + speed * dt, limit)
           pos, heading = positionAlongPath(coords, cumulative, travelled)
           node     = lastNodeAt(path, nodeCumulative, travelled)
           if not blocked and travelled >= total - 0.25: queue arrival
 5. commit the world patch (units, simTime, tick, nodes, civilians, congestionHistory)
 6. fire arrivals   -> onLegComplete(unitId)
 7. fire dwell-done -> onDwellComplete(unitId)
 8. runBlockageReplans(simTime)                       (every tick)
 9. runCongestionReplans + refreshPendingSuggestions  (every 10 ticks)
10. runPreemption(simTime, congestion, settings)      (every tick)
11. stepCorridor(dt, simTime) if a corridor session is active
```

`congestionHistory` samples `{t, mean}` every **50 ticks**, keeping the last 120 points.

### 6.1 Out-of-band replanning — do not skip this

Injecting or clearing a disaster **must trigger the blockage replan pass synchronously**, not wait for the next tick. Rationale: the operator expects the new optimal path on screen the instant the blockage lands, and they are most likely studying the map **with the clock paused** — where no tick will ever come. The frontend calls `reactToNetworkChange()` (blockage replans + pending-suggestion refresh) directly from inject and clear.

Server-side equivalent: after any mutation of the blocked set, run the blockage pass and push the resulting deltas immediately.

---

## 7. Tunable parameters (all operator-adjustable in Settings)

| Parameter | Default | Meaning |
|---|---|---|
| `congestionFactor` (α) | 2.0 | Congestion weight in the cost function |
| `priorityWeights.ambulance` (ω) | 0.6 | Congestion penalty for ambulances |
| `priorityWeights.firetruck` (ω) | 0.8 | Congestion penalty for fire engines |
| `priorityWeights.civilian` (ω) | 1.0 | Baseline |
| `replanCooldown` | 10 s | Minimum gap between congestion replans of one unit |
| `replanImprovement` | 0.12 | Minimum ETA saving to accept a congestion replan |
| `civilianCount` | 45 | Background traffic agents |
| `congestionSmoothing` | 0.18 | EMA factor (higher = more reactive) |
| `densitySaturation` | 4 | Civilians near a node that read as fully congested |
| `autoApprove` | false | Skip operator approval on dispatch |
| `dwellScale` | 1.0 | Multiplier on on-scene dwell |
| `preemptRadius` | 260 m | Approach distance at which a green is requested |
| `releaseDelay` | 3 s | Hold after the unit clears before releasing the junction |
| `signalCycle` | 16 s | Normal (unpreempted) cycle length |
| `maxDisasters` | 8 | Hard cap on simultaneous blockages |
| **Fixed constants** | | |
| `TICK_MS` | 100 | Engine tick |
| `CONGESTION_HYSTERESIS` | 0.60 / 0.45 | Enter / leave "congested" |
| `CONGESTION_SLOWDOWN` | 0.65 | Speed loss at c = 1 |
| `FREE_FLOW_SPEED` | 16.7 / 13.9 / 9.7 m/s | ambulance / firetruck / civilian |
| Hold stop margin | 30 m | How far short of a blockage a held vehicle stops |
| Hold retry interval | 2 s | Re-attempt cadence while stranded |
| Arrival tolerance | 0.25 m | Distance-to-end that counts as arrival |
| Returning-unit penalty | 12 s | Added to score in dispatch ranking |
| Home-hospital tolerance | 1.10× | Prefer home hospital within 10% of nearest |
| Log ring buffer | 800 | Frontend only; persist server-side |

Changing α or ω must take effect on the **next** plan, not retroactively rewrite existing routes.

---

## 8. Proposed API surface

Split by traffic shape: commands and cold reads over REST, hot state over a stream.

### 8.1 REST — bootstrap and cold reads

```
GET  /api/network                 -> the static network.json (or serve the file directly)
GET  /api/world/snapshot          -> full current state, see 8.2
GET  /api/settings                -> current tunables
PATCH /api/settings               -> { congestionFactor?, priorityWeights?, ... }

GET  /api/missions?status=&limit= -> mission list / history
GET  /api/missions/{id}           -> single mission incl. legs and candidate ranking
GET  /api/logs?category=&severity=&since=&limit=  -> structured log query
GET  /api/analytics/summary       -> metrics block (see 8.2)
```

### 8.2 Snapshot payload

Exactly the frontend's world state, so it can hydrate in one shot:

```jsonc
{
  "simTime": 412.7, "tick": 4127, "running": true, "speed": 1,
  "nodes":      [ /* 4.1 — only mutable fields needed if network is fetched separately */ ],
  "units":      [ /* 4.2 */ ],
  "missions":   [ /* 4.3 */ ],
  "disasters":  [ /* 4.5 */ ],
  "lights":     { "J0231": { /* 4.5 */ } },     // only preempted/releasing junctions
  "civilians":  [ { "id": "CIV-001", "pos": {"lat":..,"lng":..} } ],  // only if the client wants them
  "congestionHistory": [ { "t": 400, "mean": 0.31 } ],
  "metrics": {
    "replans": 12, "blockageReplans": 3, "congestionReplans": 9,
    "preemptionsGranted": 87, "conflictsResolved": 4,
    "missionsCompleted": 6, "unservedRequests": 1,
    "responseTimes": [ 184.2, ... ],       // seconds, last 200
    "efficiencySamples": [ 0.74, ... ]     // freeFlowEta / actual, capped at 1, last 200
  }
}
```

### 8.3 Commands (operator actions)

```
POST /api/missions
  { service, emergencyClass, sceneNode, priority?, note?,
    emergencyLabel?, dwellSeconds? }          // last two for custom classes
  -> the created mission (incl. suggestedUnitId + candidate ranking)

POST /api/missions/{id}/approve   -> dispatches the suggested (or best available) unit
POST /api/missions/{id}/cancel

POST /api/disasters
  { node, type, typeLabel?, severity?, label?, note? }
  -> the created disaster, or 409 if the junction is already blocked / cap reached

DELETE /api/disasters/{id}
DELETE /api/disasters/by-node/{nodeId}

POST /api/sim/start | /pause | /step   { seconds? }
POST /api/sim/speed                    { speed: 1|2|4|8 }
POST /api/sim/reset

POST /api/routes/compare
  { from, to, unitType, algorithm: "astar"|"dijkstra" }
  -> { path, distance, cost, eta, freeFlowEta, expanded }
  // powers the A*-vs-Dijkstra comparison panel; pure query, no state change
```

Every command should return the resulting entity **and** emit the corresponding delta on the stream, so the initiating client and every observer converge the same way.

### 8.4 WebSocket — hot state

One connection, server→client, batched. Do **not** send one message per changed field; the frontend's setters are already batch-shaped.

```jsonc
// ~10 Hz, or throttle to 5 Hz if bandwidth matters — the frontend interpolates marker motion
{ "type": "tick", "simTime": 412.7, "tick": 4127,
  "units":  [ { "id": "AMB-01", "pos": {...}, "heading": 143.2,
                "route": { "travelled": 340.5 }, "node": "J0122",
                "status": "en_route", "blocked": null } ],
  "lights": { "J0231": {...}, "J0455": null },        // null = released
  "nodes":  [ { "id": "J0231", "congestion": 0.62, "status": "congested" } ]   // changed only
}

// discrete events, as they happen
{ "type": "mission.created",   "mission": {...} }
{ "type": "mission.updated",   "mission": {...} }
{ "type": "unit.route",        "unitId": "AMB-01", "route": { /* full route object */ } }
{ "type": "unit.blocked",      "unitId": "AMB-01", "blocked": {...} }
{ "type": "unit.released",     "unitId": "AMB-01" }
{ "type": "disaster.created",  "disaster": {...} }
{ "type": "disaster.cleared",  "disasterId": "DIS-001", "node": "J0231" }
{ "type": "log",               "entries": [ {...} ] }
{ "type": "metrics",           "metrics": {...} }
```

Send the **full route object** only when a route actually changes (dispatch, replan, leg change) — it contains the whole polyline and is by far the largest payload. Per-tick, send only `travelled`.

Reconnect protocol: client calls `/api/world/snapshot`, then resubscribes. Don't replay event history.

---

## 9. ML integration seam

The seam already exists conceptually — the frontend's notes describe it for the deferred vision section. Keep the ML service domain-ignorant: frames in, detections out, no knowledge of missions or junction IDs. The **backend** owns the translation.

```
detection { cameraId, class, confidence, bbox, timestamp }
        │
        ▼
  camera → junction mapping (backend-owned config)
        │
        ├─ congestion-class detection, any confidence
        │     -> nudge that junction's congestion index
        │        (cheap, reversible, no operator interruption)
        │
        └─ hazard / accident class, high confidence
              -> do NOT auto-block blindly.
                 Mirror the dispatch trust model: raise a *suggestion* that
                 auto-applies when autoApprove is on, otherwise surfaces to the
                 operator to confirm.
                 On confirm -> injectDisaster(node) and/or createMission(...)
```

Whatever path is taken, log it through the existing categories (`disaster`, `mission`, `congestion`) with the **model version and confidence** in `data`, so "why did the system do this" stays answerable.

Transport between backend and ML service: start with **pull** (`POST /infer/frame` when the backend wants an inference) — simpler and deterministic to demo. Move to **push** with a small queue in front once camera feeds are genuinely continuous.

---

## 10. Invariants and known traps

Things that are easy to get wrong and hard to debug afterwards.

1. **Never index `route.path` with a `route.coords` index.** Different lengths. Junction reasoning uses `nodeCumulative` only.
2. **Always use `edge.length`**, never haversine between junctions — real roads curve and the difference is material to both cost and ETA.
3. **A blockage the vehicle has already driven past must not trigger a replan.** Only scan `path[nextNodeIndex(...):]`. This looks like a bug and is not.
4. **If a blockage cuts the destination off entirely, hold — do not fail silently and do not drive through.** Log critical, retry every 2 s, release automatically.
5. **Congestion replans must stay gated** by both cooldown *and* improvement threshold, or routes thrash every tick and the map becomes unreadable.
6. **Preserve vehicle position across a replan** (§5.6). Without the graft, vehicles visibly teleport forward to the next junction on every reroute.
7. **`since` on a held unit and on a preempted light must survive retries/regrants** — otherwise "held for Xs" resets constantly.
8. **Congestion updates every 5 ticks, logs every 20 sim-seconds.** Logging every changed node instead would emit on the order of 1,500 records/second (769 junctions × 2 updates/s) and bury every other category.
9. **The lights map contains only preempted/releasing junctions.** Absence means normal cycle.
10. **A junction contest is currently decided by vehicle class, not mission priority** (§5.8). Decide deliberately whether to change this.
11. **`baseFacilityId` changes after a hospital drop-off; `homeFacilityId` does not.** Dispatch ranks from `unit.node`; returns go to `homeFacilityId`.
12. **Efficiency metric is `freeFlowEta / actualLegDuration`, capped at 1**, sampled per completed leg. A leg starting at simTime 0 is falsy — check `is not None`, not truthiness.

---

## 11. Suggested build order

Sequencing matters because it decides what's demoable if something slips.

1. **Port the engine, no ML.** Network loading → A* + cost function → congestion → mission lifecycle → replanning → preemption. Validate against the frontend: same seed, same inputs, same dispatch decisions.
2. **Add the API + WebSocket.** Frontend gets a live-mode adapter behind a feature flag. Offline demo mode keeps working as a fallback — this is what makes demo day safe.
3. **ML service standalone.** Independently demoable against sample frames before it is wired to anything.
4. **Wire the seam last.** By then the backend already knows how to create missions and inject disasters; all that is new is the translation function.

The point of this order is that the riskiest, newest component is never on the only path to a working demo.
