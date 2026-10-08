/*
 * Build the PackMen road network entirely inside a browser tab.
 *
 * Paste this whole file into the DevTools console on https://overpass-turbo.eu
 * (or let Claude run it for you through the Chrome extension). It downloads the
 * roads for the bounding box, reduces them to a junction graph with real road
 * geometry, snaps hospitals and fire stations on, and downloads network.json.
 *
 * Then drop that file at  frontend/src/data/network.json  and restart the dev
 * server. No terminal, no rate-limited CLI.
 *
 * Progress:  __pm            (stage, log, error, summary)
 * Re-run:    __pmReset()     then paste again
 */
(() => {
  const CONFIG = {
    bbox: [28.63, 77.38, 28.71, 77.47], // south, west, north, east
    areaName: 'Central Ghaziabad, Uttar Pradesh',
    maxNodes: 900,
    residential: false,
    filename: 'network.json',
    autoDownload: true,
  };

  if (window.__pm && !window.__pm.done && !window.__pm.error) return 'already running — check __pm';

  const P = (window.__pm = {
    stage: 'starting',
    log: [],
    done: false,
    error: null,
    summary: null,
    json: null,
  });
  window.__pmReset = () => {
    delete window.__pm;
    return 'reset';
  };

  const say = (m) => {
    P.stage = m;
    P.log.push(m);
    console.log('[packmen]', m);
  };

  /* ----------------------------------------------------------- parameters */

  const ROAD_CLASSES = [
    'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified',
    'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link',
  ];
  if (CONFIG.residential) ROAD_CLASSES.push('residential', 'living_street');

  const CLASS_RANK = {
    motorway: 9, trunk: 8, primary: 7, secondary: 6,
    tertiary: 5, unclassified: 3, residential: 2, living_street: 1,
  };
  const rankOf = (cls) => CLASS_RANK[String(cls).replace(/_link$/, '')] ?? 2;

  const ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://overpass.osm.ch/api/interpreter',
    'https://overpass.osm.jp/api/interpreter',
  ];

  const [S, W, N, E] = CONFIG.bbox;
  const bboxStr = `${S},${W},${N},${E}`;

  const ROAD_QUERY = `[out:json][timeout:180];way[highway~"^(${ROAD_CLASSES.join('|')})$"](${bboxStr});out geom;`;
  const PLACE_QUERY = `[out:json][timeout:120];(node[amenity~"^(hospital|clinic|fire_station)$"](${bboxStr});way[amenity~"^(hospital|clinic|fire_station)$"](${bboxStr});relation[amenity~"^(hospital|clinic|fire_station)$"](${bboxStr}););out center tags;`;

  /* ------------------------------------------------------------- geometry */

  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const haversine = (a, b) => {
    const dLat = toRad(b[0] - a[0]);
    const dLng = toRad(b[1] - a[1]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  };
  const polylineLength = (coords) => {
    let t = 0;
    for (let i = 1; i < coords.length; i += 1) t += haversine(coords[i - 1], coords[i]);
    return t;
  };
  const round = (n, dp = 6) => Number(n.toFixed(dp));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const hostOf = (u) => { try { return new URL(u).host; } catch { return u; } };

  /* ------------------------------------------------------------- overpass */

  async function overpass(query, label) {
    let lastError = null;
    for (let round = 0; round < 4; round += 1) {
      for (const endpoint of ENDPOINTS) {
        say(`${label}: asking ${hostOf(endpoint)} (round ${round + 1})`);
        try {
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ data: query }).toString(),
          });
          if ([429, 503, 504].includes(res.status)) {
            say(`${label}: ${hostOf(endpoint)} busy (${res.status})`);
            lastError = new Error(`${res.status} from ${hostOf(endpoint)}`);
            continue;
          }
          if (!res.ok) {
            lastError = new Error(`HTTP ${res.status} from ${hostOf(endpoint)}`);
            say(`${label}: ${lastError.message}`);
            continue;
          }
          const json = await res.json();
          say(`${label}: got ${(json.elements || []).length} element(s) from ${hostOf(endpoint)}`);
          return json;
        } catch (err) {
          lastError = err;
          say(`${label}: ${hostOf(endpoint)} failed — ${err.message}`);
        }
      }
      if (round < 3) {
        const wait = 8 * 2 ** round;
        say(`every mirror busy — waiting ${wait}s`);
        await sleep(wait * 1000);
      }
    }
    throw lastError ?? new Error('no Overpass endpoint responded');
  }

  /* ---------------------------------------------------------- graph build */

  function buildGraph(ways) {
    const useCount = new Map();
    for (const way of ways) {
      if (!way.nodes || !way.geometry) continue;
      way.nodes.forEach((id, i) => {
        const bump = i === 0 || i === way.nodes.length - 1 ? 2 : 1;
        useCount.set(id, (useCount.get(id) || 0) + bump);
      });
    }
    const isJunction = (id) => (useCount.get(id) || 0) >= 2;

    const nodes = new Map();
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
        if (fromId === toId) { startIdx = i; continue; }

        const geometry = way.geometry.slice(startIdx, i + 1).map((p) => [round(p.lat), round(p.lon)]);
        if (geometry.length < 2) { startIdx = i; continue; }

        for (const [osmId, idx] of [[fromId, startIdx], [toId, i]]) {
          if (!nodes.has(osmId)) {
            nodes.set(osmId, { lat: round(way.geometry[idx].lat), lng: round(way.geometry[idx].lon), roads: new Set() });
          }
          if (roadName) nodes.get(osmId).roads.add(roadName);
        }

        edges.push({
          from: fromId, to: toId, geometry,
          length: Math.round(polylineLength(geometry)),
          roadName, roadClass,
        });
        startIdx = i;
      }
    }
    return { nodes, edges };
  }

  function simplifyDegreeTwo(nodes, edges, protectedIds) {
    const adjacency = new Map();
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
      if (otherA === otherB) continue;

      const geomA = a.from === nodeId ? a.geometry.slice().reverse() : a.geometry.slice();
      const geomB = b.from === nodeId ? b.geometry.slice() : b.geometry.slice().reverse();
      const geometry = [...geomA, ...geomB.slice(1)];

      a.dead = true;
      b.dead = true;
      const combined = {
        id: edgeList.length, from: otherA, to: otherB, geometry,
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

  function nameJunction(node, incident, index) {
    const roads = [...new Set(incident.filter((e) => e.roadName).map((e) => e.roadName))];
    if (roads.length >= 2) return `${roads[0]} / ${roads[1]}`;
    if (roads.length === 1) return `${roads[0]} junction`;
    const fromNode = [...(node.roads || [])];
    if (fromNode.length) return `${fromNode[0]} junction`;
    return `Junction ${index}`;
  }

  // Much of Ghaziabad's tertiary network is untagged in OSM, which would leave
  // pockets of junctions called "Junction 412" — useless in a search box.
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
            if (!seen.has(neighbour)) { seen.add(neighbour); next.push(neighbour); }
          }
        }
        frontier = next;
      }
      if (found) { node.name = `Near ${found}`; filled += 1; }
    }
    return filled;
  }

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

  // Robust to the way-tails Overpass returns beyond the bounding box.
  const median = (xs) => {
    const s = xs.slice().sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };

  /* ------------------------------------------------------------- assemble */

  function assemble(ways, places) {
    if (!ways.length) throw new Error('No roads found — check the bounding box.');

    say('building junction graph');
    let { nodes, edges } = buildGraph(ways);
    say(`${nodes.size} junctions, ${edges.length} segments before simplification`);

    const facilityPoints = places
      .map((p) => {
        const lat = p.lat ?? p.center?.lat;
        const lon = p.lon ?? p.center?.lon;
        if (lat == null || lon == null) return null;
        if (!p.tags?.name) return null;
        return { lat, lon, amenity: p.tags.amenity, name: p.tags.name };
      })
      .filter(Boolean);

    const nearestNode = (lat, lon, pool) => {
      let bestId = null;
      let bestD = Infinity;
      for (const [id, n] of pool) {
        const d = haversine([lat, lon], [n.lat, n.lng]);
        if (d < bestD) { bestD = d; bestId = id; }
      }
      return { id: bestId, distance: bestD };
    };

    const facilityAnchors = new Set();
    for (const p of facilityPoints) {
      const { id, distance } = nearestNode(p.lat, p.lon, nodes);
      if (id && distance < 1200) facilityAnchors.add(id);
    }

    const simplified = simplifyDegreeTwo(nodes, edges, facilityAnchors);
    edges = simplified.edges;
    say(`merged ${simplified.merged} pass-through junctions`);

    ({ nodes, edges } = largestComponent(nodes, edges));
    say(`${nodes.size} junctions, ${edges.length} segments in the largest component`);

    if (nodes.size > CONFIG.maxNodes) {
      say(`over ${CONFIG.maxNodes} junctions — dropping the lowest road classes`);
      const ranks = [...new Set(edges.map((e) => rankOf(e.roadClass)))].sort((a, b) => a - b);
      for (const cut of ranks) {
        const kept = edges.filter((e) => rankOf(e.roadClass) > cut);
        const trimmed = largestComponent(nodes, kept);
        if (trimmed.nodes.size <= CONFIG.maxNodes && trimmed.nodes.size > 40) {
          nodes = trimmed.nodes;
          edges = trimmed.edges;
          say(`dropped rank <= ${cut}: now ${nodes.size} junctions`);
          break;
        }
      }
    }

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
    if (filled) say(`named ${filled} junctions after the nearest tagged road`);

    /* facilities */
    const nodesById = new Map(outNodes.map((n) => [n.id, n]));
    const remapPool = new Map(outNodes.map((n) => [n.id, n]));
    const usedNodes = new Set();
    const facilities = [];
    let hospitalSeq = 0;
    let stationSeq = 0;

    const ranked = facilityPoints.slice().sort((a, b) => {
      const score = (p) => (p.amenity === 'hospital' || p.amenity === 'fire_station' ? 0 : 1);
      return score(a) - score(b);
    });

    for (const place of ranked) {
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
          id: `FS-${String(stationSeq).padStart(2, '0')}`, type: 'fire_station', node: id,
          name: place.name, short: place.name.split(/[,(]/)[0].trim().slice(0, 22),
          bays: 2 + (stationSeq % 2),
        });
      } else {
        hospitalSeq += 1;
        facilities.push({
          id: `HOSP-${String(hospitalSeq).padStart(2, '0')}`, type: 'hospital', node: id,
          name: place.name, short: place.name.split(/[,(]/)[0].trim().slice(0, 22),
          beds: 8 + hospitalSeq * 2,
        });
      }
    }

    // Well-spread, well-connected junctions are preferred, but a thin or small
    // network must still end up with a usable fleet — so the spacing and
    // connectivity requirements relax until the target is met.
    const ensure = (type, want, namePrefix, idPrefix) => {
      for (const [minDegree, minGap] of [[3, 1500], [3, 700], [2, 300], [1, 0]]) {
        let added = facilities.filter((f) => f.type === type).length;
        if (added >= want) return;
        const candidates = outNodes
          .filter((n) => n.degree >= minDegree && !usedNodes.has(n.id))
          .sort((a, b) => b.degree - a.degree);
        for (const cand of candidates) {
          if (added >= want) break;
          const tooClose = minGap > 0 && facilities.some(
            (f) => haversine([cand.lat, cand.lng], [nodesById.get(f.node).lat, nodesById.get(f.node).lng]) < minGap,
          );
          if (tooClose) continue;
          added += 1;
          usedNodes.add(cand.id);
          facilities.push({
            id: `${idPrefix}-${String(added).padStart(2, '0')}`, type, node: cand.id,
            name: `${namePrefix} ${added} (${cand.name})`, short: `${namePrefix} ${added}`,
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

    return {
      meta: {
        placeholder: false,
        area: CONFIG.areaName,
        source: 'OpenStreetMap contributors (ODbL)',
        generatedAt: new Date().toISOString(),
        bbox: { south: S, west: W, north: N, east: E },
        roadClasses: ROAD_CLASSES,
        junctions: outNodes.length,
        segments: outEdges.length,
        extractedInBrowser: true,
      },
      center: { lat: round(median(lats)), lng: round(median(lngs)) },
      zoom: 14,
      nodes: outNodes,
      edges: outEdges,
      facilities,
    };
  }

  /* ----------------------------------------------------------------- run */

  (async () => {
    try {
      say('downloading road ways');
      const roadData = await overpass(ROAD_QUERY, 'roads');
      const ways = (roadData.elements || []).filter((e) => e.type === 'way');
      say(`${ways.length} road ways`);

      let places = [];
      try {
        say('downloading hospitals and fire stations');
        places = (await overpass(PLACE_QUERY, 'places')).elements || [];
      } catch (err) {
        say(`facilities skipped (${err.message}) — synthetic ones will be generated`);
      }

      const network = assemble(ways, places);
      const text = JSON.stringify(network);

      P.json = text;
      P.summary = {
        junctions: network.nodes.length,
        segments: network.edges.length,
        hospitals: network.facilities.filter((f) => f.type === 'hospital').length,
        stations: network.facilities.filter((f) => f.type === 'fire_station').length,
        hasRoadNames: network.edges.filter((e) => e.roadName).length,
        kb: Math.round(text.length / 1024),
        center: network.center,
      };

      if (CONFIG.autoDownload) {
        const blob = new Blob([text], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = CONFIG.filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 8000);
        say(`downloaded ${CONFIG.filename}`);
      }

      P.done = true;
      say('done');
    } catch (err) {
      P.error = err.message;
      P.stage = 'failed';
      console.error('[packmen]', err);
    }
  })();

  return 'started — poll __pm.stage / __pm.summary';
})();
