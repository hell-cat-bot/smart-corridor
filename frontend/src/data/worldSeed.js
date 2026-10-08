/**
 * Demo world seeding: facilities, response units, civilian background traffic
 * and repeatable scenario presets on whatever road network is loaded.
 *
 * Nothing here hard-codes junction ids any more — the network comes from
 * network.json (real OpenStreetMap roads once scripts/fetch-osm-network.mjs has
 * been run), so scenes and scenarios are chosen from the live node list.
 */

import { NETWORK, IS_PLACEHOLDER_NETWORK, buildEdgeIndex } from './network';
import { UNIT_TYPE, UNIT_STATUS, NODE_STATUS, SERVICE, FACILITY_TYPE } from '../domain/constants';
import { haversineDistance } from '../utils/geo';

export const NETWORK_META = NETWORK.meta;
export const IS_PLACEHOLDER = IS_PLACEHOLDER_NETWORK;

export const GRID = {
  center: NETWORK.center,
  zoom: NETWORK.zoom ?? 14,
  edges: NETWORK.edges,
};

export const EDGE_INDEX = buildEdgeIndex(NETWORK.edges);

export const FACILITIES = NETWORK.facilities.map((f) => ({
  ...f,
  type: f.type === 'fire_station' ? FACILITY_TYPE.FIRE_STATION : FACILITY_TYPE.HOSPITAL,
}));

export function facilityById(id) {
  return FACILITIES.find((f) => f.id === id) || null;
}

export function seedNodes() {
  const facilityByNode = new Map(FACILITIES.map((f) => [f.node, f.id]));
  return NETWORK.nodes.map((n) => ({
    id: n.id,
    lat: n.lat,
    lng: n.lng,
    name: n.name,
    degree: n.degree ?? 2,
    status: NODE_STATUS.NORMAL,
    congestion: 0.08,
    rawDensity: 0,
    facilityId: facilityByNode.get(n.id) ?? null,
  }));
}

/* -------------------------------------------------------------------- fleet */

const AMBULANCE_NAMES = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel'];

/**
 * Two ambulances at the first hospital, one at each of the rest; two engines at
 * the first station, one at each of the rest. Scales with whatever facilities
 * the network extraction found.
 */
export function seedUnits() {
  const nodeById = new Map(NETWORK.nodes.map((n) => [n.id, n]));
  const hospitals = FACILITIES.filter((f) => f.type === FACILITY_TYPE.HOSPITAL);
  const stations = FACILITIES.filter((f) => f.type === FACILITY_TYPE.FIRE_STATION);

  const units = [];
  const make = (type, home, index) => {
    const facility = facilityById(home);
    const node = nodeById.get(facility.node);
    const isAmbulance = type === UNIT_TYPE.AMBULANCE;
    const id = isAmbulance
      ? `AMB-${String(index).padStart(2, '0')}`
      : `FT-${String(index).padStart(2, '0')}`;
    return {
      id,
      label: isAmbulance ? `Ambulance ${AMBULANCE_NAMES[index - 1] ?? index}` : `Engine ${index}`,
      type,
      service: isAmbulance ? SERVICE.MEDICAL : SERVICE.FIRE,
      homeFacilityId: home,
      baseFacilityId: home,
      status: UNIT_STATUS.AVAILABLE,
      missionId: null,
      node: facility.node,
      pos: { lat: node.lat, lng: node.lng },
      heading: 0,
      route: null,
      /** Set while the unit is held short of an impassable junction. */
      blocked: null,
      dwellRemaining: 0,
      lastReplanAt: -999,
      replanCount: 0,
      missionsCompleted: 0,
    };
  };

  let ambulanceSeq = 0;
  hospitals.forEach((h, i) => {
    const count = i === 0 ? 2 : 1;
    for (let k = 0; k < count; k += 1) {
      ambulanceSeq += 1;
      units.push(make(UNIT_TYPE.AMBULANCE, h.id, ambulanceSeq));
    }
  });

  let engineSeq = 0;
  stations.forEach((s, i) => {
    const count = i === 0 ? 2 : 1;
    for (let k = 0; k < count; k += 1) {
      engineSeq += 1;
      units.push(make(UNIT_TYPE.FIRETRUCK, s.id, engineSeq));
    }
  });

  return units;
}

/* ----------------------------------------------------------- scene picking */

/** Deterministic PRNG so a scenario replays identically. */
function seededRandom(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const facilityNodeSet = new Set(FACILITIES.map((f) => f.node));

/**
 * Pick well-connected junctions that are away from facilities and from each
 * other — realistic incident locations rather than a hospital forecourt.
 */
export function pickSceneNodes(count, seed = 4242, minSpacing = 900) {
  const rand = seededRandom(seed);
  const candidates = NETWORK.nodes
    .filter((n) => !facilityNodeSet.has(n.id) && (n.degree ?? 2) >= 3)
    .slice();

  // Deterministic shuffle.
  for (let i = candidates.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  const chosen = [];
  const farEnough = (node) =>
    chosen.every((c) => haversineDistance(c.lat, c.lng, node.lat, node.lng) > minSpacing) &&
    FACILITIES.every((f) => {
      const fn = NETWORK.nodes.find((n) => n.id === f.node);
      return !fn || haversineDistance(fn.lat, fn.lng, node.lat, node.lng) > 500;
    });

  for (const node of candidates) {
    if (chosen.length >= count) break;
    if (farEnough(node)) chosen.push(node);
  }

  // Relax the spacing rule rather than return short on a small network.
  for (const node of candidates) {
    if (chosen.length >= count) break;
    if (!chosen.includes(node)) chosen.push(node);
  }

  return chosen.slice(0, count).map((n) => n.id);
}

/** A junction roughly in the middle of the network — a good blockage to stage. */
export function centralNode() {
  const { lat, lng } = NETWORK.center;
  let best = NETWORK.nodes[0];
  let bestD = Infinity;
  for (const n of NETWORK.nodes) {
    if (facilityNodeSet.has(n.id)) continue;
    const d = haversineDistance(lat, lng, n.lat, n.lng);
    if (d < bestD && (n.degree ?? 2) >= 3) {
      bestD = d;
      best = n;
    }
  }
  return best.id;
}

/* -------------------------------------------------------------- scenarios */

export const SCENARIOS = [
  {
    id: 'clean',
    name: 'Clean network',
    description: 'No disasters, no open calls. Background traffic only.',
    build: () => ({ disasters: [], calls: [] }),
  },
  {
    id: 'cardiac_rush',
    name: 'Cardiac call in traffic',
    description: 'A single P1 medical call across the busiest part of the network.',
    build: () => ({
      disasters: [],
      calls: [
        { service: SERVICE.MEDICAL, emergencyClass: 'cardiac', node: pickSceneNodes(1, 101)[0], delay: 0 },
      ],
    }),
  },
  {
    id: 'flood_reroute',
    name: 'Flood blocks the corridor',
    description: 'A medical unit is dispatched, then a flood closes a junction on its active leg.',
    build: () => ({
      disasters: [{ node: centralNode(), type: 'flood', severity: 0.85, delay: 16 }],
      calls: [
        { service: SERVICE.MEDICAL, emergencyClass: 'trauma', node: pickSceneNodes(1, 202)[0], delay: 0 },
      ],
    }),
  },
  {
    id: 'multi_incident',
    name: 'Multi-incident surge',
    description: 'Two medical calls and a structure fire compete for units and junctions.',
    build: () => {
      const scenes = pickSceneNodes(3, 303);
      return {
        disasters: [{ node: centralNode(), type: 'landslide', severity: 0.9, delay: 24 }],
        calls: [
          { service: SERVICE.MEDICAL, emergencyClass: 'cardiac', node: scenes[0], delay: 0 },
          { service: SERVICE.FIRE, emergencyClass: 'structure_fire', node: scenes[1], delay: 5 },
          { service: SERVICE.MEDICAL, emergencyClass: 'rta', node: scenes[2], delay: 11 },
        ],
      };
    },
  },
];

export function scenarioById(id) {
  return SCENARIOS.find((s) => s.id === id) || SCENARIOS[0];
}
