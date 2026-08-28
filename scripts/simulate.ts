/**
 * Headless validation: drives every car in the fleet around the Home Circuit
 * with a simple racing line follower, so lap times, grip levels and the lap
 * counter can be checked without a browser.
 *
 *   npx vite build --ssr scripts/simulate.ts --outDir scripts/dist
 *   node scripts/dist/simulate.js
 */
import * as THREE from 'three';
import { RoadPath, Track } from '../src/game/track';
import { Vehicle, maxSteerAngle } from '../src/game/physics';
import { FLEET } from '../src/data/fleet';
import { buildRacingLine } from './racingLine';

const G = 9.81;

function driveLap(carIndex: number, assists: boolean) {
  const track = new Track();
  const car = FLEET[carIndex];
  const vehicle = new Vehicle(car);
  vehicle.assists = assists;
  // Onto the racing line, not the centreline: starting a metre off the line
  // it is about to follow costs the first corner for no reason.
  const line = buildRacingLine(track, car);
  vehicle.placeOnTrack(track, 0, line.offset[0]);

  const n = track.count;
  const dt = 1 / 120;
  let time = 0;
  let progress = 0;
  let lastIndex = vehicle.trackIndex;
  let topSpeed = 0;
  let contacts = 0;
  let wasInContact = false;
  let offTrackTime = 0;
  let maxLateral = 0;
  let vTarget = 0;
  let stuckFor = 0;
  let steerSmooth = 0;

  /** How quickly the follower's hands move, 1/s. */
  const STEER_DAMPING = 12;

  const LIMIT = 60 * 30;

  while (progress < n && time < LIMIT) {
    const idx = vehicle.trackIndex;

    if (!Number.isFinite(vehicle.vLong) || !Number.isFinite(vehicle.position.x) || !Number.isFinite(vehicle.yaw)) {
      console.error('NaN state at t=' + time.toFixed(3), {
        vLong: vehicle.vLong,
        vLat: vehicle.vLat,
        yaw: vehicle.yaw,
        yawRate: vehicle.yawRate,
        pos: vehicle.position.toArray(),
        idx,
      });
      break;
    }

    // --- Follow the racing line ----------------------------------------
    // Look further ahead the faster you are going, which is what makes a
    // pure-pursuit follower stable: a fixed lookahead oscillates at speed and
    // understeers wide at walking pace.
    const speed = Math.abs(vehicle.vLong);
    const lookahead = Math.max(2, Math.round((10 + speed * 0.85) / track.spacing));
    const aimPoint = line.points[(idx + lookahead) % n];

    const toTarget = new THREE.Vector3().subVectors(aimPoint, vehicle.position);
    toTarget.y = 0;
    const fwd = vehicle.forward;
    const left = vehicle.left;
    // Positive angle means the target lies to the left.
    const angle = Math.atan2(toTarget.dot(left), toTarget.dot(fwd));
    const dist = Math.max(toTarget.length(), 1);

    const lateral = track.lateralOffset(vehicle.position, idx);
    maxLateral = Math.max(maxLateral, Math.abs(lateral));

    // Steering angle that would arc the car onto the target point, left-positive.
    const desiredDelta = Math.atan2(2 * car.wheelbase * Math.sin(angle), dist);
    // The physics limits lock with speed; normalise against the same curve.
    // Imported rather than copied — a second copy here would go stale the
    // moment the steering law changes.
    const maxSteer = maxSteerAngle(speed, car.grip, car.wheelbase);
    // DriveInput.steer is right-positive, so the term flips sign here. No
    // recentring term any more: the line *is* the target, so pulling towards
    // the centreline as well would only fight it. That fight is what put the
    // old follower into the barriers.
    const wanted = THREE.MathUtils.clamp(-(desiredDelta / maxSteer), -1, 1);
    // First-order damping on the steering command. A pure-pursuit follower
    // feeding the raw command into a car with real steering inertia rings —
    // it corrects, overshoots, corrects harder — and on a short-wheelbase
    // machine that ringing is what walks it into the barriers. A person's
    // hands do this smoothing without thinking about it.
    steerSmooth += (wanted - steerSmooth) * Math.min(1, dt * STEER_DAMPING);
    const steer = steerSmooth;

    // --- Speed from the profile ----------------------------------------
    // The profile already accounts for what is coming: it was built with a
    // backward pass from every corner, so the number at this index is one the
    // car can still act on. Nothing has to be scanned per frame.
    const vMax = line.speed[idx];
    // Rate-limit so a lookahead jump at a hairpin cannot spike the throttle.
    vTarget += THREE.MathUtils.clamp(vMax - vTarget, -18 * dt, 10 * dt);

    const error = vTarget - speed;
    let throttle = THREE.MathUtils.clamp(error * 0.5, 0, 1);
    const brake = THREE.MathUtils.clamp(-error * 0.45, 0, 1);
    // Lift off only when genuinely sideways — a few degrees of body slip is
    // normal in a fast corner and must not cut the throttle.
    const slip = Math.abs(Math.atan2(vehicle.vLat, Math.max(speed, 1)));
    if (slip > 0.3) throttle *= Math.max(0.15, 1 - (slip - 0.3) * 3);

    const telemetry = vehicle.step(dt, { throttle, brake, steer, handbrake: false }, track);
    time += dt;
    topSpeed = Math.max(topSpeed, telemetry.speedKmh);
    // Edge-count, matching Game.ts: one touch = one contact, however long it grinds.
    if (telemetry.contact && !wasInContact) contacts++;
    wasInContact = telemetry.contact;
    if (telemetry.offTrack) offTrackTime += dt;

    // A human would press R; do the same so one bad corner does not skew the run.
    if (telemetry.speedKmh < 12) {
      stuckFor += dt;
      if (stuckFor > 3) {
        vehicle.placeOnTrack(track, vehicle.trackIndex, line.offset[vehicle.trackIndex]);
        vTarget = 0;
        steerSmooth = 0;
        stuckFor = 0;
      }
    } else {
      stuckFor = 0;
    }

    // --- Lap progress ---------------------------------------------------
    const now = vehicle.trackIndex;
    let delta = now - lastIndex;
    if (delta > n / 2) delta -= n;
    if (delta < -n / 2) delta += n;
    progress += delta;
    lastIndex = now;
  }

  // Line-accurate finish: back out the time spent past the line, mirroring
  // the interpolation the game itself applies.
  if (progress >= n) {
    const overshootM = (progress - n) * track.spacing;
    time -= overshootM / Math.max(Math.abs(vehicle.vLong), 5);
  }

  return {
    car: `${car.brand} ${car.model}`,
    completed: progress >= n,
    time,
    target: car.targetLapSec,
    topSpeed,
    contacts,
    offTrackPct: (offTrackTime / time) * 100,
    maxLateral,
  };
}

// =====================================================================
// H12: 0-100 km/h on a synthetic flat straight — the one figure the fleet
// data sheet states that nothing measured before.
// =====================================================================
function measureZeroToHundred(carIndex: number): number {
  const car = FLEET[carIndex];
  const pts: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < 400; i++) pts.push({ x: 0, y: 0, z: i * 6 });
  const straight = new RoadPath(pts, { closed: false, spacing: 6, halfWidth: 8 });

  const vehicle = new Vehicle(car);
  vehicle.assists = true;
  vehicle.placeOnTrack(straight, 2, 0);

  const dt = 1 / 120;
  let t = 0;
  let prevKmh = 0;
  while (t < 20) {
    const tel = vehicle.step(dt, { throttle: 1, brake: 0, steer: 0, handbrake: false }, straight);
    t += dt;
    if (tel.speedKmh >= 100) {
      // Interpolate inside the crossing step for a stable third decimal.
      const f = (100 - prevKmh) / Math.max(tel.speedKmh - prevKmh, 1e-6);
      return t - dt + dt * f;
    }
    prevKmh = tel.speedKmh;
  }
  return Infinity;
}

// =====================================================================
// N17: a short no-assists stability probe per car — not a full lap, but
// enough to catch the "instant spin without electronics" class of bug.
// =====================================================================
function probeNoAssists(carIndex: number): { ok: boolean; note: string } {
  const track = new Track();
  const car = FLEET[carIndex];
  const vehicle = new Vehicle(car);
  vehicle.assists = false;
  vehicle.placeOnTrack(track, 0, 0);

  const dt = 1 / 120;
  let spun = 0;
  for (let step = 0; step < 120 * 45; step++) {
    // Modest driving: 60% throttle, gentle weave — a competent human hand.
    const steer = Math.sin(step / 240) * 0.25;
    const tel = vehicle.step(dt, { throttle: 0.6, brake: 0, steer, handbrake: false }, track);
    if (!Number.isFinite(vehicle.vLong) || !Number.isFinite(vehicle.yaw)) {
      return { ok: false, note: 'NaN state' };
    }
    if (Math.abs(tel.slipAngle) > 1.0) spun++;
  }
  return spun > 240
    ? { ok: false, note: `sideways for ${(spun / 120).toFixed(1)}s` }
    : { ok: true, note: 'stable' };
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
}

const track = new Track();
console.log('=== Home Circuit — Nordschleife ===');
console.log('centreline points :', track.count);
console.log('lap length        :', (track.lapLength / 1000).toFixed(3), 'km');
console.log('named sections    :', track.sections.length);
const ys = track.points.map((p) => p.pos.y);
console.log('elevation         :', Math.min(...ys).toFixed(1), '→', Math.max(...ys).toFixed(1), 'm');
const curvs = track.points.map((p) => Math.abs(p.curvature)).filter((c) => c > 1e-4);
const tightest = Math.max(...curvs);
console.log('tightest radius   :', (1 / tightest).toFixed(1), 'm');
console.log('avg half-width    :', (track.points.reduce((a, p) => a + p.halfWidth, 0) / track.count).toFixed(2), 'm');
console.log('');

console.log('=== 0-100 km/h (model vs. data sheet) ===');
for (let i = 0; i < FLEET.length; i++) {
  const car = FLEET[i];
  const t = measureZeroToHundred(i);
  const delta = t - car.zeroToHundred;
  console.log(
    `${(car.brand + ' ' + car.model).padEnd(26)} model ${t.toFixed(2).padStart(5)}s  sheet ${car.zeroToHundred
      .toFixed(1)
      .padStart(4)}s  d ${(delta >= 0 ? '+' : '') + delta.toFixed(2)}s`,
  );
}
console.log('');

console.log('=== No-assists stability probe (45 s) ===');
for (let i = 0; i < FLEET.length; i++) {
  const r = probeNoAssists(i);
  console.log(`${(FLEET[i].brand + ' ' + FLEET[i].model).padEnd(26)} ${r.ok ? 'OK ' : 'FAIL'} ${r.note}`);
}
console.log('');

console.log('=== Auto-driver lap times ===');
for (let i = 0; i < FLEET.length; i++) {
  const r = driveLap(i, true);
  const status = r.completed ? 'OK ' : 'DNF';
  // The margin, not the raw delta, is what the target is actually for: this
  // is a clean reference lap driven by something that never makes a mistake,
  // so the target has to sit some way above it for a person on a keyboard.
  // Comparing margins across the fleet is how you see whether the targets are
  // consistent with each other, which the seconds alone never showed.
  const margin = r.completed ? `${(((r.target - r.time) / r.target) * 100).toFixed(1)}%` : '—';
  console.log(
    `${status} ${r.car.padEnd(26)} ${fmt(r.time).padStart(9)}  Ziel ${fmt(r.target).padStart(9)}  ` +
      `Luft ${margin.padStart(6)}  vmax ${r.topSpeed.toFixed(0).padStart(3)} km/h  ` +
      `Kontakte ${String(r.contacts).padStart(3)}  off ${r.offTrackPct.toFixed(1)}%`,
  );
}
