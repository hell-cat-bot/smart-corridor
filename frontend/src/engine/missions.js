/**
 * Mission-based emergency flow.
 *
 *   call at scene X -> assign unit from a facility -> multi-phase mission
 *
 * Medical: LEG 1 dispatch->scene, ON_SCENE dwell, LEG 2 scene->hospital, done.
 * Fire:    LEG 1 dispatch->scene, ON_SCENE dwell, primary response complete.
 *          Return to station happens but is explicitly not an optimised leg of
 *          the response.
 */

import useWorldStore from '../store/useWorldStore';
import useSettingsStore from '../store/useSettingsStore';
import { logEvent } from '../store/useLogStore';
import {
  SERVICE,
  SERVICE_UNIT_TYPE,
  UNIT_STATUS,
  MISSION_STATUS,
  LEG_TYPE,
  LOG_CATEGORY,
  SEVERITY,
  FACILITY_TYPE,
  findEmergencyClass,
} from '../domain/constants';
import { planLeg, buildRoute, routingContext, freeFlowEta } from './routing';
import { normalizeNodeId } from '../utils/geo';

let missionSeq = 0;

export function resetMissionSequence() {
  missionSeq = 0;
}

function nextMissionId() {
  missionSeq += 1;
  return `M-${String(missionSeq).padStart(3, '0')}`;
}

/* ------------------------------------------------------------------ ranking */

/**
 * Rank available units for a call. Ranking is by congestion-aware ETA to the
 * scene, which in practice means "nearest suitable unit from its facility",
 * with a small preference for units still sitting at their base.
 */
export function rankUnits(service, sceneNode, ctx = null) {
  const context = ctx || routingContext();
  const { units, nodes } = useWorldStore.getState();
  const targetNode = normalizeNodeId(sceneNode, nodes);
  const normService = (service === 'fire' || service === 'firetruck') ? SERVICE.FIRE : SERVICE.MEDICAL;
  const wantedType = SERVICE_UNIT_TYPE[normService] || UNIT_TYPE.AMBULANCE;

  const candidates = [];
  for (const unit of units) {
    if (unit.type !== wantedType) continue;
    if (unit.status !== UNIT_STATUS.AVAILABLE && unit.status !== UNIT_STATUS.RETURNING) continue;

    const plan = planLeg({ from: unit.node, to: targetNode, unitType: unit.type, ctx: context });
    if (!plan) continue;

    const atBase = unit.status === UNIT_STATUS.AVAILABLE ? 0 : 12; // returning units pay a small penalty
    candidates.push({
      unitId: unit.id,
      label: unit.label,
      fromNode: unit.node,
      facilityId: unit.baseFacilityId,
      eta: plan.eta,
      distance: plan.distance,
      cost: plan.cost,
      score: plan.eta + atBase,
      path: plan.path,
    });
  }

  // Cross-service fallback: If no unit of primary type is free, check any available response unit
  if (candidates.length === 0) {
    for (const unit of units) {
      if (unit.status !== UNIT_STATUS.AVAILABLE && unit.status !== UNIT_STATUS.RETURNING) continue;

      const plan = planLeg({ from: unit.node, to: targetNode, unitType: unit.type, ctx: context });
      if (!plan) continue;

      const atBase = unit.status === UNIT_STATUS.AVAILABLE ? 0 : 12;
      candidates.push({
        unitId: unit.id,
        label: unit.label,
        fromNode: unit.node,
        facilityId: unit.baseFacilityId,
        eta: plan.eta,
        distance: plan.distance,
        cost: plan.cost,
        score: plan.eta + atBase + 25, // modest cross-service penalty
        path: plan.path,
      });
    }
  }

  candidates.sort((a, b) => a.score - b.score);
  return candidates;
}

/** Nearest feasible hospital from the scene, with a nudge toward the home hospital. */
export function chooseHospital(sceneNode, unit, ctx = null) {
  const context = ctx || routingContext();
  const { facilities } = useWorldStore.getState();
  const hospitals = facilities.filter((f) => f.type === FACILITY_TYPE.HOSPITAL);

  const options = [];
  for (const hospital of hospitals) {
    const plan = planLeg({ from: sceneNode, to: hospital.node, unitType: unit.type, ctx: context });
    if (!plan) continue;
    options.push({ facility: hospital, plan });
  }
  if (options.length === 0) return null;

  options.sort((a, b) => a.plan.eta - b.plan.eta);
  const best = options[0];
  const home = options.find((o) => o.facility.id === unit.homeFacilityId);

  // Prefer the home hospital when it is effectively as good as the nearest.
  const chosen = home && home.plan.eta <= best.plan.eta * 1.1 ? home : best;
  return { ...chosen, alternatives: options };
}

/* ---------------------------------------------------------------- creation */

/**
 * Create an emergency call. The system immediately suggests a unit and its
 * facility; the operator still approves unless demo auto-approve is on.
 */
export function createMission({
  id = null,
  service,
  emergencyClass,
  sceneNode,
  priority,
  note = '',
  /** Operator-typed values, used when the call does not fit a preset class. */
  emergencyLabel = null,
  dwellSeconds = null,
  photoUri = null,
  mlAssessment = null,
  isCitizenReport = false,
  citizenReportId = null,
}) {
  const world = useWorldStore.getState();
  const settings = useSettingsStore.getState();
  const ctx = routingContext();

  const targetNode = normalizeNodeId(sceneNode, world.nodes);

  const cls = findEmergencyClass(service, emergencyClass);
  const resolvedLabel = emergencyLabel?.trim() || cls?.label || 'Emergency';
  const resolvedPriority = priority ?? cls?.priority ?? 2;
  const baseDwell = dwellSeconds ?? cls?.dwell ?? 45;
  const dwell = Math.round(baseDwell * settings.dwellScale);
  const isCustom = !cls;

  const candidates = rankUnits(service, targetNode, ctx);
  const suggestion = candidates[0] || null;

  const mission = {
    id: id || nextMissionId(),
    service,
    emergencyClass,
    emergencyLabel: resolvedLabel,
    customEmergency: isCustom,
    priority: resolvedPriority,
    sceneNode: targetNode,
    note,
    photoUri: photoUri || null,
    photoData: photoUri || null,
    mlAssessment: mlAssessment || null,
    isCitizenReport: Boolean(isCitizenReport),
    citizenReportId: citizenReportId || null,
    status: MISSION_STATUS.PENDING,
    unitId: null,
    suggestedUnitId: suggestion?.unitId ?? null,
    suggestedEta: suggestion?.eta ?? null,
    candidates: candidates.slice(0, 5),
    originFacilityId: suggestion?.facilityId ?? null,
    hospitalFacilityId: null,
    legs: [],
    activeLeg: -1,
    dwellTotal: dwell,
    dwellRemaining: 0,
    createdAt: world.simTime,
    approvedAt: null,
    onSceneAt: null,
    completedAt: null,
    replans: 0,
  };

  useWorldStore.getState().addMission(mission);

  logEvent({
    category: LOG_CATEGORY.MISSION,
    severity: resolvedPriority === 1 ? SEVERITY.CRITICAL : SEVERITY.WARNING,
    simTime: world.simTime,
    message: `${mission.id} created — ${mission.emergencyLabel} at ${nodeName(sceneNode)} (P${resolvedPriority})`,
    refs: { missionId: mission.id, nodeId: sceneNode },
    data: {
      service,
      emergencyClass,
      emergencyLabel: resolvedLabel,
      operatorEntered: isCustom,
      priority: resolvedPriority,
      dwellSeconds: dwell,
      note,
    },
  });

  if (suggestion) {
    logEvent({
      category: LOG_CATEGORY.DISPATCH,
      severity: SEVERITY.INFO,
      simTime: world.simTime,
      message: `${mission.id} suggested unit ${suggestion.unitId} (ETA ${Math.round(suggestion.eta)}s from ${facilityName(suggestion.facilityId)})`,
      refs: { missionId: mission.id, unitId: suggestion.unitId },
      data: {
        ranking: candidates.slice(0, 5).map((c) => ({
          unit: c.unitId,
          etaSeconds: Number(c.eta.toFixed(1)),
          distanceMeters: Math.round(c.distance),
          from: c.fromNode,
        })),
        rule: 'lowest congestion-aware ETA from facility, returning units penalised 12s',
      },
    });
  } else {
    useWorldStore.getState().bumpMetric('unservedRequests');
    logEvent({
      category: LOG_CATEGORY.DISPATCH,
      severity: SEVERITY.CRITICAL,
      simTime: world.simTime,
      message: `${mission.id} has no available ${SERVICE_UNIT_TYPE[service]} — request queued`,
      refs: { missionId: mission.id },
      data: { service },
    });
  }

  if (settings.autoApprove && suggestion) approveMission(mission.id);

  return mission;
}

/* --------------------------------------------------------------- approval */

export function approveMission(missionId) {
  const store = useWorldStore.getState();
  const mission = store.getMission(missionId);
  if (!mission || mission.status !== MISSION_STATUS.PENDING) return false;

  const targetNode = normalizeNodeId(mission.sceneNode, store.nodes);
  const ctx = routingContext();
  const candidates = rankUnits(mission.service, targetNode, ctx);
  let chosen =
    candidates.find((c) => c.unitId === mission.suggestedUnitId) || candidates[0] || null;

  // Additional fleet fallback: if ranking found no candidate, check any available response unit directly
  if (!chosen) {
    const availableUnit = store.units.find(
      (u) => u.status === UNIT_STATUS.AVAILABLE || u.status === UNIT_STATUS.RETURNING,
    );
    if (availableUnit) {
      const plan = planLeg({ from: availableUnit.node, to: targetNode, unitType: availableUnit.type, ctx });
      if (plan) {
        chosen = {
          unitId: availableUnit.id,
          label: availableUnit.label,
          fromNode: availableUnit.node,
          facilityId: availableUnit.baseFacilityId,
          eta: plan.eta,
          distance: plan.distance,
          cost: plan.cost,
          score: plan.eta,
          path: plan.path,
        };
      }
    }
  }

  if (!chosen) {
    store.updateMission(missionId, { suggestedUnitId: null, candidates: [] });
    logEvent({
      category: LOG_CATEGORY.DISPATCH,
      severity: SEVERITY.CRITICAL,
      simTime: store.simTime,
      message: `${missionId} could not be dispatched — no unit available`,
      refs: { missionId },
      data: {},
    });
    return false;
  }

  const unit = store.getUnit(chosen.unitId);
  const plan = planLeg({ from: unit.node, to: targetNode, unitType: unit.type, ctx });
  if (!plan) {
    logEvent({
      category: LOG_CATEGORY.ROUTING,
      severity: SEVERITY.CRITICAL,
      simTime: store.simTime,
      message: `${missionId} — no feasible route from ${unit.node} to scene ${targetNode}`,
      refs: { missionId, unitId: unit.id },
      data: { blocked: [...ctx.blocked] },
    });
    return false;
  }

  const route = buildRoute({
    path: plan.path,
    ctx,
    legType: LEG_TYPE.TO_SCENE,
    destNode: targetNode,
    unitType: unit.type,
  });

  const leg = {
    type: LEG_TYPE.TO_SCENE,
    from: unit.node,
    to: targetNode,
    path: plan.path,
    originalPath: null,
    distance: plan.distance,
    plannedEta: plan.eta,
    freeFlowEta: plan.freeFlowEta,
    startedAt: store.simTime,
    completedAt: null,
    replans: 0,
  };

  store.updateMission(missionId, {
    status: MISSION_STATUS.EN_ROUTE_SCENE,
    unitId: unit.id,
    originFacilityId: unit.baseFacilityId,
    approvedAt: store.simTime,
    legs: [leg],
    activeLeg: 0,
    sceneNode: targetNode,
  });

  store.updateUnit(unit.id, {
    status: UNIT_STATUS.EN_ROUTE,
    missionId,
    route,
    blocked: null,
    lastReplanAt: store.simTime,
  });

  logEvent({
    category: LOG_CATEGORY.DISPATCH,
    severity: SEVERITY.SUCCESS,
    simTime: store.simTime,
    message: `${missionId} dispatched — ${unit.label} from ${facilityName(unit.baseFacilityId)}, ETA ${Math.round(plan.eta)}s`,
    refs: { missionId, unitId: unit.id, nodeId: mission.sceneNode },
    data: {
      leg: 'LEG 1 to scene',
      path: plan.path,
      distanceMeters: Math.round(plan.distance),
      etaSeconds: Number(plan.eta.toFixed(1)),
      freeFlowEtaSeconds: Number(plan.freeFlowEta.toFixed(1)),
      approvedBy: 'operator',
    },
  });

  return true;
}

export function cancelMission(missionId) {
  const store = useWorldStore.getState();
  const mission = store.getMission(missionId);
  if (!mission || mission.status === MISSION_STATUS.COMPLETED) return;

  if (mission.unitId) releaseUnit(mission.unitId);

  store.updateMission(missionId, { status: MISSION_STATUS.CANCELLED, completedAt: store.simTime });
  logEvent({
    category: LOG_CATEGORY.MISSION,
    severity: SEVERITY.WARNING,
    simTime: store.simTime,
    message: `${missionId} cancelled by operator`,
    refs: { missionId, unitId: mission.unitId },
    data: { statusAtCancel: mission.status },
  });
}

/* ------------------------------------------------------- phase transitions */

/** Called by the engine when a unit finishes the leg it is on. */
export function onLegComplete(unitId) {
  const store = useWorldStore.getState();
  const unit = store.getUnit(unitId);
  if (!unit || !unit.route) return;

  const legType = unit.route.legType;

  if (unit.status === UNIT_STATUS.RETURNING || !unit.missionId) {
    finishReturn(unit);
    return;
  }

  const mission = store.getMission(unit.missionId);
  if (!mission) {
    finishReturn(unit);
    return;
  }

  if (legType === LEG_TYPE.TO_SCENE) {
    arriveOnScene(mission, unit);
  } else {
    arriveAtHospital(mission, unit);
  }
}

function arriveOnScene(mission, unit) {
  const store = useWorldStore.getState();
  const responseTime = store.simTime - mission.createdAt;

  store.updateMission(mission.id, (m) => ({
    status: MISSION_STATUS.ON_SCENE,
    onSceneAt: store.simTime,
    dwellRemaining: m.dwellTotal,
    legs: m.legs.map((leg, i) =>
      i === m.activeLeg ? { ...leg, completedAt: store.simTime } : leg,
    ),
  }));

  store.updateUnit(unit.id, {
    status: UNIT_STATUS.ON_SCENE,
    node: mission.sceneNode,
    route: null,
    blocked: null,
    dwellRemaining: mission.dwellTotal,
  });

  store.patchMetrics({
    responseTimes: [...store.metrics.responseTimes, responseTime].slice(-200),
  });

  logEvent({
    category: LOG_CATEGORY.MISSION,
    severity: SEVERITY.SUCCESS,
    simTime: store.simTime,
    message: `${mission.id} — ${unit.label} on scene at ${nodeName(mission.sceneNode)} (response ${Math.round(responseTime)}s)`,
    refs: { missionId: mission.id, unitId: unit.id, nodeId: mission.sceneNode },
    data: {
      responseTimeSeconds: Number(responseTime.toFixed(1)),
      dwellSeconds: mission.dwellTotal,
      phase: 'ON_SCENE',
    },
  });
}

/** Dwell finished — decide what happens next based on the service type. */
export function onDwellComplete(unitId) {
  const store = useWorldStore.getState();
  const unit = store.getUnit(unitId);
  if (!unit || !unit.missionId) return;
  const mission = store.getMission(unit.missionId);
  if (!mission) return;

  if (mission.service === SERVICE.MEDICAL) {
    startTransportLeg(mission, unit);
  } else {
    completeFireResponse(mission, unit);
  }
}

function startTransportLeg(mission, unit) {
  const store = useWorldStore.getState();
  const ctx = routingContext();
  const choice = chooseHospital(mission.sceneNode, unit, ctx);

  if (!choice) {
    logEvent({
      category: LOG_CATEGORY.ROUTING,
      severity: SEVERITY.CRITICAL,
      simTime: store.simTime,
      message: `${mission.id} — no reachable hospital from ${nodeName(mission.sceneNode)}; holding on scene`,
      refs: { missionId: mission.id, unitId: unit.id },
      data: { blocked: [...ctx.blocked] },
    });
    store.updateMission(mission.id, { dwellRemaining: 15 });
    store.updateUnit(unit.id, { dwellRemaining: 15 });
    return;
  }

  const { facility, plan, alternatives } = choice;
  const route = buildRoute({
    path: plan.path,
    ctx,
    legType: LEG_TYPE.TO_HOSPITAL,
    destNode: facility.node,
    unitType: unit.type,
  });

  const leg = {
    type: LEG_TYPE.TO_HOSPITAL,
    from: mission.sceneNode,
    to: facility.node,
    path: plan.path,
    originalPath: null,
    distance: plan.distance,
    plannedEta: plan.eta,
    freeFlowEta: plan.freeFlowEta,
    startedAt: store.simTime,
    completedAt: null,
    replans: 0,
  };

  store.updateMission(mission.id, (m) => ({
    status: MISSION_STATUS.TRANSPORTING,
    hospitalFacilityId: facility.id,
    legs: [...m.legs, leg],
    activeLeg: m.legs.length,
    dwellRemaining: 0,
  }));

  store.updateUnit(unit.id, {
    status: UNIT_STATUS.TRANSPORTING,
    route,
    blocked: null,
    dwellRemaining: 0,
    lastReplanAt: store.simTime,
  });

  logEvent({
    category: LOG_CATEGORY.MISSION,
    severity: SEVERITY.INFO,
    simTime: store.simTime,
    message: `${mission.id} — LEG 2 to ${facility.name}, fresh optimal route (${Math.round(plan.eta)}s)`,
    refs: { missionId: mission.id, unitId: unit.id, facilityId: facility.id },
    data: {
      chosenHospital: facility.id,
      reason: facility.id === unit.homeFacilityId ? 'home hospital within 10% of nearest' : 'nearest feasible hospital',
      considered: alternatives.map((a) => ({
        hospital: a.facility.id,
        etaSeconds: Number(a.plan.eta.toFixed(1)),
      })),
      path: plan.path,
      distanceMeters: Math.round(plan.distance),
    },
  });
}

function arriveAtHospital(mission, unit) {
  const store = useWorldStore.getState();
  const facility = store.getFacility(mission.hospitalFacilityId);
  const total = store.simTime - mission.createdAt;

  store.updateMission(mission.id, (m) => ({
    status: MISSION_STATUS.COMPLETED,
    completedAt: store.simTime,
    legs: m.legs.map((leg, i) => (i === m.activeLeg ? { ...leg, completedAt: store.simTime } : leg)),
  }));

  store.updateUnit(unit.id, (u) => ({
    status: UNIT_STATUS.AVAILABLE,
    missionId: null,
    route: null,
    blocked: null,
    node: facility ? facility.node : u.node,
    baseFacilityId: facility ? facility.id : u.baseFacilityId,
    missionsCompleted: u.missionsCompleted + 1,
  }));

  store.bumpMetric('missionsCompleted');
  recordEfficiency(mission.id);

  logEvent({
    category: LOG_CATEGORY.MISSION,
    severity: SEVERITY.SUCCESS,
    simTime: store.simTime,
    message: `${mission.id} completed — patient delivered to ${facility?.name ?? 'hospital'} (total ${Math.round(total)}s)`,
    refs: { missionId: mission.id, unitId: unit.id, facilityId: mission.hospitalFacilityId },
    data: { totalMissionSeconds: Number(total.toFixed(1)), unitNowAvailableAt: facility?.id },
  });
}

function completeFireResponse(mission, unit) {
  const store = useWorldStore.getState();
  const total = store.simTime - mission.createdAt;

  store.updateMission(mission.id, {
    status: MISSION_STATUS.COMPLETED,
    completedAt: store.simTime,
    dwellRemaining: 0,
  });

  store.bumpMetric('missionsCompleted');
  recordEfficiency(mission.id);

  logEvent({
    category: LOG_CATEGORY.MISSION,
    severity: SEVERITY.SUCCESS,
    simTime: store.simTime,
    message: `${mission.id} — primary fire response complete at ${nodeName(mission.sceneNode)} (${Math.round(total)}s)`,
    refs: { missionId: mission.id, unitId: unit.id },
    data: {
      totalMissionSeconds: Number(total.toFixed(1)),
      note: 'no mandatory optimised return leg for fire response',
    },
  });

  sendUnitHome(unit.id);
}

/* ------------------------------------------------------------ unit return */

/** Return to station. Deliberately not an optimised response leg. */
export function sendUnitHome(unitId) {
  const store = useWorldStore.getState();
  const unit = store.getUnit(unitId);
  if (!unit) return;
  const base = store.getFacility(unit.homeFacilityId);
  if (!base || base.node === unit.node) {
    store.updateUnit(unitId, {
      status: UNIT_STATUS.AVAILABLE,
      missionId: null,
      route: null,
      blocked: null,
      dwellRemaining: 0,
    });
    return;
  }

  const ctx = routingContext();
  // alpha = 0: plain shortest distance, congestion is not priced on a return run.
  const plan = planLeg({
    from: unit.node,
    to: base.node,
    unitType: unit.type,
    ctx: { ...ctx, alpha: 0 },
  });

  if (!plan) {
    store.updateUnit(unitId, {
      status: UNIT_STATUS.AVAILABLE,
      missionId: null,
      route: null,
      blocked: null,
      dwellRemaining: 0,
    });
    return;
  }

  store.updateUnit(unitId, {
    status: UNIT_STATUS.RETURNING,
    missionId: null,
    dwellRemaining: 0,
    blocked: null,
    route: buildRoute({
      path: plan.path,
      ctx,
      legType: 'return',
      destNode: base.node,
      unitType: unit.type,
    }),
  });

  logEvent({
    category: LOG_CATEGORY.DISPATCH,
    severity: SEVERITY.INFO,
    simTime: store.simTime,
    message: `${unit.label} returning to ${base.name} (unoptimised return run)`,
    refs: { unitId, facilityId: base.id },
    data: { path: plan.path, distanceMeters: Math.round(plan.distance) },
  });
}

function finishReturn(unit) {
  const store = useWorldStore.getState();
  const base = store.getFacility(unit.homeFacilityId);
  store.updateUnit(unit.id, {
    status: UNIT_STATUS.AVAILABLE,
    missionId: null,
    route: null,
    blocked: null,
    node: base ? base.node : unit.node,
    baseFacilityId: base ? base.id : unit.baseFacilityId,
  });
  logEvent({
    category: LOG_CATEGORY.DISPATCH,
    severity: SEVERITY.INFO,
    simTime: store.simTime,
    message: `${unit.label} back in service at ${base?.name ?? 'base'}`,
    refs: { unitId: unit.id, facilityId: base?.id },
    data: {},
  });
}

export function releaseUnit(unitId) {
  const store = useWorldStore.getState();
  const unit = store.getUnit(unitId);
  if (!unit) return;
  store.updateUnit(unitId, {
    status: UNIT_STATUS.AVAILABLE,
    missionId: null,
    route: null,
    blocked: null,
    dwellRemaining: 0,
  });
}

/* --------------------------------------------------------------- retries */

/**
 * Pending calls are re-evaluated as units free up, so a queued request does not
 * sit unassigned once the fleet recovers.
 */
export function refreshPendingSuggestions() {
  const store = useWorldStore.getState();
  const pending = store.missions.filter((m) => m.status === MISSION_STATUS.PENDING);
  if (pending.length === 0) return;

  const ctx = routingContext();
  const settings = useSettingsStore.getState();
  const claimed = new Set();

  for (const mission of pending) {
    const candidates = rankUnits(mission.service, mission.sceneNode, ctx).filter(
      (c) => !claimed.has(c.unitId),
    );
    const suggestion = candidates[0] || null;
    if (suggestion) claimed.add(suggestion.unitId);

    if (suggestion?.unitId !== mission.suggestedUnitId) {
      store.updateMission(mission.id, {
        suggestedUnitId: suggestion?.unitId ?? null,
        suggestedEta: suggestion?.eta ?? null,
        candidates: candidates.slice(0, 5),
        originFacilityId: suggestion?.facilityId ?? null,
      });
    }

    if (settings.autoApprove && suggestion) approveMission(mission.id);
  }
}

/* --------------------------------------------------------------- helpers */

function recordEfficiency(missionId) {
  const store = useWorldStore.getState();
  const mission = store.getMission(missionId);
  if (!mission) return;
  const ctx = routingContext();
  const samples = [];
  for (const leg of mission.legs) {
    // Note the null checks: a leg started at simulation time 0 is falsy.
    if (leg.completedAt == null || leg.startedAt == null) continue;
    const actual = leg.completedAt - leg.startedAt;
    const ideal = leg.freeFlowEta ?? freeFlowEta(leg.path, ctx, 'ambulance');
    if (actual > 0 && ideal > 0) samples.push(Math.min(1, ideal / actual));
  }
  if (samples.length) {
    store.patchMetrics({
      efficiencySamples: [...store.metrics.efficiencySamples, ...samples].slice(-200),
    });
  }
}

export function nodeName(nodeId) {
  const node = useWorldStore.getState().getNode(nodeId);
  return node?.name ?? nodeId;
}

export function facilityName(facilityId) {
  const facility = useWorldStore.getState().getFacility(facilityId);
  return facility?.name ?? facilityId ?? 'base';
}
