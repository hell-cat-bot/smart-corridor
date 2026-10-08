/**
 * Corridor demonstrations laid out on whatever road network is loaded.
 *
 * Nothing here hard-codes junction ids. A hub junction is chosen from the real
 * network, approach and exit legs are grown outward from it along genuinely
 * different roads, and each vehicle's approach length is scaled to its own free
 * running speed — so two vehicles on different roads reach the hub at
 * approximately the same moment and the arbitration rule actually has to fire.
 */

import useWorldStore from '../store/useWorldStore';
import { dijkstraTree, pathFromTree } from '../utils/pathfinding';
import { UNIT_TYPE, FREE_FLOW_SPEED } from '../domain/constants';
import { haversineDistance } from '../utils/geo';

/** Seconds each vehicle should spend approaching the hub before the contest. */
const APPROACH_SECONDS = 46;
/** Roughly how far past the hub each vehicle continues. */
const EXIT_METERS = 700;

/** A well-connected junction near the middle of the network. */
export function pickHubJunction() {
  const { nodes, center, facilities } = useWorldStore.getState();
  const facilityNodes = new Set(facilities.map((f) => f.node));

  let best = null;
  let bestScore = -Infinity;
  for (const node of nodes) {
    if (facilityNodes.has(node.id)) continue;
    const degree = node.degree ?? 2;
    if (degree < 3) continue;
    const d = haversineDistance(center.lat, center.lng, node.lat, node.lng);
    const score = degree * 1000 - d;
    if (score > bestScore) {
      bestScore = score;
      best = node;
    }
  }
  return best?.id ?? nodes[0]?.id ?? null;
}

/** Which road out of the hub a junction is reached by. */
function firstHopOf(prev, hub, nodeId) {
  let cur = nodeId;
  let guard = 0;
  while (prev[cur] !== undefined && prev[cur] !== hub && guard < 10000) {
    cur = prev[cur];
    guard += 1;
  }
  return prev[cur] === hub ? cur : null;
}

/**
 * Group every reachable junction by the road it leaves the hub on, so approach
 * legs for different vehicles genuinely come from different directions.
 */
function branchesFromHub(hub) {
  const { nodes, edges } = useWorldStore.getState();
  const { dist, prev } = dijkstraTree(nodes, edges, hub);

  const branches = new Map();
  for (const [nodeId, d] of Object.entries(dist)) {
    if (nodeId === hub) continue;
    const hop = firstHopOf(prev, hub, nodeId);
    if (!hop) continue;
    if (!branches.has(hop)) branches.set(hop, []);
    branches.get(hop).push({ id: nodeId, distance: d });
  }

  for (const list of branches.values()) list.sort((a, b) => a.distance - b.distance);

  // Longest branches first — they give the most room for an approach run.
  return {
    prev,
    dist,
    branches: [...branches.entries()]
      .map(([hop, list]) => ({ hop, list, reach: list[list.length - 1]?.distance ?? 0 }))
      .sort((a, b) => b.reach - a.reach),
  };
}

function nodeNearDistance(list, target) {
  let best = null;
  let bestGap = Infinity;
  for (const item of list) {
    const gap = Math.abs(item.distance - target);
    if (gap < bestGap) {
      bestGap = gap;
      best = item;
    }
  }
  return best;
}

/**
 * Build a corridor session.
 * @param {'single'|'conflict'|'surge'} kind
 * @returns {Array} vehicle requests with explicit frozen paths
 */
export function buildCorridorScenario(kind) {
  const hub = pickHubJunction();
  if (!hub) return [];

  const { prev, branches } = branchesFromHub(hub);
  if (branches.length < 2) return [];

  const specs =
    kind === 'single'
      ? [{ id: 'EV-1', label: 'Ambulance Alpha', type: UNIT_TYPE.AMBULANCE, priority: 1 }]
      : kind === 'conflict'
        ? [
            { id: 'EV-1', label: 'Ambulance Alpha', type: UNIT_TYPE.AMBULANCE, priority: 1 },
            { id: 'EV-2', label: 'Engine 1', type: UNIT_TYPE.FIRETRUCK, priority: 2 },
          ]
        : [
            { id: 'EV-1', label: 'Ambulance Alpha', type: UNIT_TYPE.AMBULANCE, priority: 1 },
            { id: 'EV-2', label: 'Engine 1', type: UNIT_TYPE.FIRETRUCK, priority: 2 },
            { id: 'EV-3', label: 'Ambulance Bravo', type: UNIT_TYPE.AMBULANCE, priority: 1 },
          ];

  const usable = branches.filter((b) => b.reach > 250);
  if (usable.length < Math.min(specs.length + 1, 2)) return [];

  const requests = [];

  specs.forEach((spec, i) => {
    const approachBranch = usable[i % usable.length];
    // Exit down a different road from the one the vehicle came in on.
    const exitBranch = usable[(i + 1) % usable.length] === approachBranch
      ? usable[(i + 2) % usable.length]
      : usable[(i + 1) % usable.length];
    if (!approachBranch || !exitBranch) return;

    const speed = FREE_FLOW_SPEED[spec.type] ?? FREE_FLOW_SPEED.ambulance;
    const wantApproach = Math.min(APPROACH_SECONDS * speed, approachBranch.reach);
    const start = nodeNearDistance(approachBranch.list, wantApproach);
    const finish = nodeNearDistance(exitBranch.list, Math.min(EXIT_METERS, exitBranch.reach));
    if (!start || !finish) return;

    const inbound = pathFromTree(prev, hub, start.id).slice().reverse(); // start -> hub
    const outbound = pathFromTree(prev, hub, finish.id); // hub -> finish
    if (inbound.length < 2 || outbound.length < 2) return;

    const path = [...inbound, ...outbound.slice(1)];
    // Guard against a road that doubles back onto itself.
    if (new Set(path).size !== path.length) return;

    requests.push({ ...spec, path, hub });
  });

  return requests;
}

/** Human-readable description of where the demonstration will happen. */
export function describeHub() {
  const hub = pickHubJunction();
  const node = useWorldStore.getState().nodes.find((n) => n.id === hub);
  return node ? node.name : 'the network hub';
}
