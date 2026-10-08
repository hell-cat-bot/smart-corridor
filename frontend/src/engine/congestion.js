/**
 * Live congestion index.
 *
 * A background civilian population drives node densities; densities are mapped
 * to a congestion index c_v in [0,1] and smoothed with an EMA so the value that
 * A* prices does not jitter tick to tick. Node status uses hysteresis on top of
 * that, so a junction badge does not flicker on the threshold.
 *
 * In a deployed system this exact signal would come from junction cameras and a
 * vision model. The civilian simulation stands in for that sensor pipeline.
 */

import useWorldStore from '../store/useWorldStore';
import useSettingsStore from '../store/useSettingsStore';
import { logEvent } from '../store/useLogStore';
import {
  NODE_STATUS,
  CONGESTION_HYSTERESIS,
  LOG_CATEGORY,
  SEVERITY,
  FREE_FLOW_SPEED,
} from '../domain/constants';
import { nodeDistance } from '../utils/geo';

/* Non-reactive working state — committed to the store on a slower cadence. */
let civilians = [];
let adjacency = {};
let ambient = {};
let segmentLength = new Map();
let lastCongestionLog = -999;

export function buildAdjacency(edges, nodes) {
  const adj = {};
  for (const n of nodes) adj[n.id] = [];
  for (const e of edges) {
    if (adj[e.from]) adj[e.from].push(e.to);
    if (adj[e.to]) adj[e.to].push(e.from);
  }
  return adj;
}

/**
 * Static "the middle of town is busier" term, so the network is not uniformly
 * empty before civilian traffic builds up. Derived from each junction's distance
 * to the network centroid and how many roads meet there, which works for any
 * extracted road network rather than assuming a lattice.
 */
function buildAmbient(nodes) {
  const cLat = nodes.reduce((s, n) => s + n.lat, 0) / (nodes.length || 1);
  const cLng = nodes.reduce((s, n) => s + n.lng, 0) / (nodes.length || 1);
  const distances = nodes.map((n) => nodeDistance({ lat: cLat, lng: cLng }, n));
  const maxD = Math.max(...distances, 1);
  const maxDegree = Math.max(...nodes.map((n) => n.degree ?? 2), 2);

  const map = {};
  nodes.forEach((n, i) => {
    const central = 1 - distances[i] / maxD;
    const busy = ((n.degree ?? 2) - 1) / Math.max(maxDegree - 1, 1);
    map[n.id] = 0.04 + 0.16 * central + 0.08 * busy;
  });
  return map;
}

export function initCongestion() {
  const { nodes, edges } = useWorldStore.getState();
  const { civilianCount } = useSettingsStore.getState();

  adjacency = buildAdjacency(edges, nodes);
  ambient = buildAmbient(nodes);
  segmentLength = new Map();
  for (const e of edges) {
    segmentLength.set(e.from < e.to ? `${e.from}|${e.to}` : `${e.to}|${e.from}`, e.length);
  }
  civilians = [];

  for (let i = 0; i < civilianCount; i += 1) {
    civilians.push(spawnCivilian(i, nodes));
  }
  lastCongestionLog = -999;
}

function spawnCivilian(i, nodes) {
  const node = nodes[Math.floor(Math.random() * nodes.length)];
  const options = adjacency[node.id] || [];
  return {
    id: `CIV-${String(i + 1).padStart(3, '0')}`,
    node: node.id,
    nextNode: options[Math.floor(Math.random() * options.length)] || node.id,
    progress: Math.random(),
    speedFactor: 0.7 + Math.random() * 0.6,
    pos: { lat: node.lat, lng: node.lng },
  };
}

/** Keep the population in sync with the operator's setting without a full reset. */
export function syncCivilianCount() {
  const { nodes } = useWorldStore.getState();
  const { civilianCount } = useSettingsStore.getState();
  if (civilians.length === civilianCount) return;
  if (civilians.length < civilianCount) {
    for (let i = civilians.length; i < civilianCount; i += 1) civilians.push(spawnCivilian(i, nodes));
  } else {
    civilians = civilians.slice(0, civilianCount);
  }
}

export function getCivilians() {
  return civilians;
}

/** Advance every civilian one tick along its current segment. */
export function stepCivilians(dt, nodeMap, blocked) {
  for (const civ of civilians) {
    const from = nodeMap[civ.node];
    const to = nodeMap[civ.nextNode];
    if (!from || !to) {
      civ.nextNode = (adjacency[civ.node] || [civ.node])[0];
      continue;
    }

    const key = civ.node < civ.nextNode ? `${civ.node}|${civ.nextNode}` : `${civ.nextNode}|${civ.node}`;
    const segLength = Math.max(segmentLength.get(key) ?? nodeDistance(from, to), 1);
    const speed = FREE_FLOW_SPEED.civilian * civ.speedFactor;
    civ.progress += (speed * dt) / segLength;

    if (civ.progress >= 1) {
      civ.progress = 0;
      civ.node = civ.nextNode;
      const options = (adjacency[civ.node] || []).filter((id) => !blocked.has(id));
      const pool = options.length ? options : adjacency[civ.node] || [civ.node];
      // Prefer not to immediately double back, so traffic actually circulates.
      const forward = pool.filter((id) => id !== from.id);
      const choice = (forward.length ? forward : pool)[
        Math.floor(Math.random() * (forward.length ? forward.length : pool.length))
      ];
      civ.nextNode = choice;
    }

    const a = nodeMap[civ.node];
    const b = nodeMap[civ.nextNode] || a;
    civ.pos = {
      lat: a.lat + (b.lat - a.lat) * civ.progress,
      lng: a.lng + (b.lng - a.lng) * civ.progress,
    };
  }
}

/** Raw density per node from civilian proximity, weighted along the segment. */
export function sampleDensity(nodes) {
  const density = {};
  for (const n of nodes) density[n.id] = 0;
  for (const civ of civilians) {
    if (density[civ.node] !== undefined) density[civ.node] += 1 - civ.progress;
    if (density[civ.nextNode] !== undefined) density[civ.nextNode] += civ.progress;
  }
  return density;
}

/**
 * Fold the raw density into the smoothed congestion index and derive node
 * status with hysteresis. Returns the new nodes array (or the same reference
 * when nothing meaningful moved, so React can skip the render).
 */
export function updateCongestion(nodes, blocked, simTime) {
  const { congestionSmoothing, densitySaturation } = useSettingsStore.getState();
  const density = sampleDensity(nodes);

  let changed = false;
  const next = nodes.map((node) => {
    const raw = density[node.id] || 0;
    const base = ambient[node.id] ?? 0.08;
    const target = Math.min(1, base + raw / Math.max(densitySaturation, 0.5));
    const smoothed = node.congestion + congestionSmoothing * (target - node.congestion);
    const c = Math.max(0, Math.min(1, smoothed));

    let status = node.status;
    if (blocked.has(node.id)) {
      status = NODE_STATUS.BLOCKED;
    } else if (status === NODE_STATUS.BLOCKED) {
      status = c > CONGESTION_HYSTERESIS.HIGH ? NODE_STATUS.CONGESTED : NODE_STATUS.NORMAL;
    } else if (status === NODE_STATUS.CONGESTED) {
      status = c < CONGESTION_HYSTERESIS.LOW ? NODE_STATUS.NORMAL : NODE_STATUS.CONGESTED;
    } else {
      status = c > CONGESTION_HYSTERESIS.HIGH ? NODE_STATUS.CONGESTED : NODE_STATUS.NORMAL;
    }

    if (Math.abs(c - node.congestion) > 0.002 || status !== node.status || raw !== node.rawDensity) {
      changed = true;
      return { ...node, congestion: c, rawDensity: raw, status };
    }
    return node;
  });

  if (!changed) return nodes;

  // Congestion is high-volume, so it is sampled into the log rather than
  // written on every change — enough to trace, not enough to drown the feed.
  if (simTime - lastCongestionLog >= 20) {
    lastCongestionLog = simTime;
    const congested = next.filter((n) => n.status === NODE_STATUS.CONGESTED);
    const avg = next.reduce((s, n) => s + n.congestion, 0) / (next.length || 1);
    logEvent({
      category: LOG_CATEGORY.CONGESTION,
      severity: congested.length > 6 ? SEVERITY.WARNING : SEVERITY.INFO,
      simTime,
      message: `Congestion sample: mean index ${(avg * 100).toFixed(0)}%, ${congested.length} junction(s) above threshold`,
      data: {
        meanCongestion: Number(avg.toFixed(3)),
        congestedNodes: congested.map((n) => ({ node: n.id, c: Number(n.congestion.toFixed(3)) })),
        source: 'civilian-simulation',
      },
    });
  }

  return next;
}

export function ambientOf(nodeId) {
  return ambient[nodeId] ?? 0.08;
}
