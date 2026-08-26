/**
 * Builds the drive from the Rent4Ring home address to the Nordschleife.
 *
 *   Burgstraße 1, 53520 Nürburg  ->  public roads  ->  "Anbindung zur
 *   Nordschleife"  ->  merge onto the Home Circuit.
 *
 * Routing runs over the real OSM road graph (Dijkstra), so the drive follows
 * actual streets rather than a straight line.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8'));

const roads = read('roads.json');
const accessRaw = read('access_way.json');
const trackData = read('../src/data/nordschleife.json');

const HOME = { lat: 50.3430225, lon: 6.9519812, label: 'Burgstraße 1, 53520 Nürburg' };

// Same projection as build-track.mjs so both share one metric frame.
const { lat: lat0, lon: lon0 } = trackData.origin;
const R = 6378137;
const mPerLat = (Math.PI / 180) * R;
const mPerLon = (Math.PI / 180) * R * Math.cos((lat0 * Math.PI) / 180);
const project = (lat, lon) => ({ x: (lon - lon0) * mPerLon, z: -(lat - lat0) * mPerLat });

// ---------------------------------------------------------------- road graph
const coords = new Map(); // nodeId -> {lat, lon}
const adj = new Map(); // nodeId -> [{to, cost}]

const addEdge = (a, b, cost) => {
  if (!adj.has(a)) adj.set(a, []);
  if (!adj.has(b)) adj.set(b, []);
  adj.get(a).push({ to: b, cost });
  adj.get(b).push({ to: a, cost });
};

const metres = (a, b) => {
  const dx = (b.lon - a.lon) * mPerLon;
  const dz = (b.lat - a.lat) * mPerLat;
  return Math.hypot(dx, dz);
};

for (const way of roads.elements) {
  if (way.type !== 'way' || !way.geometry) continue;
  const ids = way.nodes;
  const geo = way.geometry;
  for (let i = 0; i < geo.length; i++) coords.set(ids[i], geo[i]);
  for (let i = 0; i < geo.length - 1; i++) {
    addEdge(ids[i], ids[i + 1], metres(geo[i], geo[i + 1]));
  }
}
console.log('graph nodes:', coords.size, 'ways:', roads.elements.length);

void accessRaw;

// The circuit is entered through "Zufahrt Hohenrain", which touches the
// centreline 186 m before the T13 start/finish line — so the driver joins the
// track, then crosses the line and the timed lap begins, exactly as on a real
// tourist session.
const MERGE_INDEX = 3430;
const mergePoint = trackData.points[MERGE_INDEX];
// Convert the merge point back to lat/lon so it can be snapped onto the graph.
const mergeLatLon = {
  lat: lat0 - mergePoint.z / mPerLat,
  lon: lon0 + mergePoint.x / mPerLon,
};

// -------------------------------------------------------------- nearest node
const nearestGraphNode = (target) => {
  let best = null;
  let bestD = Infinity;
  for (const [id, c] of coords) {
    const d = metres(c, target);
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  }
  return { id: best, dist: bestD };
};

const startNode = nearestGraphNode(HOME);
const endNode = nearestGraphNode(mergeLatLon);
console.log('home snapped to node', startNode.id, `(${startNode.dist.toFixed(0)} m)`);
console.log('circuit entry snapped to node', endNode.id, `(${endNode.dist.toFixed(0)} m)`);

// -------------------------------------------------------------------- routing
function dijkstra(from, to) {
  const dist = new Map([[from, 0]]);
  const prev = new Map();
  const visited = new Set();
  // Small graph, so a linear scan for the frontier minimum is plenty.
  while (true) {
    let node = null;
    let best = Infinity;
    for (const [id, d] of dist) {
      if (!visited.has(id) && d < best) {
        best = d;
        node = id;
      }
    }
    if (node === null) break;
    if (node === to) break;
    visited.add(node);
    for (const edge of adj.get(node) ?? []) {
      const nd = best + edge.cost;
      if (nd < (dist.get(edge.to) ?? Infinity)) {
        dist.set(edge.to, nd);
        prev.set(edge.to, node);
      }
    }
  }
  if (!dist.has(to)) return null;
  const path = [to];
  let cur = to;
  while (prev.has(cur)) {
    cur = prev.get(cur);
    path.unshift(cur);
  }
  return { path, distance: dist.get(to) };
}

const route = dijkstra(startNode.id, endNode.id);
if (!route) throw new Error('no route from home to the Nordschleife access road');
console.log('route hops:', route.path.length, 'distance:', route.distance.toFixed(0), 'm');

// --------------------------------------------------------- assemble polyline
const latlon = route.path.map((id) => coords.get(id));
let pts = latlon.map((p) => project(p.lat, p.lon));

// Drop duplicate points that would break tangent maths.
pts = pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z) > 0.5);

// ------------------------------------------------------- resample and smooth
const SPACING = 6;
const dist2 = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);
const cum = [0];
for (let i = 0; i < pts.length - 1; i++) cum.push(cum[i] + dist2(pts[i], pts[i + 1]));
const total = cum[cum.length - 1];
const count = Math.max(2, Math.round(total / SPACING));

const resampled = [];
let seek = 0;
for (let k = 0; k <= count; k++) {
  const target = (k / count) * total;
  while (seek < cum.length - 2 && cum[seek + 1] < target) seek++;
  const segLen = cum[seek + 1] - cum[seek];
  const t = segLen > 1e-9 ? (target - cum[seek]) / segLen : 0;
  const a = pts[seek];
  const b = pts[seek + 1];
  resampled.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
}

// Open polyline, so keep the endpoints pinned while smoothing the interior.
let smoothed = resampled;
for (let pass = 0; pass < 4; pass++) {
  const next = smoothed.slice();
  for (let i = 1; i < smoothed.length - 1; i++) {
    next[i] = {
      x: smoothed[i].x * 0.4 + (smoothed[i - 1].x + smoothed[i + 1].x) * 0.3,
      z: smoothed[i].z * 0.4 + (smoothed[i - 1].z + smoothed[i + 1].z) * 0.3,
    };
  }
  smoothed = next;
}

// ------------------------------------------------ where it meets the circuit
const trackPts = trackData.points;
const tail = smoothed[smoothed.length - 1];
const joinIndex = MERGE_INDEX;
const joinDist = Math.hypot(trackPts[joinIndex].x - tail.x, trackPts[joinIndex].z - tail.z);
console.log('merges onto the circuit at index', joinIndex, `(routed to within ${joinDist.toFixed(1)} m)`);

// Pull the final stretch onto the merge point so the transition is seamless.
const BLEND = Math.min(14, smoothed.length - 2);
const joinPt = trackPts[joinIndex];
for (let k = 0; k < BLEND; k++) {
  const i = smoothed.length - 1 - k;
  const w = (BLEND - k) / BLEND; // 1 at the end, fading backwards
  smoothed[i] = {
    x: smoothed[i].x + (joinPt.x - smoothed[i].x) * w,
    z: smoothed[i].z + (joinPt.z - smoothed[i].z) * w,
  };
}

// ----------------------------------------------------------------- elevation
// Nürburg village sits around 600 m; ramp to the circuit's height at the merge,
// then slope-limit exactly like the circuit profile.
const HOME_ALT = 600;
const trackBaseAlt = 320; // build-track.mjs datum
const joinY = joinPt.y;
let elevation = smoothed.map((_, i) => {
  const t = i / (smoothed.length - 1);
  const s = t * t * (3 - 2 * t);
  return (HOME_ALT - trackBaseAlt) + (joinY - (HOME_ALT - trackBaseAlt)) * s;
});

const MAX_GRADIENT = 0.14;
const maxStep = MAX_GRADIENT * SPACING;
for (let pass = 0; pass < 300; pass++) {
  let changed = false;
  for (let i = 0; i < elevation.length - 1; i++) {
    const d = elevation[i + 1] - elevation[i];
    if (Math.abs(d) > maxStep) {
      const excess = ((Math.abs(d) - maxStep) / 2) * Math.sign(d);
      // Keep the merge height exact; it has to line up with the circuit.
      if (i + 1 === elevation.length - 1) elevation[i] += excess * 2;
      else {
        elevation[i] += excess;
        elevation[i + 1] -= excess;
      }
      changed = true;
    }
  }
  if (!changed) break;
}
elevation[elevation.length - 1] = joinY;

const points = smoothed.map((p, i) => ({
  x: +p.x.toFixed(2),
  y: +elevation[i].toFixed(2),
  z: +p.z.toFixed(2),
}));

let length = 0;
for (let i = 0; i < points.length - 1; i++) length += dist2(points[i], points[i + 1]);

const out = {
  name: 'Anfahrt',
  from: HOME.label,
  source: 'OpenStreetMap (ODbL) — © OpenStreetMap contributors',
  length: +length.toFixed(1),
  spacing: SPACING,
  joinIndex,
  halfWidth: 3.1,
  points,
};

const dest = path.join(__dirname, '..', 'src', 'data', 'approach.json');
fs.writeFileSync(dest, JSON.stringify(out));
console.log('approach points:', points.length, 'length:', length.toFixed(0), 'm');
console.log('written ->', dest);
