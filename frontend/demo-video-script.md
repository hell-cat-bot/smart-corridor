# 2-minute demo script — Congestion, priority dispatch & signal arbitration, graph rerouting

Total run time target: **~120 seconds**. Times are cumulative — hit each cue within a few seconds of it and you'll land the demo on time. Practice the click sequence once before recording so you're not hunting for buttons on camera.

Recommended prep before you hit record:
- Reset the world (Settings → Reset) so the fleet is idle and the network is clear.
- Turn on **Settings → Show civilians** so the background traffic is visible.
- Have the Operations map centred on a mid-density part of the network, zoomed so 3–4 junctions are comfortably on screen.
- Have a New Mission and an Inject Disaster ready to fire from memory (junction names), so you're not searching live.

---

## 0:00–0:15 — Cold open (15s)

**Show:** Operations view, sim running at 1x, civilians moving.

**Say:**
> "This is Packmen — a live emergency-routing dashboard for a 5G-URLLC V2X green corridor. Everything you're about to see — congestion, dispatch, and rerouting — runs on a real road network of Ghaziabad pulled from OpenStreetMap, not a mock grid."

---

## 0:15–0:45 — Congestion model (30s)

**Show:** Point at a junction turning amber/red as civilian density builds. Open the Congestion tab in the bottom panel to show the live index. Optionally hover a junction popup to show its congestion %.

**Say:**
> "Traffic isn't scripted — it's simulated. Background civilian vehicles circulate the network every tick, and each junction tracks how many are near it. That raw density gets smoothed with an exponential moving average, so one lucky gap doesn't make a junction look clear.
>
> The result is a congestion index between 0 and 1 per junction. It doesn't flicker — it uses hysteresis: a junction only becomes 'congested' above 60%, and only clears again below 45%. That gap is what keeps the map calm instead of strobing red and green every second."

**Caption/on-screen text (optional overlay):** `c(v) ∈ [0,1] · EMA-smoothed · congested >0.60, clears <0.45`

---

## 0:45–1:15 — Priority-based dispatch & signal arbitration (30s)

**Show:** Click **New Mission**, pick a P1 emergency (e.g. Cardiac arrest), show the system proposal panel ranking candidate units by ETA. Create it, then cut to the Green Corridor view where two vehicles converge on the same junction — show the contest resolve and a light flip to preempt-green for the winner.

**Say:**
> "When a call comes in, the system doesn't just find the nearest ambulance — it ranks every available unit by congestion-aware ETA from its base, and dispatches the best one. Every candidate considered is written to the log.
>
> The same priority logic runs at intersections. When two emergency vehicles both need a green light, it's resolved deterministically: higher priority class wins first — a P1 cardiac call beats a P3 transfer — then earliest arrival, then request order, then a fixed tie-break. No randomness, no starvation. The loser holds at the stop line until the winner clears, then gets its own green wave."

**Caption/on-screen text (optional overlay):** `priority class → ETA to junction → request order → tie-break`

---

## 1:15–1:50 — Graph rerouting (35s)

**Show:** Click **Inject disaster** on a junction the dispatched unit is about to cross. Immediately show the route flip on the map — dashed line for the old path, solid for the new one. Then show a second disaster that leaves no way through, and the unit holding at a red halo with the "stranded" alert bar.

**Say:**
> "Routing is A* over the live road graph, but the edge weights aren't fixed distances — they're distance times a congestion penalty, scaled per vehicle type. Ambulances are partly shielded from congestion, because the green wave is already clearing their path.
>
> Drop a disaster on a junction and every vehicle already crossing it replans immediately — you can see the old path stay on the map as a dashed line for comparison, and the new one take over solid, live, whether the simulation is running or paused.
>
> And if a blockage cuts off every possible route, the vehicle doesn't drive through it — it holds at a stop line, flags itself stranded, and the operator gets an alert. It resumes automatically the moment a route reopens."

**Caption/on-screen text (optional overlay):** `W(u,v) = d(u,v) × (1 + α·c(v)·ω_class)`

---

## 1:50–2:00 — Close (10s)

**Show:** Pull back to the full Operations view with stat cards visible (response time, active missions, rerouted legs).

**Say:**
> "Congestion, priority, and routing all update in real time, on real roads — this is Packmen."

---

## Cheat-sheet: the numbers, if anyone asks in Q&A

| What | Value |
|---|---|
| Congestion smoothing (EMA factor) | 0.18 |
| Congested threshold / clears threshold | 0.60 / 0.45 (hysteresis) |
| Civilians simulated | 45 (adjustable) |
| Cost function | `W(u,v) = d(u,v) × (1 + α·c(v)·ω)` |
| α (congestion factor, default) | 2.0 |
| ω — ambulance / firetruck / civilian | 0.6 / 0.8 / 1.0 |
| Congestion-replan cooldown | 10s per unit |
| Congestion-replan minimum improvement | 12% ETA saving |
| Preemption arbitration order | priority class → ETA to junction → request order → unit-id tie-break |
| Stranded-vehicle stop margin | 30m before the blocked junction |
| Stranded-vehicle retry interval | every 2s |

If you want a shorter cut (60–90s), drop the arbitration detail in section 3 down to one sentence and skip straight from "ranks by ETA" to the rerouting section — congestion → rerouting is the tightest two-beat story if you're pressed for time.
