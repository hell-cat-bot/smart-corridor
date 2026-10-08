#!/usr/bin/env node
/**
 * Build the operational road network from OpenStreetMap.
 *
 *   node scripts/fetch-osm-network.mjs
 *
 * Downloads the drivable road network for a bounding box (central Ghaziabad by
 * default), reduces it to a junction graph with real road geometry, snaps
 * hospitals and fire stations onto it, and writes src/data/network.json.
 *
 * Run it once. After that the app is fully offline — nothing queries Overpass at
 * runtime, so a flaky network on demo day cannot break the map.
 *
 * Requires Node 18+ (uses global fetch). No npm dependencies.
 *
 * Options:
 *   --bbox=S,W,N,E        override the area
 *   --name="..."          label stored in the file
 *   --residential         include residential streets (denser, slower)
 *   --max-nodes=N         thin the graph if it exceeds N junctions (default 900)
 *   --out=path            output file (default src/data/network.json)
 *   --endpoint=url        try this Overpass instance first
 *   --retries=N           rounds through the endpoint list (default 4)
 *   --status              report slot availability on every endpoint and exit
 *   --print-query         print the two Overpass queries and exit
 *   --from-file=roads.json [--places-file=places.json]
 *                         build from files you exported yourself, no network
 *
 * If every Overpass instance is rate-limited (HTTP 429), use --print-query, run
 * the query at https://overpass-turbo.eu, export the raw JSON, and pass it back
 * with --from-file. That path cannot be rate-limited.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(__dirname, '..');

/* ------------------------------------------------------------------ options */

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.length ? v.join('=') : true];
  }),
);

/** Central Ghaziabad: Raj Nagar, Kavi Nagar, Nehru Nagar, GT Road, Mohan Nagar. */
const DEFAULT_BBOX = [28.63, 77.38, 28.71, 77.47]; // south, west, north, east

const BBOX = args.bbox ? args.bbox.split(',').map(Number) : DEFAULT_BBOX;
const AREA_NAME = args.name || 'Central Ghaziabad, Uttar Pradesh';
const MAX_NODES = Number(args['max-nodes'] || 900);
const OUT = path.resolve(PROJECT, args.out || 'src/data/network.json');
const RETRY_ROUNDS = Number(args.retries || 4);

/**
 * Public Overpass mirrors, tried in order. They rate-limit independently, so
 * when one is out of slots another usually is not.
 */
const DEFAULT_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
  'https://overpass.osm.jp/api/interpreter',
];

const ENDPOINTS = args.endpoint
  ? [args.endpoint, ...DEFAULT_ENDPOINTS.filter((e) => e !== args.endpoint)]
  : DEFAULT_ENDPOINTS;

/**
 * Overpass instances throttle unidentified clients hard — Node's default agent
 * string is a common cause of an immediate 429. Identify the tool properly.
 */
const USER_AGENT = 'PackMen-SmartCorridor/1.0 (road network extraction for a student project)';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ROAD_CLASSES = [
  'motorway',
  'trunk',
  'primary',
  'secondary',
  'tertiary',
  'unclassified',
  'motorway_link',
  'trunk_link',
  'primary_link',
  'secondary_link',
  'tertiary_link',
];
if (args.residential) ROAD_CLASSES.push('residential', 'living_street');

/** Rank used when the graph has to be thinned — higher survives. */
const CLASS_RANK = {
  motorway: 9,
  trunk: 8,
  primary: 7,
  secondary: 6,
  tertiary: 5,
  unclassified: 3,
  residential: 2,
  living_street: 1,
};
const rankOf = (cls) => CLASS_RANK[String(cls).replace(/_link$/, '')] ?? 2;

/* ---------------------------------------------------------------- geometry */

const R = 6371000;
const toRad = (d) => (d * Math.PI) / 180;

function haversine(a, b) {
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

const polylineLength = (coords) => {
  let total = 0;
  for (let i = 1; i < coords.length; i += 1) total += haversine(coords[i - 1], coords[i]);
  return total;
};

const round = (n, dp = 6) => Number(n.toFixed(dp));

/* ---------------------------------------------------------------- overpass */

const hostOf = (url) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

/**
 * Ask every endpoint in turn, then back off and go round again.
 *
 * 429 / 503 / 504 all mean "busy, come back later" rather than "your query is
 * wrong", so they are retried; anything else moves straight to the next mirror.
 */
async function overpass(query, label) {
  let lastError = null;

  for (let round = 0; round < RETRY_ROUNDS; round += 1) {
    for (const endpoint of ENDPOINTS) {
      process.stdout.write(`  ${label} via ${hostOf(endpoint)} ... `);
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': USER_AGENT,
            Accept: 'application/json',
          },
          body: new URLSearchParams({ data: query }).toString(),
        });

        if (res.status === 429 || res.status === 503 || res.status === 504) {
          const retryAfter = Number(res.headers.get('retry-after')) || 0;
          console.log(`busy (${res.status})`);
          lastError = new Error(`${res.status} from ${hostOf(endpoint)}`);
          if (retryAfter > 0 && retryAfter <= 60) await sleep(retryAfter * 1000);
          continue;
        }

        if (!res.ok) {
          console.log(`HTTP ${res.status}`);
          lastError = new Error(`HTTP ${res.status} from ${hostOf(endpoint)}`);
          continue;
        }

        const json = await res.json();
        console.log(`ok — ${(json.elements || []).length} element(s)`);
        return json;
      } catch (err) {
        console.log(`failed (${err.message})`);
        lastError = err;
      }
    }

    if (round < RETRY_ROUNDS - 1) {
      const wait = 10 * 2 ** round;
      console.log(`  every mirror is busy — waiting ${wait}s before round ${round + 2} of ${RETRY_ROUNDS}`);
      await sleep(wait * 1000);
    }
  }

  throw lastError ?? new Error('no Overpass endpoint responded');
}

/** Slot availability, so you can see which mirror is worth waiting for. */
async function reportStatus() {
  for (const endpoint of ENDPOINTS) {
    const statusUrl = endpoint.replace(/interpreter$/, 'status');
    process.stdout.write(`${hostOf(endpoint).padEnd(28)} `);
    try {
      const res = await fetch(statusUrl, { headers: { 'User-Agent': USER_AGENT } });
      const text = await res.text();
      const slots = /(\d+) slots available now/.exec(text);
      const waits = [...text.matchAll(/in (\d+) seconds/g)].map((m) => Number(m[1]));
      if (slots) console.log(`${slots[1]} slot(s) available now`);
      else if (waits.length) console.log(`no free slot — next in ~${Math.min(...waits)}s`);
      else console.log(res.ok ? 'reachable' : `HTTP ${res.status}`);
    } catch (err) {
      console.log(`unreachable (${err.message})`);
    }
  }
}

const [S, W, N, E] = BBOX;
const bboxStr = `${S},${W},${N},${E}`;

const ROAD_QUERY = `
[out:json][timeout:180];
way[highway~"^(${ROAD_CLASSES.join('|')})$"](${bboxStr});
out geom;
`;

const PLACE_QUERY = `
[out:json][timeout:120];
(
  node[amenity~"^(hospital|clinic|fire_station)$"](${bboxStr});
  way[amenity~"^(hospital|clinic|fire_station)$"](${bboxStr});
  relation[amenity~"^(hospital|clinic|fire_station)$"](${bboxStr});
);
out center tags;
`;

/* ------------------------------------------------------------ graph build */

function buildGraph(ways) {
  // A junction is any OSM node shared by two or more ways, plus every way end.
  const useCount = new Map();
  for (const way of ways) {
    if (!way.nodes || !way.geometry) continue;
    way.nodes.forEach((id, i) => {
      const bump = i === 0 || i === way.nodes.length - 1 ? 2 : 1;
      useCount.set(id, (useCount.get(id) || 0) + bump);
    });
  }

  const isJunction = (id) => (useCount.get(id) || 0) >= 2;

  const nodes = new Map(); // osmId -> { lat, lng, roads:Set }
  const edges = [];

  for (const way of ways) {
    if (!way.nodes || !way.geometry || way.nodes.length < 2) continue;
    const roadName = way.tags?.name || null;
    const roadClass = way.tags?.highway || 'unclassified';

    let startIdx = 0;
    for (let i = 1; i < way.nodes.length; i += 1) {
      const last = i === way.nodes.length - 1;
      if (!isJunction(way.nodes[i]) && !last) continue;

      const fromId = way.nodes[startIdx];
      const toId = way.nodes[i];
      if (fromId === toId) {
        startIdx = i;
        continue;
      }

      const geometry = way.geometry.slice(startIdx, i + 1).map((p) => [round(p.lat), round(p.lon)]);
      if (geometry.length < 2) {
        startIdx = i;
        continue;
      }

      for (const [osmId, idx] of [
        [fromId, startIdx],
        [toId, i],
      ]) {
        if (!nodes.has(osmId)) {
          nodes.set(osmId, {
            lat: round(way.geometry[idx].lat),
            lng: round(way.geometry[idx].lon),
            roads: new Set(),
          });
        }
        if (roadName) nodes.get(osmId).roads.add(roadName);
      }

      edges.push({
        from: fromId,
        to: toId,
        geometry,
        length: Math.round(polylineLength(geometry)),
        roadName,
        roadClass,
      });

      startIdx = i;
    }
  }

  return { nodes, edges };
}

/** Collapse pass-through junctions (degree 2) into a single longer edge. */
function simplifyDegreeTwo(nodes, edges, protectedIds) {
  const adjacency = new Map();
  const alive = new Set(edges.keys ? [] : []);
  const edgeList = edges.map((e, i) => ({ ...e, id: i, dead: false }));

  for (const e of edgeList) {
    if (!adjacency.has(e.from)) adjacency.set(e.from, []);
    if (!adjacency.has(e.to)) adjacency.set(e.to, []);
    adjacency.get(e.from).push(e);
    adjacency.get(e.to).push(e);
  }

  let merged = 0;
  for (const [nodeId, incident] of adjacency) {
    if (protectedIds.has(nodeId)) continue;
    const live = incident.filter((e) => !e.dead);
    if (live.length !== 2) continue;

    const [a, b] = live;
    if (a.from === a.to || b.from === b.to) continue;
    const otherA = a.from === nodeId ? a.to : a.from;
    const otherB = b.from === nodeId ? b.to : b.from;
    if (otherA === otherB) continue; // would create a self-loop

    const geomA = a.from === nodeId ? a.geometry.slice().reverse() : a.geometry.slice();
    const geomB = b.from === nodeId ? b.geometry.slice() : b.geometry.slice().reverse();
    const geometry = [...geomA, ...geomB.slice(1)];

    a.dead = true;
    b.dead = true;
    const combined = {
      id: edgeList.length,
      from: otherA,
      to: otherB,
      geometry,
      length: Math.round(polylineLength(geometry)),
      roadName: a.roadName || b.roadName,
      roadClass: rankOf(a.roadClass) >= rankOf(b.roadClass) ? a.roadClass : b.roadClass,
      dead: false,
    };
    edgeList.push(combined);
    adjacency.get(otherA).push(combined);
    adjacency.get(otherB).push(combined);
    nodes.delete(nodeId);
    merged += 1;
  }

  void alive;
  return { edges: edgeList.filter((e) => !e.dead), merged };
}

function largestComponent(nodes, edges) {
  const adjacency = new Map();
  for (const e of edges) {
    if (!adjacency.has(e.from)) adjacency.set(e.from, []);
    if (!adjacency.has(e.to)) adjacency.set(e.to, []);
    adjacency.get(e.from).push(e.to);
    adjacency.get(e.to).push(e.from);
  }

  const seen = new Set();
  let best = new Set();
  for (const start of adjacency.keys()) {
    if (seen.has(start)) continue;
    const component = new Set([start]);
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const cur = stack.pop();
      for (const nxt of adjacency.get(cur) || []) {
        if (seen.has(nxt)) continue;
        seen.add(nxt);
        component.add(nxt);
        stack.push(nxt);
      }
    }
    if (component.size > best.size) best = component;
  }

  return {
    nodes: new Map([...nodes].filter(([id]) => best.has(id))),
    edges: edges.filter((e) => best.has(e.from) && best.has(e.to)),
  };
}

/* ----------------------------------------------------------------- naming */

function nameJunction(node, edges, index) {
  const roads = [...new Set(edges.filter((e) => e.roadName).map((e) => e.roadName))];
  if (roads.length >= 2) return `${roads[0]} / ${roads[1]}`;
  if (roads.length === 1) return `${roads[0]} junction`;
  const fromNode = [...(node.roads || [])];
  if (fromNode.length) return `${fromNode[0]} junction`;
  return `Junction ${index}`;
}

/**
 * A lot of real tertiary road is simply untagged in OSM, which leaves whole
 * pockets of junctions called "Junction 412" — useless in a search box. Borrow
 * the closest named road within a few hops instead.
 */
function fillUnnamedJunctions(outNodes, outEdges) {
  const adjacency = new Map(outNodes.map((n) => [n.id, []]));
  for (const e of outEdges) {
    adjacency.get(e.from)?.push([e.to, e.roadName]);
    adjacency.get(e.to)?.push([e.from, e.roadName]);
  }

  let filled = 0;
  for (const node of outNodes) {
    if (!/^Junction \d+$/.test(node.name)) continue;
    let found = null;
    const seen = new Set([node.id]);
    let frontier = [node.id];
    for (let hop = 0; hop < 3 && !found; hop += 1) {
      const next = [];
      for (const id of frontier) {
        for (const [neighbour, roadName] of adjacency.get(id) || []) {
          if (roadName && !found) found = roadName;
          if (!seen.has(neighbour)) {
            seen.add(neighbour);
            next.push(neighbour);
          }
        }
      }
      frontier = next;
    }
    if (found) {
      node.name = `Near ${found}`;
      filled += 1;
    }
  }
  return filled;
}

/** Junction names repeat on long roads; make them distinguishable in pickers. */
function dedupeNames(outNodes) {
  const counts = new Map();
  for (const n of outNodes) counts.set(n.name, (counts.get(n.name) || 0) + 1);
  const running = new Map();
  for (const n of outNodes) {
    if ((counts.get(n.name) || 0) < 2) continue;
    const seq = (running.get(n.name) || 0) + 1;
    running.set(n.name, seq);
    if (seq > 1) n.name = `${n.name} (${seq})`;
  }
}

/** Median is robust to the way-tails Overpass returns beyond the bounding box. */
const median = (xs) => {
  const s = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/* --------------------------------------------------------------- main run */

function readJsonFile(file) {
  const resolved = path.resolve(process.cwd(), file);
  if (!fs.existsSync(resolved)) throw new Error(`File not found: ${resolved}`);
  const parsed = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  if (!parsed.elements) throw new Error(`${file} has no "elements" array — export the raw Overpass JSON, not GeoJSON.`);
  return parsed;
}

async function main() {
  if (args.status) {
    console.log('Overpass slot availability:\n');
    await reportStatus();
    return;
  }

  if (args['print-query']) {
    console.log('Run each of these at https://overpass-turbo.eu, then Export > raw OSM data as JSON.\n');
    console.log('--- 1. roads  (save as roads.json) ---');
    console.log(ROAD_QUERY.trim());
    console.log('\n--- 2. hospitals and fire stations  (save as places.json) ---');
    console.log(PLACE_QUERY.trim());
    console.log('\nThen build the network without touching the network:');
    console.log('  node scripts/fetch-osm-network.mjs --from-file=roads.json --places-file=places.json');
    return;
  }

  console.log(`Area      : ${AREA_NAME}`);
  console.log(`Bounding  : S ${S}  W ${W}  N ${N}  E ${E}`);
  console.log(`Classes   : ${ROAD_CLASSES.join(', ')}`);
  console.log(`Source    : ${args['from-file'] ? `file ${args['from-file']}` : `${ENDPOINTS.length} Overpass mirror(s)`}\n`);

  let ways = [];
  let places = [];

  if (args['from-file']) {
    ways = (readJsonFile(args['from-file']).elements || []).filter((e) => e.type === 'way');
    console.log(`  ${ways.length} way(s) read from file`);
    if (args['places-file']) {
      places = readJsonFile(args['places-file']).elements || [];
      console.log(`  ${places.length} facility candidate(s) read from file`);
    } else {
      console.log('  no --places-file given; facilities will be generated');
    }
  } else {
    console.log('Downloading road ways from OpenStreetMap ...');
    const roadData = await overpass(ROAD_QUERY, 'roads');
    ways = (roadData.elements || []).filter((e) => e.type === 'way');
    console.log(`  ${ways.length} way(s) received`);

    console.log('Downloading hospitals and fire stations ...');
    try {
      const placeData = await overpass(PLACE_QUERY, 'places');
      places = placeData.elements || [];
    } catch (err) {
      console.log(`  (skipped: ${err.message})`);
    }
  }

  if (ways.length === 0) throw new Error('No roads found — check the bounding box or the input file.');

  console.log('\nBuilding junction graph ...');
  let { nodes, edges } = buildGraph(ways);
  console.log(`  ${nodes.size} junction(s), ${edges.length} segment(s) before simplification`);

  // Junctions nearest to a facility must survive simplification.
  const facilityAnchors = new Set();
  const facilityPoints = places
    .map((p) => {
      const lat = p.lat ?? p.center?.lat;
      const lon = p.lon ?? p.center?.lon;
      if (lat == null || lon == null) return null;
      const amenity = p.tags?.amenity;
      const name = p.tags?.name;
      if (!name) return null;
      return { lat, lon, amenity, name };
    })
    .filter(Boolean);

  const nearestNode = (lat, lon, pool) => {
    let bestId = null;
    let bestD = Infinity;
    for (const [id, n] of pool) {
      const d = haversine([lat, lon], [n.lat, n.lng]);
      if (d < bestD) {
        bestD = d;
        bestId = id;
      }
    }
    return { id: bestId, distance: bestD };
  };

  for (const p of facilityPoints) {
    const { id, distance } = nearestNode(p.lat, p.lon, nodes);
    if (id && distance < 1200) facilityAnchors.add(id);
  }

  const simplified = simplifyDegreeTwo(nodes, edges, facilityAnchors);
  edges = simplified.edges;
  console.log(`  merged ${simplified.merged} pass-through junction(s)`);

  ({ nodes, edges } = largestComponent(nodes, edges));
  console.log(`  ${nodes.size} junction(s), ${edges.length} segment(s) in the largest connected component`);

  // Thin by road class if the graph is still too large to render comfortably.
  if (nodes.size > MAX_NODES) {
    console.log(`\nGraph exceeds --max-nodes=${MAX_NODES}; dropping the lowest road classes ...`);
    const ranks = [...new Set(edges.map((e) => rankOf(e.roadClass)))].sort((a, b) => a - b);
    for (const cut of ranks) {
      const kept = edges.filter((e) => rankOf(e.roadClass) > cut);
      const trimmed = largestComponent(nodes, kept);
      if (trimmed.nodes.size <= MAX_NODES && trimmed.nodes.size > 40) {
        nodes = trimmed.nodes;
        edges = trimmed.edges;
        console.log(`  dropped classes at rank <= ${cut}: now ${nodes.size} junction(s)`);
        break;
      }
    }
  }

  /* --------------------------------------------------------- output shape */

  const idMap = new Map();
  let seq = 0;
  for (const osmId of nodes.keys()) {
    seq += 1;
    idMap.set(osmId, `J${String(seq).padStart(4, '0')}`);
  }

  const edgesByNode = new Map();
  for (const e of edges) {
    if (!edgesByNode.has(e.from)) edgesByNode.set(e.from, []);
    if (!edgesByNode.has(e.to)) edgesByNode.set(e.to, []);
    edgesByNode.get(e.from).push(e);
    edgesByNode.get(e.to).push(e);
  }

  const outNodes = [];
  let i = 0;
  for (const [osmId, node] of nodes) {
    i += 1;
    outNodes.push({
      id: idMap.get(osmId),
      osmId,
      lat: node.lat,
      lng: node.lng,
      name: nameJunction(node, edgesByNode.get(osmId) || [], i),
      degree: (edgesByNode.get(osmId) || []).length,
    });
  }

  // Deduplicate parallel segments, keeping the shortest.
  const seenPairs = new Map();
  for (const e of edges) {
    const a = idMap.get(e.from);
    const b = idMap.get(e.to);
    if (!a || !b || a === b) continue;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    const geometry = a < b ? e.geometry : e.geometry.slice().reverse();
    const existing = seenPairs.get(key);
    if (!existing || e.length < existing.length) {
      seenPairs.set(key, {
        from: a < b ? a : b,
        to: a < b ? b : a,
        length: Math.max(1, e.length),
        roadName: e.roadName,
        roadClass: e.roadClass,
        geometry,
      });
    }
  }
  const outEdges = [...seenPairs.values()];

  const filled = fillUnnamedJunctions(outNodes, outEdges);
  dedupeNames(outNodes);
  if (filled) console.log(`  named ${filled} junction(s) after the nearest tagged road`);

  /* ------------------------------------------------------------ facilities */

  const nodesById = new Map(outNodes.map((n) => [n.id, n]));
  const usedNodes = new Set();
  const facilities = [];
  let hospitalSeq = 0;
  let stationSeq = 0;

  const remapPool = new Map(outNodes.map((n) => [n.id, n]));

  const rankedPlaces = facilityPoints.sort((a, b) => {
    const score = (p) => (p.amenity === 'hospital' ? 0 : p.amenity === 'fire_station' ? 0 : 1);
    return score(a) - score(b);
  });

  for (const place of rankedPlaces) {
    const isStation = place.amenity === 'fire_station';
    if (!isStation && place.amenity !== 'hospital') continue;
    if (!isStation && hospitalSeq >= 5) continue;
    if (isStation && stationSeq >= 4) continue;

    const { id, distance } = nearestNode(place.lat, place.lon, remapPool);
    if (!id || distance > 1500 || usedNodes.has(id)) continue;
    usedNodes.add(id);

    if (isStation) {
      stationSeq += 1;
      facilities.push({
        id: `FS-${String(stationSeq).padStart(2, '0')}`,
        type: 'fire_station',
        node: id,
        name: place.name,
        short: place.name.split(/[,(]/)[0].trim().slice(0, 22),
        bays: 2 + (stationSeq % 2),
      });
    } else {
      hospitalSeq += 1;
      facilities.push({
        id: `HOSP-${String(hospitalSeq).padStart(2, '0')}`,
        type: 'hospital',
        node: id,
        name: place.name,
        short: place.name.split(/[,(]/)[0].trim().slice(0, 22),
        beds: 8 + hospitalSeq * 2,
      });
    }
  }

  // Guarantee a usable fleet even where OSM tagging is sparse: spread synthetic
  // facilities over well-connected junctions far apart from each other.
  const ensure = (type, want, namePrefix, idPrefix) => {
    // Prefer well-connected junctions spread far apart, but relax both rules
    // rather than hand back a fleet with nowhere to be based.
    for (const [minDegree, minGap] of [[3, 1500], [3, 700], [2, 300], [1, 0]]) {
      let added = facilities.filter((f) => f.type === type).length;
      if (added >= want) return;
      const candidates = outNodes
        .filter((n) => n.degree >= minDegree && !usedNodes.has(n.id))
        .sort((a, b) => b.degree - a.degree);
      for (const cand of candidates) {
        if (added >= want) break;
        const tooClose =
          minGap > 0 &&
          facilities.some(
            (f) => haversine([cand.lat, cand.lng], [nodesById.get(f.node).lat, nodesById.get(f.node).lng]) < minGap,
          );
        if (tooClose) continue;
        added += 1;
        usedNodes.add(cand.id);
        facilities.push({
          id: `${idPrefix}-${String(added).padStart(2, '0')}`,
          type,
          node: cand.id,
          name: `${namePrefix} ${added} (${cand.name})`,
          short: `${namePrefix} ${added}`,
          ...(type === 'hospital' ? { beds: 10 } : { bays: 2 }),
          synthetic: true,
        });
      }
    }
  };

  ensure('hospital', 3, 'Emergency Hospital', 'HOSP');
  ensure('fire_station', 2, 'Fire Station', 'FS');

  const lats = outNodes.map((n) => n.lat);
  const lngs = outNodes.map((n) => n.lng);
  const network = {
    meta: {
      placeholder: false,
      area: AREA_NAME,
      source: 'OpenStreetMap contributors (ODbL)',
      generatedAt: new Date().toISOString(),
      bbox: { south: S, west: W, north: N, east: E },
      roadClasses: ROAD_CLASSES,
      junctions: outNodes.length,
      segments: outEdges.length,
    },
    center: { lat: round(median(lats)), lng: round(median(lngs)) },
    zoom: 14,
    nodes: outNodes,
    edges: outEdges,
    facilities,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(network));

  const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
  console.log('\nWrote', path.relative(PROJECT, OUT), `(${kb} KB)`);
  console.log(`  junctions  ${outNodes.length}`);
  console.log(`  segments   ${outEdges.length}`);
  console.log(`  hospitals  ${facilities.filter((f) => f.type === 'hospital').length}`);
  console.log(`  stations   ${facilities.filter((f) => f.type === 'fire_station').length}`);
  console.log('\nRestart the dev server to pick it up.');
}

main().catch((err) => {
  console.error('\nFailed:', err.message);
  if (/429|503|504|no Overpass endpoint/.test(err.message)) {
    console.error('\nEvery public Overpass mirror is out of query slots right now.');
    console.error('Check which one frees up first:');
    console.error('  node scripts/fetch-osm-network.mjs --status');
    console.error('\nOr bypass the API entirely — this always works:');
    console.error('  1. node scripts/fetch-osm-network.mjs --print-query');
    console.error('  2. paste each query at https://overpass-turbo.eu and hit Run');
    console.error('  3. Export > raw OSM data, saving roads.json and places.json');
    console.error('  4. node scripts/fetch-osm-network.mjs --from-file=roads.json --places-file=places.json');
  }
  process.exit(1);
});
