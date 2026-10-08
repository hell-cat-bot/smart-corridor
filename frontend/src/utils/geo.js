/** Geometry helpers shared by routing, the simulation engine and the map. */

const R = 6371000; // Earth radius, metres
const toRad = (deg) => (deg * Math.PI) / 180;
const toDeg = (rad) => (rad * 180) / Math.PI;

/** Great-circle distance in metres — also the A* admissible heuristic. */
export function haversineDistance(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function nodeDistance(a, b) {
  if (!a || !b) return Infinity;
  return haversineDistance(a.lat, a.lng, b.lat, b.lng);
}

/** Compass-style bearing used to rotate vehicle icons (0 = north). */
export function bearing(a, b) {
  if (!a || !b) return 0;
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Build a fast id -> node lookup. */
export function indexNodes(nodes) {
  const map = {};
  for (const n of nodes) map[n.id] = n;
  return map;
}

/** Normalize node ids like J01, J1, J0001 into standard J0001 4-digit format. */
export function normalizeNodeId(nodeId, nodes = []) {
  if (!nodeId) return nodes[0]?.id || 'J0001';
  const str = String(nodeId).trim();
  if (nodes.length && nodes.some((n) => n.id === str)) return str;

  const match = str.match(/^J?0*(\d+)$/i);
  if (match) {
    const padded = `J${match[1].padStart(4, '0')}`;
    if (!nodes.length || nodes.some((n) => n.id === padded)) return padded;
  }
  return nodes[0]?.id || 'J0001';
}

/**
 * Turn a node-id path into a measured polyline that follows the real shape of
 * the road.
 *
 * Each hop expands to the stored segment geometry, so `coords` has many more
 * points than `path` has junctions. Two cumulative arrays come back:
 *
 *   cumulative      metres at each polyline point — used to place a vehicle
 *   nodeCumulative  metres at each junction on the path — used for anything
 *                   that reasons about junctions (preemption, replan anchors)
 *
 * `ctx` is `{ nodeMap, edgeIndex }`. Without an edge index the hop falls back to
 * a straight line between the two junctions.
 */
export function measurePath(path, ctx) {
  const nodeMap = ctx?.nodeMap ?? ctx ?? {};
  const edgeIndex = ctx?.edgeIndex ?? null;

  const coords = [];
  const cumulative = [];
  const nodeCumulative = [];
  let total = 0;

  const pushPoint = (point) => {
    if (coords.length > 0) {
      const prev = coords[coords.length - 1];
      if (prev[0] === point[0] && prev[1] === point[1]) return;
      total += haversineDistance(prev[0], prev[1], point[0], point[1]);
    }
    coords.push(point);
    cumulative.push(total);
  };

  const first = nodeMap[path[0]];
  if (!first) return { coords: [], cumulative: [], nodeCumulative: [], total: 0 };
  pushPoint([first.lat, first.lng]);
  nodeCumulative.push(0);

  for (let i = 1; i < path.length; i += 1) {
    const from = path[i - 1];
    const to = path[i];
    const target = nodeMap[to];
    if (!target) break;

    let hop = null;
    if (edgeIndex) {
      const edge = edgeIndex.get(from < to ? `${from}|${to}` : `${to}|${from}`);
      if (edge) hop = edge.from === from ? edge.geometry : edge.geometry.slice().reverse();
    }

    if (hop && hop.length >= 2) {
      for (let k = 1; k < hop.length; k += 1) pushPoint(hop[k]);
    } else {
      pushPoint([target.lat, target.lng]);
    }

    nodeCumulative.push(total);
  }

  return { coords, cumulative, nodeCumulative, total };
}

/**
 * Position of a vehicle that has travelled `travelled` metres along a measured
 * polyline. Works purely off the polyline, so it is correct whether the road is
 * a straight hop or a long curve.
 */
export function positionAlongPath(coords, cumulative, travelled) {
  if (!coords || coords.length === 0) return null;
  if (coords.length === 1) {
    return { lat: coords[0][0], lng: coords[0][1], heading: 0, segmentIndex: 0, segmentFraction: 1 };
  }

  const clamped = Math.max(0, Math.min(travelled, cumulative[cumulative.length - 1]));

  let lo = 0;
  let hi = cumulative.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (cumulative[mid] <= clamped) lo = mid;
    else hi = mid;
  }

  const segStart = cumulative[lo];
  const segEnd = cumulative[lo + 1];
  const segLength = Math.max(segEnd - segStart, 0.0001);
  const t = Math.max(0, Math.min((clamped - segStart) / segLength, 1));

  const [aLat, aLng] = coords[lo];
  const [bLat, bLng] = coords[lo + 1];

  return {
    lat: aLat + (bLat - aLat) * t,
    lng: aLng + (bLng - aLng) * t,
    heading: bearing({ lat: aLat, lng: aLng }, { lat: bLat, lng: bLng }),
    segmentIndex: lo,
    segmentFraction: t,
  };
}

/** The last junction the vehicle has reached on this path. */
export function lastNodeAt(path, nodeCumulative, travelled) {
  let last = path[0];
  for (let i = 0; i < nodeCumulative.length; i += 1) {
    if (nodeCumulative[i] <= travelled + 0.001) last = path[i];
    else break;
  }
  return last;
}

/** The junction the vehicle is currently heading into. */
export function nextNodeAt(path, nodeCumulative, travelled) {
  for (let i = 0; i < nodeCumulative.length; i += 1) {
    if (nodeCumulative[i] >= travelled - 0.001) return path[i];
  }
  return path[path.length - 1];
}

/** Index of the first path junction at or beyond the current position. */
export function nextNodeIndex(nodeCumulative, travelled) {
  for (let i = 0; i < nodeCumulative.length; i += 1) {
    if (nodeCumulative[i] >= travelled - 0.001) return i;
  }
  return Math.max(0, nodeCumulative.length - 1);
}

/** Distance still to run before reaching a junction further along the path. */
export function distanceToPathNode(path, nodeCumulative, travelled, nodeId) {
  const idx = path.indexOf(nodeId);
  if (idx < 0 || idx >= nodeCumulative.length) return Infinity;
  const d = nodeCumulative[idx] - travelled;
  return d < 0 ? Infinity : d;
}

export function formatMeters(m) {
  if (!Number.isFinite(m)) return '—';
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m === 0) return `${rem}s`;
  return `${m}m ${String(rem).padStart(2, '0')}s`;
}

export function formatSimClock(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `T+${mm}:${ss}`;
}
