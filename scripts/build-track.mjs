import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'nords_full.json'), 'utf8'));

const nodes = new Map();
const ways = new Map();
let relation = null;

for (const el of raw.elements) {
  if (el.type === 'node') nodes.set(el.id, el);
  else if (el.type === 'way') ways.set(el.id, el);
  else if (el.type === 'relation' && el.id === 38566) relation = el;
}

const memberWays = relation.members
  .filter((m) => m.type === 'way')
  .map((m) => ways.get(m.ref))
  .filter(Boolean);

const segments = memberWays.map((w) => ({ id: w.id, name: w.tags?.name ?? null, nodes: w.nodes.slice() }));

const ordered = [];
let current = segments.shift();
ordered.push(current);
let tail = current.nodes[current.nodes.length - 1];

while (segments.length) {
  let idx = segments.findIndex((s) => s.nodes[0] === tail);
  let reversed = false;
  if (idx === -1) {
    idx = segments.findIndex((s) => s.nodes[s.nodes.length - 1] === tail);
    reversed = true;
  }
  if (idx === -1) break;
  const seg = segments.splice(idx, 1)[0];
  if (reversed) seg.nodes.reverse();
  ordered.push(seg);
  tail = seg.nodes[seg.nodes.length - 1];
}
if (segments.length) console.warn(`WARN: ${segments.length} unstitched segment(s)`);

const nodeIds = [];
const nameAtIndex = [];
for (const seg of ordered) {
  if (seg.name) nameAtIndex.push({ name: seg.name, index: nodeIds.length });
  for (const n of seg.nodes) {
    if (nodeIds[nodeIds.length - 1] === n) continue;
    nodeIds.push(n);
  }
}
if (nodeIds[0] === nodeIds[nodeIds.length - 1]) nodeIds.pop();

const latlon = nodeIds.map((id) => {
  const n = nodes.get(id);
  return { lat: n.lat, lon: n.lon };
});

const lat0 = latlon.reduce((a, p) => a + p.lat, 0) / latlon.length;
const lon0 = latlon.reduce((a, p) => a + p.lon, 0) / latlon.length;
const R = 6378137;
const mPerLat = (Math.PI / 180) * R;
const mPerLon = (Math.PI / 180) * R * Math.cos((lat0 * Math.PI) / 180);

const pts = latlon.map((p) => ({
  x: (p.lon - lon0) * mPerLon,
  z: -(p.lat - lat0) * mPerLat,
}));

const dist = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);

// Rotate so index 0 sits at the real Nordschleife start/finish line (the T13 section).
const t13 = nameAtIndex.find((n) => n.name === 'T13');
const startIndex = t13 ? t13.index : 0;
const rotated = pts.slice(startIndex).concat(pts.slice(0, startIndex));
const rotatedNames = nameAtIndex
  .map((n) => ({ name: n.name, index: (n.index - startIndex + pts.length) % pts.length }))
  .sort((a, b) => a.index - b.index);

let rawLength = 0;
for (let i = 0; i < rotated.length; i++) rawLength += dist(rotated[i], rotated[(i + 1) % rotated.length]);
console.log('raw points:', rotated.length, 'raw length:', rawLength.toFixed(1), 'm');

// Uniform resample.
const SPACING = 6;
const cum = [0];
for (let i = 0; i < rotated.length; i++) cum.push(cum[i] + dist(rotated[i], rotated[(i + 1) % rotated.length]));
const total = cum[cum.length - 1];
const count = Math.round(total / SPACING);
const step = total / count;

const resampled = [];
let seek = 0;
for (let k = 0; k < count; k++) {
  const target = k * step;
  while (seek < cum.length - 2 && cum[seek + 1] < target) seek++;
  const segLen = cum[seek + 1] - cum[seek];
  const t = segLen > 0 ? (target - cum[seek]) / segLen : 0;
  const a = rotated[seek % rotated.length];
  const b = rotated[(seek + 1) % rotated.length];
  resampled.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
}

function smooth(points, passes, weight) {
  let out = points;
  for (let p = 0; p < passes; p++) {
    out = out.map((pt, i) => {
      const prev = out[(i - 1 + out.length) % out.length];
      const nxt = out[(i + 1) % out.length];
      return {
        x: pt.x * (1 - weight) + ((prev.x + nxt.x) / 2) * weight,
        z: pt.z * (1 - weight) + ((prev.z + nxt.z) / 2) * weight,
      };
    });
  }
  return out;
}
const smoothed = smooth(resampled, 4, 0.4);

// Section fractions around the lap, from the OSM way order.
const sections = rotatedNames
  .map((n) => ({ name: n.name, t: cum[n.index] / total }))
  .filter((s, i, arr) => i === 0 || s.name !== arr[i - 1].name);

// Real-world altitudes (m above sea level) for the named sections.
// Lowest: Breidscheid ~320 m. Highest: Hohe Acht ~617 m.
const ALT = {
  'T13': 588,
  'Sabine-Schmitz-Kurve': 585,
  'Hatzenbogen': 580,
  'Hatzenbach': 570,
  'Hocheichen': 558,
  'Quiddelbacher Höhe': 566,
  'Flugplatz': 560,
  'Schwedenkreuz': 538,
  'Aremberg': 520,
  'Fuchsröhre': 468,
  'Adenauer Forst': 506,
  'Metzgesfeld': 490,
  'Kallenhard': 452,
  'Spiegelkurve': 421,
  'Dreifach-Rechts': 404,
  'Wehrseifen': 368,
  'Breidscheid': 320,
  'Exmühle': 336,
  'Lauda-Links': 358,
  'Bergwerk': 376,
  'Senkenlinks': 391,
  'Kesselchen': 421,
  'Mutkurve': 454,
  'Klostertal': 470,
  'Steilstrecke': 501,
  'Karussell': 546,
  'Hohe Acht': 617,
  'Hedwigshöhe': 599,
  'Wippermann': 584,
  'Eschbach': 569,
  'Brünnchen': 554,
  'Eiskurve': 546,
  'Pflanzgarten': 534,
  'Sprunghügel': 529,
  'Stefan-Bellof-S': 524,
  'Schwalbenschwanz': 531,
  'Mini-Karussell': 541,
  'Galgenkopf': 556,
  'Nürburgring Nordschleife': 578,
  'Döttinger Höhe': 590,
  'Antoniusbuche': 600,
  'Tiergarten': 594,
  'Hohenrain': 590,
};

// Anchor each altitude at the MIDDLE of its section, not its start. A landmark
// like the Hohe Acht summit sits inside its stretch of road, and anchoring at
// the section boundary crushes the whole climb into the few metres between two
// adjacent OSM ways — which produced a 58% gradient out of the Karussell.
const keys = [];
for (let i = 0; i < sections.length; i++) {
  const alt = ALT[sections[i].name];
  if (alt == null) continue;
  const t0 = sections[i].t;
  let t1 = sections[(i + 1) % sections.length].t;
  if (t1 <= t0) t1 += 1;
  keys.push([(t0 + t1) / 2, alt]);
}
keys.sort((a, b) => a[0] - b[0]);
// Wrap the ring so interpolation is continuous across the start/finish line.
keys.unshift([keys[keys.length - 1][0] - 1, keys[keys.length - 1][1]]);
keys.push([keys[1][0] + 1, keys[1][1]]);

function altitudeAt(frac) {
  for (let i = 0; i < keys.length - 1; i++) {
    const [f0, y0] = keys[i];
    const [f1, y1] = keys[i + 1];
    if (frac >= f0 && frac <= f1) {
      const t = (frac - f0) / (f1 - f0);
      const s = t * t * (3 - 2 * t);
      return y0 + (y1 - y0) * s;
    }
  }
  return keys[keys.length - 1][1];
}

// Raw profile straight from the anchors.
let elevation = smoothed.map((_, i) => altitudeAt(i / smoothed.length));

// Slope limiting. The Nordschleife's steepest sustained gradient is about 17%;
// anything beyond that is an artefact of interpolating between anchor points,
// not real road. Sweep the ring forwards and backwards clamping the step
// between neighbours until nothing exceeds the limit.
const MAX_GRADIENT = 0.17;
const maxStep = MAX_GRADIENT * SPACING;
for (let pass = 0; pass < 400; pass++) {
  let changed = false;
  for (let i = 0; i < elevation.length; i++) {
    const j = (i + 1) % elevation.length;
    const d = elevation[j] - elevation[i];
    if (d > maxStep) {
      const excess = (d - maxStep) / 2;
      elevation[i] += excess;
      elevation[j] -= excess;
      changed = true;
    } else if (d < -maxStep) {
      const excess = (-d - maxStep) / 2;
      elevation[i] -= excess;
      elevation[j] += excess;
      changed = true;
    }
  }
  for (let i = elevation.length - 1; i >= 0; i--) {
    const j = (i + 1) % elevation.length;
    const d = elevation[j] - elevation[i];
    if (Math.abs(d) > maxStep) {
      const excess = (Math.abs(d) - maxStep) / 2 * Math.sign(d);
      elevation[i] += excess;
      elevation[j] -= excess;
      changed = true;
    }
  }
  if (!changed) break;
}

// Light final smoothing so the transitions read as road rather than facets.
for (let pass = 0; pass < 6; pass++) {
  const next = elevation.slice();
  for (let i = 0; i < elevation.length; i++) {
    const a = elevation[(i - 1 + elevation.length) % elevation.length];
    const b = elevation[(i + 1) % elevation.length];
    next[i] = elevation[i] * 0.5 + ((a + b) / 2) * 0.5;
  }
  elevation = next;
}

const BASE = Math.min(...elevation); // track-local y=0 at the lowest point
const withY = smoothed.map((p, i) => ({
  x: +p.x.toFixed(2),
  y: +(elevation[i] - BASE).toFixed(2),
  z: +p.z.toFixed(2),
}));

{
  const grads = [];
  for (let i = 0; i < withY.length; i++) {
    const j = (i + 1) % withY.length;
    const run = Math.hypot(withY[j].x - withY[i].x, withY[j].z - withY[i].z);
    if (run > 1e-6) grads.push(Math.abs(withY[j].y - withY[i].y) / run);
  }
  grads.sort((a, b) => a - b);
  console.log(
    'gradient p50/p99/max:',
    (grads[Math.floor(grads.length * 0.5)] * 100).toFixed(2) + '%',
    (grads[Math.floor(grads.length * 0.99)] * 100).toFixed(2) + '%',
    (grads[grads.length - 1] * 100).toFixed(2) + '%',
  );
}

// ------------------------------------------------------ length calibration
// Resampling and smoothing a polyline always shortens it, and OSM node
// placement is approximate, so the traced centreline comes out around 0.35%
// under the official 20.832 km. Scale the plan geometry about its centroid
// until the measured lap matches. At this magnitude corner radii shift by well
// under a metre, but the lap distance is then correct.
const OFFICIAL_LAP_M = 20832;

const measure3D = (pts) => {
  let total = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    total += Math.hypot(b.x - a.x, b.z - a.z, b.y - a.y);
  }
  return total;
};

{
  let cx = 0;
  let cz = 0;
  for (const p of withY) {
    cx += p.x;
    cz += p.z;
  }
  cx /= withY.length;
  cz /= withY.length;

  const before = measure3D(withY);
  // Two passes: scaling x/z leaves y alone, so the 3D length lags the factor.
  for (let pass = 0; pass < 4; pass++) {
    const current = measure3D(withY);
    const factor = OFFICIAL_LAP_M / current;
    if (Math.abs(factor - 1) < 1e-6) break;
    for (const p of withY) {
      p.x = +(cx + (p.x - cx) * factor).toFixed(2);
      p.z = +(cz + (p.z - cz) * factor).toFixed(2);
    }
  }
  console.log(
    'lap calibration:',
    (before / 1000).toFixed(3),
    'km ->',
    (measure3D(withY) / 1000).toFixed(3),
    'km (official 20.832 km)',
  );
}

// Distance along the track surface, which is what the official 20.832 km
// figure measures and what RoadPath uses for its arc length.
const lapLength = measure3D(withY);

const out = {
  name: 'Nordschleife',
  source: 'OpenStreetMap relation 38566 (ODbL) — © OpenStreetMap contributors',
  origin: { lat: lat0, lon: lon0 },
  lapLength: +lapLength.toFixed(1),
  spacing: SPACING,
  sections: sections.map((s) => ({ name: s.name, t: +s.t.toFixed(5) })),
  points: withY,
};

const dest = path.join(__dirname, '..', 'src', 'data', 'nordschleife.json');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, JSON.stringify(out));
console.log('points:', withY.length, 'lap:', (lapLength / 1000).toFixed(3), 'km', 'sections:', sections.length);
console.log('elevation range:', Math.min(...withY.map((p) => p.y)).toFixed(1), '->', Math.max(...withY.map((p) => p.y)).toFixed(1));
console.log('written ->', dest);
