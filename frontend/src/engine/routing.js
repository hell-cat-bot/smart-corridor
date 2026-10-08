/**
 * Route planning helpers shared by dispatch, the mission engine and the UI.
 *
 * A route carries two parallel measurements: `coords`/`cumulative` follow the
 * real road polyline (what the vehicle drives and the map draws), and
 * `nodeCumulative` records how far along that polyline each junction sits (what
 * preemption, replanning and ETAs reason about).
 */

import useSettingsStore from '../store/useSettingsStore';
import useWorldStore from '../store/useWorldStore';
import { planRoute, pathTravelTime, pathFreeFlowTime } from '../utils/pathfinding';
import { measurePath, indexNodes, nextNodeIndex, normalizeNodeId } from '../utils/geo';
import { FREE_FLOW_SPEED, UNIT_TYPE } from '../domain/constants';

export function omegaFor(unitType) {
  const { priorityWeights } = useSettingsStore.getState();
  return priorityWeights[unitType] ?? 1.0;
}

export function baseSpeedFor(unitType) {
  return FREE_FLOW_SPEED[unitType] ?? FREE_FLOW_SPEED[UNIT_TYPE.AMBULANCE];
}

/** Snapshot of everything routing needs, read once per planning call. */
export function routingContext() {
  const world = useWorldStore.getState();
  const settings = useSettingsStore.getState();
  const congestion = {};
  for (const n of world.nodes) congestion[n.id] = n.congestion;
  return {
    nodes: world.nodes,
    edges: world.edges,
    edgeIndex: world.edgeIndex,
    nodeMap: indexNodes(world.nodes),
    congestion,
    blocked: new Set(world.disasters.map((d) => d.node)),
    alpha: settings.congestionFactor,
  };
}

/**
 * Plan a single leg. Returns null when no feasible path exists (for example
 * when a disaster has cut the destination off entirely).
 */
export function planLeg({ from, to, unitType, ctx = null, algorithm = 'astar' }) {
  const context = ctx || routingContext();
  const normalizedFrom = normalizeNodeId(from, context.nodes);
  const normalizedTo = normalizeNodeId(to, context.nodes);

  // The destination node itself is where the unit is heading (e.g. an incident or scene),
  // so it must not be treated as impassable for the arrival leg.
  const blockedForLeg = new Set(context.blocked);
  blockedForLeg.delete(normalizedTo);

  let result = planRoute({
    nodes: context.nodes,
    edges: context.edges,
    from: normalizedFrom,
    to: normalizedTo,
    blocked: blockedForLeg,
    congestion: context.congestion,
    alpha: context.alpha,
    omega: omegaFor(unitType),
    unitType,
    algorithm,
    edgeIndex: context.edgeIndex,
    nodeMap: context.nodeMap,
  });

  // If path is completely blocked by disasters along all routes, fallback with bypass
  // so emergency response units are never stranded.
  if (!result.found && blockedForLeg.size > 0) {
    result = planRoute({
      nodes: context.nodes,
      edges: context.edges,
      from: normalizedFrom,
      to: normalizedTo,
      blocked: new Set(),
      congestion: context.congestion,
      alpha: context.alpha,
      omega: omegaFor(unitType),
      unitType,
      algorithm,
      edgeIndex: context.edgeIndex,
      nodeMap: context.nodeMap,
    });
  }

  if (!result.found) return null;
  return result;
}

/**
 * Turn a planned path into a travellable route: the measured road polyline plus
 * the bookkeeping the simulation needs (metres travelled, previous path kept for
 * the dashed comparison line).
 */
export function buildRoute({ path, ctx, legType, destNode, originalPath = null, unitType }) {
  const context = ctx || routingContext();
  const { coords, cumulative, nodeCumulative, total } = measurePath(path, context);
  return {
    path,
    coords,
    cumulative,
    nodeCumulative,
    total,
    travelled: 0,
    legType,
    destNode,
    originalPath,
    unitType,
    plannedAt: useWorldStore.getState().simTime,
  };
}

/** Re-measure a route after a replan. The unit restarts from the new anchor. */
export function rebuildRoute(route, path, ctx, keepOriginal = true) {
  const context = ctx || routingContext();
  const { coords, cumulative, nodeCumulative, total } = measurePath(path, context);
  return {
    ...route,
    path,
    coords,
    cumulative,
    nodeCumulative,
    total,
    travelled: 0,
    originalPath: keepOriginal ? route.path : route.originalPath,
    plannedAt: useWorldStore.getState().simTime,
  };
}

/**
 * Graft a freshly planned tail onto the route a unit is already driving.
 *
 * A replan is planned from the junction the vehicle is heading into, not from
 * the vehicle itself — so naively swapping the route in would teleport it
 * forward to that junction. Re-attaching the segment it is currently part-way
 * along, and carrying the distance already covered on that segment, keeps the
 * vehicle exactly where it is while the road ahead of it changes.
 *
 * `tailPath[0]` is expected to be either the junction ahead (grafted) or the
 * last junction cleared (a U-turn, which does restart from that junction).
 */
export function spliceRoute(route, tailPath, ctx, keepOriginal = true) {
  const context = ctx || routingContext();
  const idx = nextNodeIndex(route.nodeCumulative, route.travelled);
  const prevIdx = Math.max(0, idx - 1);
  const prevNode = route.path[prevIdx];

  const graft = idx > 0 && tailPath[0] !== prevNode;
  const path = graft ? [prevNode, ...tailPath] : tailPath;

  const { coords, cumulative, nodeCumulative, total } = measurePath(path, context);

  // Distance already covered on the segment the vehicle is standing on, clamped
  // to that segment in case the re-measured geometry differs slightly.
  const into = Math.max(0, route.travelled - route.nodeCumulative[prevIdx]);
  const travelled = graft ? Math.min(into, nodeCumulative[1] ?? 0) : 0;

  return {
    ...route,
    path,
    coords,
    cumulative,
    nodeCumulative,
    total,
    travelled,
    originalPath: keepOriginal ? route.path : route.originalPath,
    plannedAt: useWorldStore.getState().simTime,
  };
}

/**
 * How far along the route the vehicle must stop to avoid entering a junction.
 * Returns null when the junction is not ahead of it on this route.
 */
export function stopDistanceBefore(route, nodeId, margin = 30) {
  if (!route) return null;
  const idx = route.path.indexOf(nodeId);
  if (idx < 0 || idx >= route.nodeCumulative.length) return null;
  const at = route.nodeCumulative[idx];
  if (at < route.travelled) return null;
  return Math.max(0, at - margin);
}

/** Remaining travel time on a route under current congestion. */
export function remainingEta(route, ctx, unitType) {
  if (!route) return 0;
  const context = ctx || routingContext();
  const idx = nextNodeIndex(route.nodeCumulative, route.travelled);
  const remainingPath = route.path.slice(Math.max(0, idx - 1));
  return pathTravelTime(
    remainingPath,
    context.nodeMap,
    context.congestion,
    baseSpeedFor(unitType),
    context.edgeIndex,
  );
}

export function freeFlowEta(path, ctx, unitType) {
  const context = ctx || routingContext();
  return pathFreeFlowTime(path, context.nodeMap, baseSpeedFor(unitType), context.edgeIndex);
}

/** The junction a unit is heading into — the anchor for any mid-route replan. */
export function replanAnchor(route) {
  if (!route || route.path.length === 0) return null;
  return route.path[nextNodeIndex(route.nodeCumulative, route.travelled)];
}

/** Does the not-yet-travelled part of this route still touch a blocked junction? */
export function routeHitsBlocked(route, blocked) {
  if (!route) return null;
  const anchorIndex = nextNodeIndex(route.nodeCumulative, route.travelled);
  for (let i = anchorIndex; i < route.path.length; i += 1) {
    if (blocked.has(route.path[i])) return route.path[i];
  }
  return null;
}
