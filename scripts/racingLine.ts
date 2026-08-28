import * as THREE from 'three';
import type { Track } from '../src/game/track';
import type { Car } from '../src/data/fleet';

/**
 * A racing line, and the speed to take it at.
 *
 * The headless follower used to pick its line one frame at a time: look ahead,
 * average the curvature, offset towards the inside. That is not a racing line,
 * it is a reflex, and it drove the way a reflex drives — the same fleet ran
 * 20 to 53 per cent of the lap off the circuit and hit the barriers 111 to 348
 * times a lap, which made its lap times meaningless as a yardstick. A tool
 * whose numbers cannot be trusted is worse than no tool, because the numbers
 * still look like numbers.
 *
 * So the line is computed once, before the car turns a wheel, in two passes
 * that are standard and unglamorous:
 *
 *  1. **Minimum curvature.** Every point may sit anywhere across the track
 *     width. Repeatedly move each one towards the midpoint of its neighbours,
 *     clamped inside the kerbs. Straightening a corner is exactly what pulls
 *     the line to the outside on entry, to the apex, and out again — nobody
 *     has to describe an apex to it.
 *  2. **Speed profile.** Cornering speed from the curvature of that line,
 *     then a backward pass so the car is slow enough by the time it arrives,
 *     then a forward pass so it does not accelerate harder than the tyres
 *     allow. This is the same three-step every real racing-line tool uses.
 */

export interface RacingLine {
  /** World position of the line at each track index. */
  points: THREE.Vector3[];
  /** Target speed at each index, m/s. */
  speed: number[];
  /** Signed lateral offset from the centreline, metres; left is positive. */
  offset: number[];
}

const G = 9.81;
/** How far inside the kerb the line is allowed to run. */
const EDGE_MARGIN = 0.9;
/** Relaxation passes. Convergence is quick; this is comfortably past it. */
const SMOOTH_PASSES = 600;
/** How far each pass moves a point towards its neighbours' midpoint. */
const SMOOTH_RATE = 0.22;

export function buildRacingLine(track: Track, car: Car): RacingLine {
  const n = track.count;
  const centre: THREE.Vector3[] = [];
  const normal: THREE.Vector3[] = [];
  const limit: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = track.at(i);
    centre.push(p.pos.clone());
    normal.push(p.normal.clone());
    limit.push(Math.max(0, p.halfWidth - EDGE_MARGIN));
  }

  // ------------------------------------------------- 1. minimum curvature
  const offset = new Array<number>(n).fill(0);
  const at = (i: number) => (i + n) % n;
  const point = (i: number, out: THREE.Vector3) =>
    out.copy(centre[at(i)]).addScaledVector(normal[at(i)], offset[at(i)]);

  const prev = new THREE.Vector3();
  const next = new THREE.Vector3();
  const here = new THREE.Vector3();
  const mid = new THREE.Vector3();

  for (let pass = 0; pass < SMOOTH_PASSES; pass++) {
    for (let i = 0; i < n; i++) {
      point(i - 1, prev);
      point(i + 1, next);
      point(i, here);
      mid.addVectors(prev, next).multiplyScalar(0.5);
      // Only the component across the track is available to us; the line has
      // to stay on the road, not take a short cut through the trees.
      const want = mid.sub(centre[i]).dot(normal[i]);
      const moved = offset[i] + (want - offset[i]) * SMOOTH_RATE;
      offset[i] = Math.max(-limit[i], Math.min(limit[i], moved));
    }
  }

  const points: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    points.push(centre[i].clone().addScaledVector(normal[i], offset[i]));
  }

  // ------------------------------------------------------ 2. speed profile
  // Curvature of the line itself, from the circle through three consecutive
  // points. The track's own curvature describes the centreline, which is not
  // the path being driven and is tighter than it almost everywhere.
  const curve = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    const a = points[at(i - 1)];
    const b = points[i];
    const c = points[at(i + 1)];
    const ab = a.distanceTo(b);
    const bc = b.distanceTo(c);
    const ca = c.distanceTo(a);
    // Menger curvature: k = 4A / (a*b*c). The cross product gives 2A, so the
    // factor is 2, not 1. Getting this wrong halves every curvature, which
    // doubles every radius and lets the profile through corners 41 per cent
    // too fast — measured: the slowest point on the whole Nordschleife came
    // out at 75 km/h, and Wehrseifen is a 40 km/h corner.
    const cross = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
    const area2 = Math.abs(cross);
    curve[i] = area2 < 1e-9 ? 0 : (2 * area2) / (ab * bc * ca);
  }

  const mu = car.grip;
  const top = car.topSpeedKmh / 3.6;
  const speed = new Array<number>(n).fill(top);
  for (let i = 0; i < n; i++) {
    if (curve[i] < 1e-5) continue;
    // v²/R = mu*g*(1 + k*v²) solves to v² = mu*g / (1/R - mu*g*k).
    const denom = curve[i] - mu * G * car.downforce;
    speed[i] = denom <= 1e-6 ? top : Math.min(top, Math.sqrt((mu * G) / denom));
  }

  // Leave something in hand. A line driven at exactly its own limit has no
  // margin for the car being a millimetre off it, and the follower always is.
  for (let i = 0; i < n; i++) speed[i] *= CORNER_MARGIN;

  const step = (i: number) => points[i].distanceTo(points[at(i + 1)]);
  const brake = mu * G * BRAKE_SHARE;
  const drive = mu * G * DRIVE_SHARE;

  // Backward: be slow enough on arrival. Two laps of it, because the loop
  // wraps and the first pass has nothing behind the start line to work from.
  for (let lap = 0; lap < 2; lap++) {
    for (let k = n - 1; k >= 0; k--) {
      const i = at(k);
      const j = at(k + 1);
      const reachable = Math.sqrt(speed[j] * speed[j] + 2 * brake * step(i));
      speed[i] = Math.min(speed[i], reachable);
    }
  }
  // Forward: do not accelerate harder than the tyres can.
  for (let lap = 0; lap < 2; lap++) {
    for (let k = 0; k < n; k++) {
      const i = at(k);
      const j = at(k - 1);
      const reachable = Math.sqrt(speed[j] * speed[j] + 2 * drive * step(j));
      speed[i] = Math.min(speed[i], reachable);
    }
  }

  return { points, speed, offset };
}

/** Fraction of the theoretical cornering limit the follower aims for. */
const CORNER_MARGIN = 0.92;
/** How much of the friction circle braking and acceleration may each claim. */
const BRAKE_SHARE = 0.85;
const DRIVE_SHARE = 0.45;
