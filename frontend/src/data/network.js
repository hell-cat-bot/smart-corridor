/**
 * The operational road network.
 *
 * network.json is produced by scripts/fetch-osm-network.mjs from OpenStreetMap:
 * junctions, and segments carrying the real road polyline between them. Until
 * that script has been run, a placeholder lattice ships in its place so the app
 * still boots — `NETWORK.meta.placeholder` says which one is loaded.
 *
 * Segment geometry is stored once, oriented from `from` to `to`. Everything that
 * needs to draw or drive a path goes through the edge index below, so routes and
 * vehicles follow the real shape of the road rather than cutting between
 * junctions in a straight line.
 */

import raw from './network.json';

export const NETWORK = raw;
export const IS_PLACEHOLDER_NETWORK = Boolean(raw.meta?.placeholder);

export function edgeKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** key -> { from, to, length, geometry, roadName, roadClass } */
export function buildEdgeIndex(edges) {
  const index = new Map();
  for (const edge of edges) index.set(edgeKey(edge.from, edge.to), edge);
  return index;
}

/** Segment polyline oriented for travel from `from` to `to`. */
export function orientedGeometry(edgeIndex, from, to) {
  const edge = edgeIndex.get(edgeKey(from, to));
  if (!edge) return null;
  return edge.from === from ? edge.geometry : edge.geometry.slice().reverse();
}

export function edgeBetween(edgeIndex, a, b) {
  return edgeIndex.get(edgeKey(a, b)) || null;
}

/** Road name for a segment, for turn-by-turn style descriptions. */
export function roadNameBetween(edgeIndex, a, b) {
  return edgeBetween(edgeIndex, a, b)?.roadName || null;
}

/** Widths used when drawing the network, so arterials read as arterials. */
export const ROAD_WEIGHT = {
  motorway: 3.4,
  motorway_link: 2.2,
  trunk: 3.2,
  trunk_link: 2.2,
  primary: 2.8,
  primary_link: 2,
  secondary: 2.2,
  secondary_link: 1.8,
  tertiary: 1.8,
  tertiary_link: 1.5,
  unclassified: 1.3,
  residential: 1.1,
  living_street: 1,
};

export function roadWeight(roadClass) {
  return ROAD_WEIGHT[roadClass] ?? 1.3;
}
