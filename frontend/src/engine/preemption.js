/**
 * Signal preemption (5G green wave).
 *
 * Emergency units request a green on every junction inside their approach
 * radius. When two units want the same junction at the same time, access is
 * resolved by priority class, then ETA to the junction, then request order —
 * and the decision is written to the structured log either way.
 */

import {
  LIGHT_STATE,
  LOG_CATEGORY,
  SEVERITY,
  UNIT_STATUS,
  FREE_FLOW_SPEED,
} from '../domain/constants';
import { distanceToPathNode } from '../utils/geo';
import { effectiveSpeed } from '../utils/pathfinding';

/**
 * Deterministic arbitration for one junction.
 * Returns { winner, losers, reason }.
 */
export function arbitrate(requests) {
  const sorted = [...requests].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (Math.abs(a.eta - b.eta) > 0.001) return a.eta - b.eta;
    if (a.requestedAt !== b.requestedAt) return a.requestedAt - b.requestedAt;
    return String(a.unitId).localeCompare(String(b.unitId));
  });

  const winner = sorted[0];
  const losers = sorted.slice(1);

  let reason = 'sole requester';
  if (losers.length) {
    const runnerUp = losers[0];
    if (winner.priority !== runnerUp.priority) reason = 'higher priority class';
    else if (Math.abs(winner.eta - runnerUp.eta) > 0.001) reason = 'equal priority, earlier ETA to junction';
    else if (winner.requestedAt !== runnerUp.requestedAt) reason = 'equal priority and ETA, earlier request';
    else reason = 'equal on all keys, deterministic unit-id tie-break';
  }

  return { winner, losers, reason };
}

/**
 * Collect preemption requests for every active emergency unit in Operations.
 */
export function collectRequests(units, congestion, simTime, radius) {
  const requests = {};

  for (const unit of units) {
    const active =
      unit.route &&
      (unit.status === UNIT_STATUS.EN_ROUTE || unit.status === UNIT_STATUS.TRANSPORTING);
    if (!active) continue;

    const base = FREE_FLOW_SPEED[unit.type] ?? FREE_FLOW_SPEED.ambulance;
    const priority = unit.type === 'ambulance' ? 1 : 2;

    for (const nodeId of unit.route.path) {
      const distance = distanceToPathNode(
        unit.route.path,
        unit.route.nodeCumulative,
        unit.route.travelled,
        nodeId,
      );
      if (!Number.isFinite(distance) || distance > radius) continue;
      const speed = effectiveSpeed(base, congestion[nodeId]);
      const eta = distance / Math.max(speed, 0.5);
      if (!requests[nodeId]) requests[nodeId] = [];
      requests[nodeId].push({
        nodeId,
        unitId: unit.id,
        unitLabel: unit.label,
        missionId: unit.missionId,
        priority,
        distance,
        eta,
        requestedAt: simTime,
      });
    }
  }

  return requests;
}

/**
 * Advance the operations-level light map one tick.
 * Returns { lights, logs, granted, conflicts }.
 */
export function stepPreemption({ lights, requests, simTime, releaseDelay }) {
  const next = {};
  const logs = [];
  let granted = 0;
  let conflicts = 0;

  for (const [nodeId, list] of Object.entries(requests)) {
    const { winner, losers, reason } = arbitrate(list);
    const previous = lights[nodeId];

    const isNewGrant = !previous || previous.servingUnitId !== winner.unitId ||
      previous.state !== LIGHT_STATE.PREEMPT_GREEN;

    next[nodeId] = {
      nodeId,
      state: LIGHT_STATE.PREEMPT_GREEN,
      servingUnitId: winner.unitId,
      missionId: winner.missionId,
      since: isNewGrant ? simTime : previous.since,
      releaseAt: null,
      contested: losers.length > 0,
      queue: losers.map((l) => l.unitId),
    };

    if (isNewGrant) {
      granted += 1;
      logs.push({
        category: LOG_CATEGORY.SIGNAL,
        severity: SEVERITY.SUCCESS,
        simTime,
        message: `Green wave granted at ${nodeId} for ${winner.unitLabel} (${Math.round(winner.distance)} m out)`,
        refs: { nodeId, unitId: winner.unitId, missionId: winner.missionId },
        data: {
          approachDistanceMeters: Math.round(winner.distance),
          etaSeconds: Number(winner.eta.toFixed(1)),
          priorityClass: winner.priority,
        },
      });
    }

    if (losers.length && (isNewGrant || !previous?.contested)) {
      conflicts += 1;
      logs.push({
        category: LOG_CATEGORY.CONFLICT,
        severity: SEVERITY.WARNING,
        simTime,
        message: `Junction ${nodeId} contested by ${list.length} units — ${winner.unitLabel} wins (${reason})`,
        refs: { nodeId, unitId: winner.unitId },
        data: {
          decisionRule: 'priority class -> ETA to junction -> request order -> unit id',
          reason,
          contenders: list.map((r) => ({
            unit: r.unitId,
            priorityClass: r.priority,
            etaSeconds: Number(r.eta.toFixed(2)),
            requestedAt: r.requestedAt,
          })),
          granted: winner.unitId,
          held: losers.map((l) => l.unitId),
        },
      });
    }
  }

  // Junctions that are no longer requested fall back toward normal operation.
  for (const [nodeId, light] of Object.entries(lights)) {
    if (next[nodeId]) continue;
    const releaseAt = light.releaseAt ?? simTime + releaseDelay;
    if (simTime >= releaseAt) {
      logs.push({
        category: LOG_CATEGORY.SIGNAL,
        severity: SEVERITY.INFO,
        simTime,
        message: `Junction ${nodeId} released to normal operation`,
        refs: { nodeId, unitId: light.servingUnitId },
        data: { heldForSeconds: Number((simTime - (light.since ?? simTime)).toFixed(1)) },
      });
      continue; // dropped from the map
    }
    next[nodeId] = { ...light, state: LIGHT_STATE.RELEASING, releaseAt, contested: false };
  }

  return { lights: next, logs, granted, conflicts };
}

/** Cheap identity check so the store is not rewritten when nothing changed. */
export function lightsEqual(a, b) {
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const key of ak) {
    if (!b[key]) return false;
    if (a[key].state !== b[key].state) return false;
    if (a[key].servingUnitId !== b[key].servingUnitId) return false;
    if (a[key].contested !== b[key].contested) return false;
  }
  return true;
}
