/**
 * Builds the drive from the Rent4Ring home address to the Nordschleife.
 *
 *   Burgstraße 1, 53520 Nürburg  ->  Hauptstraße  ->  roundabout (first exit)
 *   ->  public roads  ->  "Anbindung zur Nordschleife"  ->  merge onto the
 *   Home Circuit.
 *
 * Routing runs over the real OSM road graph (Dijkstra) in three legs, so the
 * drive follows actual streets rather than a straight line:
 *
 *   1. Home -> the roundabout's Hauptstraße arm (Dijkstra).
 *   2. The roundabout itself, walked by its own real geometry — one arm to
 *      the next, the same "first exit" a driver would take, not a chord cut
 *      across the middle. A plain shortest-path search doesn't know a
 *      roundabout has a direction of travel and will happily cut through it
 *      the wrong way, or skip it entirely for a shorter path through a
 *      cluster of car-park service roads it also doesn't know are private.
 *   3. The roundabout's exit arm -> "Anbindung zur Nordschleife", the actual
 *      surveyed access road (one-way, tagged highway=raceway — Dijkstra over
 *      the public graph alone will never find it, since it isn't part of
 *      that graph) -> its own end, which sits within 9 m of the circuit
 *      centreline. That end, not an arbitrary trackData index, decides
 *      where the drive actually joins the lap.
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
const metres = (a, b) => {
  const dx = (b.lon - a.lon) * mPerLon;
  const dz = (b.lat - a.lat) * mPerLat;
  return Math.hypot(dx, dz);
};

// ---------------------------------------------------------------- road graph
const coords = new Map(); // nodeId -> {lat, lon}
const adj = new Map(); // nodeId -> [{to, cost}]

const addEdge = (a, b, cost) => {
  if (!adj.has(a)) adj.set(a, []);
  if (!adj.has(b)) adj.set(b, []);
  adj.get(a).push({ to: b, cost });
  adj.get(b).push({ to: a, cost });
};

// The roundabout is walked by its own geometry (below), not routed through —
// drop its edges from the general graph so the home->roundabout and
// exit->accessway legs can't shortcut across the middle of it instead of
// using the arm we've actually chosen.
const ROUNDABOUT_WAY_ID = 116964300;

for (const way of roads.elements) {
  if (way.type !== 'way' || !way.geometry || way.id === ROUNDABOUT_WAY_ID) continue;
  const ids = way.nodes;
  const geo = way.geometry;
  for (let i = 0; i < geo.length; i++) coords.set(ids[i], geo[i]);
  for (let i = 0; i < geo.length - 1; i++) {
    addEdge(ids[i], ids[i + 1], metres(geo[i], geo[i + 1]));
  }
}
console.log('graph nodes:', coords.size, 'ways:', roads.elements.length);

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

// -------------------------------------------------------- leg 1: to the roundabout
// Node 5798707041 is where Hauptstraße (coming from Nürburg/home) meets the
// roundabout — confirmed against roads.json, not guessed.
const ROUNDABOUT_ENTRY = 5798707041;
const startNode = nearestGraphNode(HOME);
console.log('home snapped to node', startNode.id, `(${startNode.dist.toFixed(0)} m)`);

const leg1 = dijkstra(startNode.id, ROUNDABOUT_ENTRY);
if (!leg1) throw new Error('no route from home to the roundabout');
console.log('leg 1 (home -> roundabout):', leg1.path.length, 'nodes,', leg1.distance.toFixed(0), 'm');

// ------------------------------------------------------------- leg 2: the roundabout
// Walked by its own surveyed geometry, ring-index 28 (the Hauptstraße arm)
// to ring-index 32 — four short chords, the first exit reached travelling
// the correct way round for right-hand traffic (counter-clockwise).
const roundabout = roads.elements.find((w) => w.id === ROUNDABOUT_WAY_ID);
const RA_ENTRY_RING = 28;
const RA_EXIT_RING = 32;
const raArc = roundabout.geometry.slice(RA_ENTRY_RING, RA_EXIT_RING + 1);
const ROUNDABOUT_EXIT = roundabout.nodes[RA_EXIT_RING];
console.log('leg 2 (roundabout arc):', raArc.length, 'points, first exit at node', ROUNDABOUT_EXIT);

// --------------------------------------------------- leg 3: to the access road
const accessWay = accessRaw.elements.find((e) => e.type === 'way');
const accessNodes = new Map();
for (const e of accessRaw.elements) if (e.type === 'node') accessNodes.set(e.id, e);
const accessGeo = accessWay.nodes.map((id) => accessNodes.get(id));
const accessStart = accessGeo[0];

const leg3 = dijkstra(ROUNDABOUT_EXIT, nearestGraphNode(accessStart).id);
if (!leg3) throw new Error('no route from the roundabout exit to the access road');
console.log('leg 3 (roundabout -> access road):', leg3.path.length, 'nodes,', leg3.distance.toFixed(0), 'm');

// ---------------------------------------------------------- leg 4: the access road
// "Anbindung zur Nordschleife" itself — one-way, surveyed, and (unlike the
// public graph above) actually touches the circuit: its last node sits
// within 9 m of the centreline. Walked start to end, its own digitised
// (and signed one-way) direction, which runs towards the circuit.
console.log('leg 4 (access road):', accessGeo.length, 'points');

// --------------------------------------------------------- assemble polyline
const legLatLon = [
  ...leg1.path.map((id) => coords.get(id)),
  ...raArc,
  ...leg3.path.map((id) => coords.get(id)),
  ...accessGeo,
];
let pts = legLatLon.map((p) => project(p.lat, p.lon));

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
// The access road's own surveyed end decides the join — found by scanning
// every centreline point (a ~370 km search over a ~3.5k-point loop, done
// once at build time), not assumed.
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
// The access road's own surveyed end already sits within a few metres of the
// circuit, so only a short blend is needed to close that last gap cleanly.
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

const dest = path.join(__dirname, '..', 'src', 'data', 'approach.json');
fs.writeFileSync(dest, JSON.stringify(out));
console.log('approach points:', points.length, 'length:', length.toFixed(0), 'm');
console.log('written ->', dest);
