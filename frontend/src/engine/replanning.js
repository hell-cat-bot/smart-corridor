/**
 * Replanning rules.
 *
 * These live outside the tick loop on purpose. Injecting or clearing a disaster
 * changes the routing graph immediately, and the operator expects to see the new
 * optimal path straight away — including when the simulation is paused, which is
 * exactly when they are most likely to be studying the map. So the same passes
 * the clock runs every tick are also driven directly by the disaster engine.
 *
 * Two outcomes are possible when a blockage lands on an active leg:
 *
 *   a route exists   the leg is replanned around it, the vehicle keeping its
 *                    position, and the pre-blockage path is retained as the
 *                    dashed comparison route
 *   no route exists  the vehicle is *held* at a stop line short of the blocked
 *                    junction rather than driving through it, flagged for the
 *                    UI, and retried until the network reopens
 */

import useWorldStore from '../store/useWorldStore';
import useSettingsStore from '../store/useSettingsStore';
import { logEvent } from '../store/useLogStore';
import { LOG_CATEGORY, SEVERITY } from '../domain/constants';
import {
  planLeg,
  spliceRoute,
  routingContext,
  replanAnchor,
  routeHitsBlocked,
  remainingEta,
  stopDistanceBefore,
} from './routing';
import { refreshPendingSuggestions } from './missions';

/** Seconds between re-attempts for a unit that is already held. */
const RETRY_INTERVAL = 2;

/** How far short of a blocked junction a held vehicle stops, in metres. */
const STOP_MARGIN = 30;

function applyReplan(unit, plan, ctx, simTime, { trigger, blockedNode = null, improvement = null, currentEta = null }) {
  const store = useWorldStore.getState();
  const previousPath = unit.route.path;
  const route = spliceRoute(unit.route, plan.path, ctx, true);

  store.updateUnit(unit.id, {
    route,
    lastReplanAt: simTime,
    replanCount: unit.replanCount + 1,
    blocked: null,
  });
  store.bumpMetric('replans');
  store.bumpMetric(blockedNode ? 'blockageReplans' : 'congestionReplans');

  if (unit.missionId) {
    store.updateMission(unit.missionId, (m) => ({
      replans: m.replans + 1,
      legs: m.legs.map((leg, i) =>
        i === m.activeLeg
          ? { ...leg, originalPath: leg.originalPath || previousPath, path: route.path, replans: leg.replans + 1 }
          : leg,
      ),
    }));
  }

  logEvent({
    category: LOG_CATEGORY.ROUTING,
    severity: blockedNode ? SEVERITY.WARNING : SEVERITY.INFO,
    simTime,
    message: blockedNode
      ? `${unit.label} replanned around blocked junction ${blockedNode} — new leg ${route.path.length} nodes, ${Math.round(plan.distance)} m`
      : `${unit.label} switched to a faster corridor — ${((improvement ?? 0) * 100).toFixed(0)}% ETA saving`,
    refs: { unitId: unit.id, missionId: unit.missionId, nodeId: blockedNode },
    data: {
      trigger,
      blockedNode,
      previousPath,
      newPath: route.path,
      etaSeconds: Number(plan.eta.toFixed(1)),
      ...(currentEta != null ? { previousEtaSeconds: Number(currentEta.toFixed(1)) } : {}),
    },
  });

  return route;
}

/** Put a unit into the held state, or leave it there without re-logging. */
function holdUnit(unit, blockedNode, simTime, blocked) {
  const store = useWorldStore.getState();
  const stopAt = stopDistanceBefore(unit.route, blockedNode, STOP_MARGIN);
  const already = unit.blocked;

  store.updateUnit(unit.id, {
    blocked: {
      node: blockedNode,
      since: already?.since ?? simTime,
      lastTry: simTime,
      stopAt: stopAt ?? unit.route.travelled,
      destNode: unit.route.destNode,
    },
  });

  if (already) return;

  logEvent({
    category: LOG_CATEGORY.ROUTING,
    severity: SEVERITY.CRITICAL,
    simTime,
    message: `${unit.label} is stranded — every route to its destination is cut by a blockage at ${blockedNode}`,
    refs: { unitId: unit.id, missionId: unit.missionId, nodeId: blockedNode },
    data: {
      blocked: [...blocked],
      destination: unit.route.destNode,
      behaviour: 'holding at the stop line, retrying until the network reopens',
    },
  });
}

function releaseHold(unit, simTime) {
  const store = useWorldStore.getState();
  store.updateUnit(unit.id, { blocked: null });
  logEvent({
    category: LOG_CATEGORY.ROUTING,
    severity: SEVERITY.SUCCESS,
    simTime,
    message: `${unit.label} released — a route to its destination is available again`,
    refs: { unitId: unit.id, missionId: unit.missionId, nodeId: unit.blocked?.node },
    data: { heldForSeconds: Number((simTime - (unit.blocked?.since ?? simTime)).toFixed(1)) },
  });
}

/**
 * A blockage on the active leg forces an immediate replan; the pre-blockage
 * path is kept so the map can draw it as the dashed comparison route.
 */
export function runBlockageReplans(simTime = useWorldStore.getState().simTime) {
  const store = useWorldStore.getState();
  const blocked = new Set(store.disasters.map((d) => d.node));

  // This runs on every tick. With a clear network and nobody held there is
  // nothing to decide, and building a routing context over several hundred
  // junctions ten times a second for that would be pure waste.
  const anyHeld = store.units.some((u) => u.blocked);
  if (blocked.size === 0 && !anyHeld) return;

  const ctx = routingContext();

  for (const unit of store.units) {
    if (!unit.route) {
      if (unit.blocked) store.updateUnit(unit.id, { blocked: null });
      continue;
    }

    const hit = routeHitsBlocked(unit.route, blocked);

    if (!hit) {
      // The road ahead is clear — either it always was, or a disaster was just
      // cleared and this unit can carry on.
      if (unit.blocked) releaseHold(unit, simTime);
      continue;
    }

    // Already held: retry occasionally rather than running A* every tick.
    if (unit.blocked && simTime - unit.blocked.lastTry < RETRY_INTERVAL) continue;

    const anchor = replanAnchor(unit.route);
    // Planning from a junction that is itself blocked is impossible, so fall
    // back to the last junction the vehicle cleared — it turns around.
    const from = blocked.has(anchor) ? unit.node : anchor;
    const plan = planLeg({ from, to: unit.route.destNode, unitType: unit.type, ctx });

    if (!plan) {
      holdUnit(unit, hit, simTime, blocked);
      continue;
    }

    applyReplan(unit, plan, ctx, simTime, {
      trigger: 'blockage on active leg',
      blockedNode: hit,
    });
  }
}

/**
 * Congestion-driven replanning is deliberately conservative: one unit may only
 * switch after a cooldown, and only when the new route is materially better —
 * otherwise paths thrash every tick.
 */
export function runCongestionReplans(simTime = useWorldStore.getState().simTime) {
  const store = useWorldStore.getState();
  const settings = useSettingsStore.getState();
  const ctx = routingContext();

  for (const unit of store.units) {
    if (!unit.route || unit.blocked) continue;
    if (unit.route.legType === 'return') continue;
    if (simTime - unit.lastReplanAt < settings.replanCooldown) continue;

    const anchor = replanAnchor(unit.route);
    if (!anchor || anchor === unit.route.destNode) continue;

    const currentEta = remainingEta(unit.route, ctx, unit.type);
    const plan = planLeg({ from: anchor, to: unit.route.destNode, unitType: unit.type, ctx });
    if (!plan) continue;

    const samePath = plan.path.join('>') === unit.route.path.slice(unit.route.path.indexOf(anchor)).join('>');
    const improvement = currentEta > 0 ? (currentEta - plan.eta) / currentEta : 0;

    if (samePath || improvement < settings.replanImprovement) {
      store.updateUnit(unit.id, { lastReplanAt: simTime });
      continue;
    }

    applyReplan(unit, plan, ctx, simTime, {
      trigger: 'live congestion',
      improvement,
      currentEta,
    });
  }
}

/**
 * The routing graph changed outside the tick loop — a disaster appeared or was
 * cleared. Re-evaluate everything that depends on it right now, so the map is
 * correct whether or not the clock is running.
 */
export function reactToNetworkChange() {
  const simTime = useWorldStore.getState().simTime;
  runBlockageReplans(simTime);
  refreshPendingSuggestions();
}

export const HOLD_RETRY_INTERVAL = RETRY_INTERVAL;
export const HOLD_STOP_MARGIN = STOP_MARGIN;
