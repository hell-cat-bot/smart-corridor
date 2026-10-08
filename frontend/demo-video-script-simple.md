# Demo video script — Packmen (2 minutes, plain-language version)

Read this out loud once before recording — it's written to sound like you talking, not like a report. Don't stress about hitting the times exactly, they're just a guide so you don't run long.

**Before you hit record:**
- Reset the world so the map is calm and nothing's mid-mission.
- Turn on "Show civilians" in Settings so background traffic is visible.
- Zoom the map in on a busy-ish area so a few junctions are clearly visible.
- Know which junction you're going to click for the "block a road" part, so you're not hunting for it live.

---

## 0:00–0:12 — Open (12s)

**Show:** Operations screen, sim running, little cars moving around.

**Say:**
> "This is Packmen — think of it as a live control room for ambulances and fire trucks. Everything you're about to see is happening in real time, on real roads, from Ghaziabad."

---

## 0:12–0:38 — How traffic congestion works (26s)

**Show:** Zoom on a junction slowly turning orange or red as cars build up near it. Optionally hover it to show the percentage.

**Say:**
> "First — how do we even know which roads are busy? We're running a mini traffic simulation in the background — little cars are constantly moving around. The more cars build up near a junction, the more congested it gets, and you can literally watch it change color — grey, to orange, to red.
>
> And it doesn't flicker on and off. A junction has to actually stay busy for a bit before it gets marked congested, and it has to properly clear up before it's marked normal again. So it behaves like real traffic, not a light switch."

---

## 0:38–1:05 — Smart dispatch (27s)

**Show:** Open New Mission, create an emergency call. Point out two ambulances at different distances — ideally one near a congested patch.

**Say:**
> "Now here's the smart part. Say there's an emergency call, and I've got two ambulances — one close by, one far away. You'd think the close one always wins, right? Not here.
>
> The system actually checks the road conditions for both. If the nearby ambulance's route is stuck in traffic, but the far one has a clear road, the system sends the far ambulance instead — because it'll actually arrive sooner. It's not about who's closest. It's about who gets there first."

---

## 1:05–1:30 — Smart traffic signals (25s)

**Show:** Green Corridor view — two vehicles converging on one junction. Show the light flip green for the winner, the other one waiting, then getting its own green after.

**Say:**
> "The same thinking runs at traffic signals. If two ambulances are heading toward the same junction at the same time, the system checks which one will actually reach it first, and turns the light green for that one.
>
> The other one just waits a few seconds at the line — and the moment the first one clears, it gets its own green light too. Nothing's random, and nobody's stuck forever."

---

## 1:30–1:55 — Roads getting blocked and rerouting (25s)

**Show:** Inject a disaster on a junction an ambulance is about to cross — show the route instantly flip, old path as a dotted line, new path solid. Then inject a second one that traps a vehicle — show it stop and the red "stranded" alert appear.

**Say:**
> "Last thing — what happens if a road suddenly gets blocked? The moment that happens, any ambulance already using that road instantly works out a new path — you'll see the old route as a dotted line, and the new one appear live, right in front of you.
>
> And if every single road to where it's going is blocked, the ambulance doesn't try to push through — it stops safely before the blockage, flags itself right there on screen, and starts moving again the second a road reopens. No one has to notice it manually."

---

## 1:55–2:00 — Close (5s)

**Say:**
> "Smart dispatch, smart signals, smart rerouting — all reacting live. That's Packmen."

---

## If someone asks a follow-up question, plain-English answers

**"How do you know a road is congested?"**
> "We simulate real traffic in the background and count how many vehicles are near each junction. That gets turned into a busy score between 0 and 1 for every junction, and it's smoothed out over time so it doesn't jump around."

**"How does it pick which ambulance to send?"**
> "It doesn't just look at distance — it works out the actual travel time for every available ambulance, accounting for traffic, and sends whichever one will really get there fastest."

**"How does it decide who gets the green light?"**
> "The higher-priority vehicle type goes first — an ambulance ahead of a fire engine, for example. If it's a tie, whoever's going to physically arrive at the junction sooner gets it. The other one waits and gets the next green automatically."

**"What if a road is completely blocked?"**
> "Any vehicle already using it instantly gets a new route. If literally every path is blocked, the vehicle stops safely, shows an alert, and carries on by itself the moment a road opens back up — no manual fix needed."

---

*A more technical version of this — with the exact formulas and numbers, in case a judge asks something very specific — is in `demo-video-script.md`. This file is the one to actually read on camera.*
