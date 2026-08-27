import * as THREE from 'three';
import trackData from '../data/nordschleife.json';
import approachData from '../data/approach.json';

export interface TrackSection {
  name: string;
  t: number;
  /** Index of the first centreline point belonging to this section. */
  index: number;
}

export interface RoadPoint {
  pos: THREE.Vector3;
  /** Unit tangent along the direction of travel. */
  tangent: THREE.Vector3;
  /** Unit lateral vector, pointing to the driver's left. */
  normal: THREE.Vector3;
  /** Distance from the start of the path, metres. */
  s: number;
  /** Signed curvature, 1/m. Positive turns left. */
  curvature: number;
  /** Half-width of the asphalt at this point, metres. */
  halfWidth: number;
  /** Banking angle in radians; positive raises the left-hand edge. */
  banking: number;
}

/**
 * A drivable ribbon of road. Closed paths (the circuit) wrap around; open paths
 * (the approach from the home address) clamp at their ends. The physics only
 * ever talks to this interface, so both behave identically under the car.
 */
export class RoadPath {
  readonly points: RoadPoint[] = [];
  readonly closed: boolean;
  readonly spacing: number;
  readonly length: number;

  constructor(
    raw: { x: number; y: number; z: number }[],
    options: { closed: boolean; spacing: number; halfWidth: number | ((i: number, n: number) => number) },
  ) {
    this.closed = options.closed;
    this.spacing = options.spacing;
    const n = raw.length;
    const positions = raw.map((p) => new THREE.Vector3(p.x, p.y, p.z));

    const idx = (i: number) => (this.closed ? ((i % n) + n) % n : THREE.MathUtils.clamp(i, 0, n - 1));

    let s = 0;
    const arc: number[] = [];
    for (let i = 0; i < n; i++) {
      arc.push(s);
      if (this.closed || i < n - 1) s += positions[i].distanceTo(positions[idx(i + 1)]);
    }
    this.length = s;

    const rawCurvature: number[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const prev = positions[idx(i - 1)];
      const next = positions[idx(i + 1)];
      const tangent = new THREE.Vector3().subVectors(next, prev);
      if (tangent.lengthSq() < 1e-9) tangent.set(0, 0, 1);
      tangent.normalize();
      // Left-hand lateral: the flattened tangent rotated 90° about +Y.
      const normal = new THREE.Vector3(tangent.z, 0, -tangent.x);
      if (normal.lengthSq() < 1e-9) normal.set(1, 0, 0);
      normal.normalize();

      const a = new THREE.Vector2(positions[i].x - prev.x, positions[i].z - prev.z);
      const b = new THREE.Vector2(next.x - positions[i].x, next.z - positions[i].z);
      const cross = a.x * b.y - a.y * b.x;
      const dot = a.x * b.x + a.y * b.y;
      const angle = Math.atan2(cross, dot);
      const segLen = (a.length() + b.length()) * 0.5;
      rawCurvature[i] = segLen > 1e-6 ? -angle / segLen : 0;

      const hw = typeof options.halfWidth === 'function' ? options.halfWidth(i, n) : options.halfWidth;
      this.points.push({
        pos: positions[i],
        tangent,
        normal,
        s: arc[i],
        curvature: 0,
        halfWidth: hw,
        banking: 0,
      });
    }

    const smoothCurv = smoothPath(rawCurvature, 4, 0.5, this.closed);
    for (let i = 0; i < n; i++) this.points[i].curvature = smoothCurv[i];
  }

  get count(): number {
    return this.points.length;
  }

  /** Index access; wraps on a closed path, clamps on an open one. */
  at(i: number): RoadPoint {
    const n = this.points.length;
    const idx = Math.round(i);
    if (this.closed) return this.points[((idx % n) + n) % n];
    return this.points[THREE.MathUtils.clamp(idx, 0, n - 1)];
  }

  /**
   * Nearest centreline index to a world position. `hint` seeds a local search,
   * which is valid because the car moves continuously between frames.
   * `radiusMetres` is a distance along the path; the point window is derived
   * from the actual spacing so a resample never silently shrinks the search.
   */
  nearestIndex(pos: THREE.Vector3, hint: number, radiusMetres = 360): number {
    const n = this.points.length;
    const radius = Math.max(3, Math.round(radiusMetres / this.spacing));
    let best = hint;
    let bestDist = Infinity;
    for (let k = -radius; k <= radius; k++) {
      let i = hint + k;
      if (this.closed) i = ((i % n) + n) % n;
      else if (i < 0 || i >= n) continue;
      const d = this.points[i].pos.distanceToSquared(pos);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  }

  /** Global nearest index — used on reset and when the local search loses the car. */
  nearestIndexGlobal(pos: THREE.Vector3): number {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < this.points.length; i++) {
      const d = this.points[i].pos.distanceToSquared(pos);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  }

  /** Signed lateral offset from the centreline; positive is to the driver's left. */
  lateralOffset(pos: THREE.Vector3, index: number): number {
    const p = this.points[index] ?? this.at(index);
    const d = new THREE.Vector3().subVectors(pos, p.pos);
    return d.dot(p.normal);
  }

  /** Interpolated surface height under a world position. */
  surfaceHeight(pos: THREE.Vector3, index: number): number {
    const p = this.at(index);
    const next = this.at(index + 1);
    const seg = new THREE.Vector3().subVectors(next.pos, p.pos);
    const rel = new THREE.Vector3().subVectors(pos, p.pos);
    const len2 = seg.lengthSq();
    const t = len2 > 1e-9 ? THREE.MathUtils.clamp(rel.dot(seg) / len2, 0, 1) : 0;
    const baseY = p.pos.y + (next.pos.y - p.pos.y) * t;
    const bank = p.banking + (next.banking - p.banking) * t;
    return baseY + this.lateralOffset(pos, index) * Math.sin(bank);
  }
}

/** Sections that are noticeably narrower than the average. */
const NARROW_SECTIONS = new Set([
  'Fuchsröhre',
  'Adenauer Forst',
  'Wehrseifen',
  'Breidscheid',
  'Exmühle',
  'Bergwerk',
  'Steilstrecke',
  'Karussell',
  'Hohe Acht',
  'Wippermann',
  'Brünnchen',
  'Eiskurve',
  'Mini-Karussell',
]);

const WIDE_SECTIONS = new Set([
  'T13',
  'Döttinger Höhe',
  'Antoniusbuche',
  'Tiergarten',
  'Hohenrain',
  'Sabine-Schmitz-Kurve',
  'Quiddelbacher Höhe',
]);

/** The two banked concrete corners. Negative banking raises the outer, right-hand edge. */
const BANKED_SECTIONS: Record<string, number> = {
  'Karussell': -0.42,
  'Mini-Karussell': -0.3,
};

export class Track extends RoadPath {
  readonly sections: TrackSection[];
  readonly lapLength: number;
  readonly name = 'Nordschleife';
  private readonly sectionOf: string[];

  constructor() {
    const raw = trackData.points as { x: number; y: number; z: number }[];
    const n = raw.length;

    // Width follows the real layout, so resolve the section map up front.
    const sectionMeta = (trackData.sections as { name: string; t: number }[]).map((sec) => ({
      name: sec.name,
      t: sec.t,
      index: Math.round(sec.t * n) % n,
    }));

    const sectionOf: string[] = new Array(n);
    for (let i = 0; i < sectionMeta.length; i++) {
      const start = sectionMeta[i].index;
      const end = sectionMeta[(i + 1) % sectionMeta.length].index;
      // A zero-length section (both boundaries rounded onto one point) would
      // otherwise walk the entire ring and overpaint every other section.
      if (start === end) {
        sectionOf[start] = sectionMeta[i].name;
        continue;
      }
      let cursor = start;
      for (let k = 0; k < n + 1; k++) {
        sectionOf[cursor] = sectionMeta[i].name;
        cursor = (cursor + 1) % n;
        if (cursor === end) break;
      }
    }
    for (let i = 0; i < n; i++) if (!sectionOf[i]) sectionOf[i] = 'Nordschleife';

    const rawWidth = new Array<number>(n);
    for (let i = 0; i < n; i++) {
      const sec = sectionOf[i];
      rawWidth[i] = NARROW_SECTIONS.has(sec) ? 3.7 : WIDE_SECTIONS.has(sec) ? 6.0 : 4.3;
    }
    const width = smoothPath(rawWidth, 30, 0.5, true);

    super(raw, { closed: true, spacing: trackData.spacing, halfWidth: (i) => width[i] });

    this.sections = sectionMeta;
    this.sectionOf = sectionOf;
    this.lapLength = this.length;

    // Banking: the two concrete carousels, plus natural camber falling away
    // from each corner.
    const rawBank = new Array<number>(n);
    for (let i = 0; i < n; i++) rawBank[i] = BANKED_SECTIONS[sectionOf[i]] ?? 0;
    const bank = smoothPath(rawBank, 24, 0.5, true);
    for (let i = 0; i < n; i++) {
      this.points[i].banking = bank[i] - THREE.MathUtils.clamp(this.points[i].curvature * 1.2, -0.05, 0.05);
    }
  }

  /** Section name at a given centreline index. */
  sectionNameAt(index: number): string {
    const n = this.points.length;
    return this.sectionOf[((index % n) + n) % n] ?? 'Nordschleife';
  }

  /** Distance travelled from the start/finish line for a centreline index. */
  distanceAt(index: number): number {
    return this.at(index).s;
  }
}

/** The public-road drive from the Rent4Ring home address onto the circuit. */
export class Approach extends RoadPath {
  /** Index on the circuit where this road merges. */
  readonly joinIndex: number;
  readonly from: string;
  /** The B258 roundabout the route goes round, in world coordinates. */
  readonly roundabout: { x: number; z: number; radius: number };

  constructor() {
    super(approachData.points as { x: number; y: number; z: number }[], {
      closed: false,
      spacing: approachData.spacing,
      halfWidth: approachData.halfWidth,
    });
    this.joinIndex = approachData.joinIndex;
    this.from = approachData.from;
    this.roundabout = approachData.roundabout;
  }
}

/** Circular or open smoothing, matching the path topology. */
function smoothPath(values: number[], passes: number, weight: number, closed: boolean): number[] {
  const n = values.length;
  let out = values.slice();
  for (let p = 0; p < passes; p++) {
    const next = new Array<number>(n);
    for (let i = 0; i < n; i++) {
      const ai = closed ? (i - 1 + n) % n : Math.max(0, i - 1);
      const bi = closed ? (i + 1) % n : Math.min(n - 1, i + 1);
      next[i] = out[i] * (1 - weight) + ((out[ai] + out[bi]) / 2) * weight;
    }
    out = next;
  }
  return out;
}

export const TRACK_ATTRIBUTION = trackData.source;
export const APPROACH_LENGTH = approachData.length;
