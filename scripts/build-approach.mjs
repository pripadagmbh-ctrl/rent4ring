/**
 * Builds the drive from the Rent4Ring home address to the Nordschleife.
 *
 *   Burgstraße 1, 53520 Nürburg  ->  Burgstraße  ->  Hauptstraße  ->  the
 *   L93 roundabout  ->  In der Stroth  ->  the public "Zufahrt
 *   Touristenfahrten" in Meuspath  ->  merge onto the Home Circuit.
 *
 * Routing is a plain shortest path over the real OSM road graph, which lands
 * on exactly that sequence — checked against Google Maps directions for the
 * same two points: 1.3 km "über Hauptstraße und In der Stroth".
 *
 * Two earlier attempts got this wrong and are worth recording:
 *
 *   1. The first version aimed at a hardcoded circuit index (3430, the
 *      "Zufahrt Hohenrain" service road). That is a paddock access, not the
 *      way tourists get on, and it is 1.4 km from the real entrance.
 *   2. The second aimed at `access_way.json` ("Anbindung zur Nordschleife"),
 *      which is likewise an internal link, and hand-walked the B258
 *      roundabout to reach it. Neither is on the public route.
 *
 * The real reason no router ever found the right way: `roads.json` was
 * downloaded for a box around Nürburg village only. "In der Stroth" ends
 * 29 m in and the entrance lies 400 m outside the box, so the destination
 * was quite literally not in the data. `roads_wide.json` covers the whole
 * Nürburg–Meuspath corridor, and the plain router then gets it right by
 * itself — no hand-walked legs needed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8'));

const roads = read('roads_wide.json');
const trackData = read('../src/data/nordschleife.json');

const HOME = { lat: 50.3430471, lon: 6.952068, label: 'Burgstraße 1, 53520 Nürburg' };
/** Public tourist-drive entrance, Meuspath — the gate you actually queue at. */
const ENTRANCE = { lat: 50.3460323, lon: 6.9657706 };

// Same projection as build-track.mjs so both share one metric frame.
const { lat: lat0, lon: lon0 } = trackData.origin;
const R = 6378137;
const mPerLat = (Math.PI / 180) * R;
const mPerLon = (Math.PI / 180) * R * Math.cos((lat0 * Math.PI) / 180);
const project = (lat, lon) => ({ x: (lon - lon0) * mPerLon, z: -(lat - lat0) * mPerLat });
const metres = (a, b) => {
  const dx = (b.lon - a.lon) * mPerLon;
  const dz = (b.lat - a.lat) * mPerLat;
  return Math.hypot(dx, dz);
};

// ---------------------------------------------------------------- road graph
/** Ways a car may actually use — the wider extract also carries paths and tracks. */
const DRIVABLE = new Set([
  'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified',
  'residential', 'living_street', 'service',
  'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link',
]);

const coords = new Map(); // nodeId -> {lat, lon}
const adj = new Map(); // nodeId -> [{to, cost}]

const addEdge = (a, b, cost) => {
  if (!adj.has(a)) adj.set(a, []);
  if (!adj.has(b)) adj.set(b, []);
  adj.get(a).push({ to: b, cost });
  adj.get(b).push({ to: a, cost });
};

for (const way of roads.elements) {
  if (way.type !== 'way' || !way.geometry || !way.tags) continue;
  if (!DRIVABLE.has(way.tags.highway)) continue;
  const ids = way.nodes;
  const geo = way.geometry;
  for (let i = 0; i < geo.length; i++) coords.set(ids[i], geo[i]);
  for (let i = 0; i < geo.length - 1; i++) {
    addEdge(ids[i], ids[i + 1], metres(geo[i], geo[i + 1]));
  }
}
console.log('drivable graph nodes:', coords.size, 'of', roads.elements.length, 'ways');

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

const startNode = nearestGraphNode(HOME);
const endNode = nearestGraphNode(ENTRANCE);
console.log('home snapped to node', startNode.id, `(${startNode.dist.toFixed(0)} m)`);
console.log('entrance snapped to node', endNode.id, `(${endNode.dist.toFixed(0)} m)`);

const route = dijkstra(startNode.id, endNode.id);
if (!route) throw new Error('no route from home to the Nordschleife tourist entrance');
console.log('route hops:', route.path.length, 'distance:', route.distance.toFixed(0), 'm');

// ------------------------------------------------- the roundabout on the way
// Which one the route actually uses is read off the route, not assumed: the
// nearby B258 roundabouts are not on it, the L93 one is.
const onRoute = new Set(route.path);
let roundabout = null;
for (const way of roads.elements) {
  if (way.type !== 'way' || !way.tags || way.tags.junction !== 'roundabout') continue;
  const used = way.nodes.filter((id) => onRoute.has(id)).length;
  if (used > 1) {
    roundabout = way;
    console.log('route goes round roundabout', way.id, way.tags.ref ?? '', `(${used}/${way.nodes.length} nodes)`);
    break;
  }
}

let raCentre = null;
let raRadius = 0;
if (roundabout) {
  const pts = roundabout.geometry.map((p) => project(p.lat, p.lon));
  raCentre = pts.reduce(
    (a, p) => ({ x: a.x + p.x / pts.length, z: a.z + p.z / pts.length }),
    { x: 0, z: 0 },
  );
  raRadius = pts.reduce((a, p) => a + Math.hypot(p.x - raCentre.x, p.z - raCentre.z), 0) / pts.length;
  console.log('roundabout centre', raCentre.x.toFixed(1), raCentre.z.toFixed(1), 'radius', raRadius.toFixed(1));
}

// --------------------------------------------------------- assemble polyline
let pts = route.path.map((id) => coords.get(id)).map((p) => project(p.lat, p.lon));

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
// Points on the roundabout are pinned too: the exit is only a short bite of
// the ring, and four smoothing passes flattened it into a wide sweep that
// missed the island entirely — the junction then read as an ordinary bend.
const onRing = (p) =>
  raCentre !== null && Math.hypot(p.x - raCentre.x, p.z - raCentre.z) < raRadius + 6;
let smoothed = resampled;
for (let pass = 0; pass < 4; pass++) {
  const next = smoothed.slice();
  for (let i = 1; i < smoothed.length - 1; i++) {
    if (onRing(smoothed[i])) continue;
    next[i] = {
      x: smoothed[i].x * 0.4 + (smoothed[i - 1].x + smoothed[i + 1].x) * 0.3,
      z: smoothed[i].z * 0.4 + (smoothed[i - 1].z + smoothed[i + 1].z) * 0.3,
    };
  }
  smoothed = next;
}

// ------------------------------------------------ where it meets the circuit
// The entrance itself decides where the lap is joined — found by scanning the
// whole centreline, never assumed.
const trackPts = trackData.points;
const tail = smoothed[smoothed.length - 1];
let joinIndex = 0;
let joinDist = Infinity;
for (let i = 0; i < trackPts.length; i++) {
  const d = Math.hypot(trackPts[i].x - tail.x, trackPts[i].z - tail.z);
  if (d < joinDist) {
    joinDist = d;
    joinIndex = i;
  }
}
console.log('merges onto the circuit at index', joinIndex, `(routed to within ${joinDist.toFixed(1)} m)`);

// Pull the final stretch onto the merge point so the transition is seamless.
const BLEND = Math.min(6, smoothed.length - 2);
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
if (raCentre) {
  out.roundabout = {
    x: +raCentre.x.toFixed(2),
    z: +raCentre.z.toFixed(2),
    radius: +raRadius.toFixed(2),
  };
}

const dest = path.join(__dirname, '..', 'src', 'data', 'approach.json');
fs.writeFileSync(dest, JSON.stringify(out));
console.log('approach points:', points.length, 'length:', length.toFixed(0), 'm');
console.log('written ->', dest);
