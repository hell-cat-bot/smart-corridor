/**
 * Congestion-aware pathfinding for the corridor graph.
 *
 * Segment cost (as documented for the system):
 *
 *     W(u,v) = d(u,v) x (1 + alpha * c_v * omega_priority)
 *
 *   d(u,v)          geometric segment length in metres (haversine)
 *   c_v             live congestion index of the node being entered, 0..1
 *   alpha           congestion factor, operator-tunable (default 2.0)
 *   omega_priority  priority weighting: how strongly congestion is allowed to
 *                   penalise this vehicle class. Emergency classes are partly
 *                   shielded because signal preemption clears their approach,
 *                   so a lower omega makes them less congestion-averse.
 *
 * Blocked nodes (disaster / hazard) are removed from the graph entirely, i.e.
 * treated as infinite cost, independent of congestion.
 */

import { haversineDistance, indexNodes } from './geo';
import { FREE_FLOW_SPEED, CONGESTION_SLOWDOWN } from '../domain/constants';

/** Binary min-heap — keeps A* usable as the graph and rerun frequency grow. */
class MinHeap {
  constructor() {
    this.items = [];
  }

  get size() {
    return this.items.length;
  }

  push(element, priority) {
    this.items.push({ element, priority });
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.items[parent].priority <= this.items[i].priority) break;
      [this.items[parent], this.items[i]] = [this.items[i], this.items[parent]];
      i = parent;
    }
  }

  pop() {
    if (this.items.length === 0) return null;
    const top = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0) {
      this.items[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let smallest = i;
        if (l < this.items.length && this.items[l].priority < this.items[smallest].priority) smallest = l;
        if (r < this.items.length && this.items[r].priority < this.items[smallest].priority) smallest = r;
        if (smallest === i) break;
        [this.items[smallest], this.items[i]] = [this.items[i], this.items[smallest]];
        i = smallest;
      }
    }
    return top;
  }

  isEmpty() {
    return this.items.length === 0;
  }
}

/** Adjacency list with blocked nodes removed. */
export function buildGraph(nodes, edges, blocked = new Set()) {
  const nodeMap = indexNodes(nodes);
  const graph = {};

  for (const node of nodes) {
    if (!blocked.has(node.id)) graph[node.id] = [];
  }

  for (const edge of edges) {
    if (blocked.has(edge.from) || blocked.has(edge.to)) continue;
    const a = nodeMap[edge.from];
    const b = nodeMap[edge.to];
    if (!a || !b || !graph[edge.from] || !graph[edge.to]) continue;
    // Real segments carry their measured along-the-road length; fall back to the
    // straight-line distance only if a network without geometry is loaded.
    const length =
      edge.length ?? haversineDistance(a.lat, a.lng, b.lat, b.lng) * (edge.weight || 1);
    graph[edge.from].push({ node: edge.to, length });
    graph[edge.to].push({ node: edge.from, length });
  }

  return { graph, nodeMap };
}

export function segmentCost(length, congestion, alpha, omega) {
  return length * (1 + alpha * Math.max(0, Math.min(congestion ?? 0, 1)) * omega);
}

/** Effective speed of a vehicle crossing a node with congestion c. */
export function effectiveSpeed(baseSpeed, congestion) {
  const c = Math.max(0, Math.min(congestion ?? 0, 1));
  return Math.max(baseSpeed * (1 - CONGESTION_SLOWDOWN * c), baseSpeed * 0.2);
}

function reconstruct(cameFrom, current) {
  const path = [current];
  let node = current;
  while (cameFrom[node] !== undefined) {
    node = cameFrom[node];
    path.unshift(node);
  }
  return path;
}

const NO_PATH = { found: false, path: [], cost: Infinity, distance: Infinity, expanded: 0 };

/**
 * A* over the corridor graph.
 *
 * @param {object}  opts
 * @param {Set}     opts.blocked      node ids that are impassable
 * @param {object}  opts.congestion   { nodeId: 0..1 }
 * @param {number}  opts.alpha        congestion factor (default 2.0)
 * @param {number}  opts.omega        priority weighting (default 1.0)
 */
export function aStar(nodes, edges, startId, endId, opts = {}) {
  const {
    blocked = new Set(),
    congestion = {},
    alpha = 2.0,
    omega = 1.0,
  } = opts;

  const { graph, nodeMap } = buildGraph(nodes, edges, blocked);
  if (!graph[startId] || !graph[endId] || !nodeMap[startId] || !nodeMap[endId]) return { ...NO_PATH };
  if (startId === endId) {
    return { found: true, path: [startId], cost: 0, distance: 0, expanded: 0 };
  }

  const goal = nodeMap[endId];
  const heuristic = (id) => {
    const n = nodeMap[id];
    return haversineDistance(n.lat, n.lng, goal.lat, goal.lng);
  };

  const open = new MinHeap();
  const cameFrom = {};
  const gScore = { [startId]: 0 };
  const gDistance = { [startId]: 0 };
  const closed = new Set();
  let expanded = 0;

  open.push(startId, heuristic(startId));

  while (!open.isEmpty()) {
    const { element: current } = open.pop();
    if (closed.has(current)) continue;
    closed.add(current);
    expanded += 1;

    if (current === endId) {
      return {
        found: true,
        path: reconstruct(cameFrom, current),
        cost: gScore[current],
        distance: gDistance[current],
        expanded,
      };
    }

    for (const neighbour of graph[current] || []) {
      const step = segmentCost(neighbour.length, congestion[neighbour.node], alpha, omega);
      const tentative = gScore[current] + step;
      if (tentative < (gScore[neighbour.node] ?? Infinity)) {
        cameFrom[neighbour.node] = current;
        gScore[neighbour.node] = tentative;
        gDistance[neighbour.node] = (gDistance[current] ?? 0) + neighbour.length;
        open.push(neighbour.node, tentative + heuristic(neighbour.node));
      }
    }
  }

  return { ...NO_PATH };
}

/** Dijkstra kept as the heuristic-free baseline used in route comparison. */
export function dijkstra(nodes, edges, startId, endId, opts = {}) {
  const { blocked = new Set(), congestion = {}, alpha = 2.0, omega = 1.0 } = opts;
  const { graph } = buildGraph(nodes, edges, blocked);
  if (!graph[startId] || !graph[endId]) return { ...NO_PATH };
  if (startId === endId) return { found: true, path: [startId], cost: 0, distance: 0, expanded: 0 };

  const open = new MinHeap();
  const dist = { [startId]: 0 };
  const gDistance = { [startId]: 0 };
  const prev = {};
  const closed = new Set();
  let expanded = 0;

  open.push(startId, 0);

  while (!open.isEmpty()) {
    const { element: current } = open.pop();
    if (closed.has(current)) continue;
    closed.add(current);
    expanded += 1;

    if (current === endId) {
      return {
        found: true,
        path: reconstruct(prev, current),
        cost: dist[current],
        distance: gDistance[current],
        expanded,
      };
    }

    for (const neighbour of graph[current] || []) {
      const step = segmentCost(neighbour.length, congestion[neighbour.node], alpha, omega);
      const alt = dist[current] + step;
      if (alt < (dist[neighbour.node] ?? Infinity)) {
        dist[neighbour.node] = alt;
        gDistance[neighbour.node] = (gDistance[current] ?? 0) + neighbour.length;
        prev[neighbour.node] = current;
        open.push(neighbour.node, alt);
      }
    }
  }

  return { ...NO_PATH };
}

/**
 * Shortest-path tree from one junction over the whole network.
 * Used to lay out corridor demonstrations on an arbitrary road network: it
 * gives, for every junction, its road distance from the hub and the way back.
 */
export function dijkstraTree(nodes, edges, sourceId, opts = {}) {
  const { blocked = new Set() } = opts;
  const { graph } = buildGraph(nodes, edges, blocked);
  const dist = {};
  const prev = {};
  if (!graph[sourceId]) return { dist, prev };

  const open = new MinHeap();
  const closed = new Set();
  dist[sourceId] = 0;
  open.push(sourceId, 0);

  while (!open.isEmpty()) {
    const { element: current } = open.pop();
    if (closed.has(current)) continue;
    closed.add(current);

    for (const neighbour of graph[current] || []) {
      const alt = dist[current] + neighbour.length;
      if (alt < (dist[neighbour.node] ?? Infinity)) {
        dist[neighbour.node] = alt;
        prev[neighbour.node] = current;
        open.push(neighbour.node, alt);
      }
    }
  }

  return { dist, prev };
}

/** Walk the parent chain back to the source, returned source -> target. */
export function pathFromTree(prev, sourceId, targetId) {
  const path = [targetId];
  let cur = targetId;
  let guard = 0;
  while (cur !== sourceId && prev[cur] !== undefined && guard < 10000) {
    cur = prev[cur];
    path.unshift(cur);
    guard += 1;
  }
  return path[0] === sourceId ? path : [];
}

/**
 * Travel time for a path under the current congestion field.
 * Used for ETAs, dispatch ranking and the corridor efficiency index.
 */
export function pathTravelTime(path, nodeMap, congestion, baseSpeed, edgeIndex = null) {
  if (!path || path.length < 2) return 0;
  let seconds = 0;
  for (let i = 0; i < path.length - 1; i += 1) {
    const fromId = path[i];
    const toId = path[i + 1];
    const a = nodeMap[fromId];
    const b = nodeMap[toId];
    if (!a || !b) continue;
    const edge = edgeIndex?.get(fromId < toId ? `${fromId}|${toId}` : `${toId}|${fromId}`);
    const length = edge?.length ?? haversineDistance(a.lat, a.lng, b.lat, b.lng);
    seconds += length / effectiveSpeed(baseSpeed, congestion[toId]);
  }
  return seconds;
}

/** Free-flow (zero congestion) travel time, the denominator of the efficiency index. */
export function pathFreeFlowTime(path, nodeMap, baseSpeed, edgeIndex = null) {
  return pathTravelTime(path, nodeMap, {}, baseSpeed, edgeIndex);
}

/**
 * One call site for "plan me a route", so Operations, dispatch ranking and the
 * Green Corridor session all price paths the same way.
 */
export function planRoute({
  nodes,
  edges,
  from,
  to,
  blocked = new Set(),
  congestion = {},
  alpha = 2.0,
  omega = 1.0,
  unitType = 'ambulance',
  algorithm = 'astar',
  edgeIndex = null,
  nodeMap = null,
}) {
  const solver = algorithm === 'dijkstra' ? dijkstra : aStar;
  const result = solver(nodes, edges, from, to, { blocked, congestion, alpha, omega });
  if (!result.found) return { ...result, eta: Infinity, freeFlowEta: Infinity, algorithm };

  const map = nodeMap || indexNodes(nodes);
  const baseSpeed = FREE_FLOW_SPEED[unitType] ?? FREE_FLOW_SPEED.ambulance;

  return {
    ...result,
    algorithm,
    eta: pathTravelTime(result.path, map, congestion, baseSpeed, edgeIndex),
    freeFlowEta: pathFreeFlowTime(result.path, map, baseSpeed, edgeIndex),
  };
}
