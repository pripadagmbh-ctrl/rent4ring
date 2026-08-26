/**
 * Headless validation: drives every car in the fleet around the Home Circuit
 * with a simple racing line follower, so lap times, grip levels and the lap
 * counter can be checked without a browser.
 *
 *   npx vite build --ssr scripts/simulate.ts --outDir scripts/dist
 *   node scripts/dist/simulate.js
 */
import * as THREE from 'three';
import { Track } from '../src/game/track';
import { Vehicle } from '../src/game/physics';
import { FLEET } from '../src/data/fleet';

const G = 9.81;

function driveLap(carIndex: number, assists: boolean) {
  const track = new Track();
  const car = FLEET[carIndex];
  const vehicle = new Vehicle(car);
  vehicle.assists = assists;
  vehicle.placeOnTrack(track, 0, 0);

  const n = track.count;
  const dt = 1 / 120;
  let time = 0;
  let progress = 0;
  let lastIndex = vehicle.trackIndex;
  let topSpeed = 0;
  let contacts = 0;
  let inContact = false;
  let offTrackTime = 0;
  let maxLateral = 0;
  let vTarget = 0;
  let stuckFor = 0;

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

    // --- Pure-pursuit steering towards a point up the road -------------
    const speed = Math.abs(vehicle.vLong);
    const lookaheadM = 12 + speed * 0.9;
    const lookahead = Math.max(2, Math.round(lookaheadM / track.spacing));
    const target = track.at(idx + lookahead);

    // Poor man's racing line: aim towards the inside of whatever is coming,
    // averaged over the next stretch so the line does not twitch point to point.
    let curvAvg = 0;
    const lineScan = Math.round(90 / track.spacing);
    for (let k = 0; k < lineScan; k++) curvAvg += track.at(idx + lookahead + k).curvature;
    curvAvg /= lineScan;
    const apexOffset =
      THREE.MathUtils.clamp(curvAvg * 260, -1, 1) * Math.max(0, target.halfWidth - 1.6);
    const aimPoint = target.pos.clone().addScaledVector(target.normal, apexOffset);

    const toTarget = new THREE.Vector3().subVectors(aimPoint, vehicle.position);
    toTarget.y = 0;
    const fwd = vehicle.forward;
    const left = vehicle.left;
    // Positive angle means the target lies to the left.
    const angle = Math.atan2(toTarget.dot(left), toTarget.dot(fwd));
    const dist = Math.max(toTarget.length(), 1);

    // Positive lateral means the car is left of the centreline.
    const lateral = track.lateralOffset(vehicle.position, idx);
    maxLateral = Math.max(maxLateral, Math.abs(lateral));

    // Steering angle that would arc the car onto the target point, left-positive.
    const desiredDelta = Math.atan2(2 * car.wheelbase * Math.sin(angle), dist);
    // The physics limits lock with speed; normalise against the same curve.
    const maxSteer = Math.max(0.055, Math.min(0.58, 0.58 / (1 + speed * 0.045)));
    // DriveInput.steer is right-positive, so both terms flip sign here.
    // Only fight back towards the road once the car is running out of asphalt,
    // otherwise this would cancel out the racing line.
    const edge = track.at(idx).halfWidth * 0.85;
    const excess = Math.abs(lateral) > edge ? Math.sign(lateral) * (Math.abs(lateral) - edge) : 0;
    const recentre = THREE.MathUtils.clamp(excess * 0.14, -0.4, 0.4);
    const steer = THREE.MathUtils.clamp(-(desiredDelta / maxSteer) * 1.15 + recentre, -1, 1);

    // --- Corner speed, accounting for speed-dependent downforce --------
    // Lateral capacity is mu*g*(1 + k*v^2), so v^2/R = mu*g*(1 + k*v^2)
    // solves to v^2 = mu*g / (1/R - mu*g*k).
    let vMax = car.topSpeedKmh / 3.6;
    const mu = car.grip;
    const decel = mu * G * 0.9;
    // Scan as far as the worst-case braking distance from top speed (plus a
    // reserve) — a fixed 260 m is too short for the >300 km/h cars, which
    // then brake systematically late into slow corners.
    const horizonM = (vMax * vMax) / (2 * decel) + 40;
    const scanPoints = Math.round(horizonM / track.spacing);
    for (let k = 2; k < scanPoints; k++) {
      const p = track.at(idx + k);
      const curv = Math.abs(p.curvature);
      if (curv < 2e-4) continue;
      const denom = curv - mu * G * car.downforce;
      // A negative denominator means downforce alone can hold the corner flat.
      const corner = denom <= 1e-6 ? car.topSpeedKmh / 3.6 : Math.sqrt((mu * G) / denom);
      const distance = k * track.spacing;
      const entry = Math.sqrt(Math.max(0, corner * corner + 2 * decel * distance));
      vMax = Math.min(vMax, entry);
    }
    vMax = Math.max(vMax * 0.94, 11);
    // Rate-limit the target so a momentary lookahead jump cannot spike the throttle.
    vTarget += THREE.MathUtils.clamp(vMax - vTarget, -14 * dt, 9 * dt);

    const error = vTarget - speed;
    let throttle = THREE.MathUtils.clamp(error * 0.4, 0, 1);
    const brake = THREE.MathUtils.clamp(-error * 0.3, 0, 1);
    // Lift off only when genuinely sideways — a few degrees of body slip is
    // normal in a fast corner and must not cut the throttle.
    const slip = Math.abs(Math.atan2(vehicle.vLat, Math.max(speed, 1)));
    if (slip > 0.3) throttle *= Math.max(0.15, 1 - (slip - 0.3) * 3);

    const telemetry = vehicle.step(dt, { throttle, brake, steer, handbrake: false }, track);
    time += dt;
    topSpeed = Math.max(topSpeed, telemetry.speedKmh);
    // Count contact events, not 120 Hz frames — same debounce as Game.ts.
    if (telemetry.contact && !inContact) contacts++;
    inContact = telemetry.contact;
    if (telemetry.offTrack) offTrackTime += dt;

    // A human would press R; do the same so one bad corner does not skew the run.
    if (telemetry.speedKmh < 12) {
      stuckFor += dt;
      if (stuckFor > 3) {
        vehicle.placeOnTrack(track, vehicle.trackIndex, 0);
        vTarget = 0;
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

/** Start index of the longest near-zero-curvature run — the place for a drag test. */
function longestStraightIndex(track: Track): number {
  let bestStart = 0;
  let bestLen = 0;
  let runStart = 0;
  let runLen = 0;
  // Scan two laps so a straight crossing the start line is not cut in half.
  for (let i = 0; i < track.count * 2; i++) {
    if (Math.abs(track.at(i % track.count).curvature) < 3e-4) {
      if (runLen === 0) runStart = i;
      runLen++;
      if (runLen > bestLen) {
        bestLen = runLen;
        bestStart = runStart;
      }
    } else {
      runLen = 0;
    }
  }
  return bestStart % track.count;
}

/**
 * Straight-line 0–100 km/h: full throttle from a standing start on the longest
 * straight, so the fleet's zeroToHundred figures can be checked against the
 * model (the KONTEXT.md checkpoint).
 */
function measureZeroToHundred(carIndex: number, track: Track): number {
  const car = FLEET[carIndex];
  const vehicle = new Vehicle(car);
  vehicle.assists = true;
  vehicle.placeOnTrack(track, longestStraightIndex(track), 0);
  const dt = 1 / 120;
  let time = 0;
  while (time < 20) {
    const telemetry = vehicle.step(dt, { throttle: 1, brake: 0, steer: 0, handbrake: false }, track);
    time += dt;
    if (telemetry.speedKmh >= 100) return time;
  }
  return Infinity;
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

console.log('=== 0–100 km/h (full throttle, longest straight) ===');
for (let i = 0; i < FLEET.length; i++) {
  const car = FLEET[i];
  const t = measureZeroToHundred(i, track);
  const d = t - car.zeroToHundred;
  console.log(
    `${(car.brand + ' ' + car.model).padEnd(26)} sim ${t.toFixed(2).padStart(5)} s  ` +
      `Angabe ${car.zeroToHundred.toFixed(1).padStart(4)} s  Δ${((d >= 0 ? '+' : '') + d.toFixed(2)).padStart(6)} s`,
  );
}
console.log('');

console.log('=== Auto-driver lap times ===');
for (let i = 0; i < FLEET.length; i++) {
  const r = driveLap(i, true);
  const status = r.completed ? 'OK ' : 'DNF';
  const vsTarget = r.completed ? (r.time - r.target >= 0 ? '+' : '') + (r.time - r.target).toFixed(1) + 's' : '—';
  console.log(
    `${status} ${r.car.padEnd(26)} ${fmt(r.time).padStart(9)}  Ziel ${fmt(r.target).padStart(9)}  Δ${vsTarget.padStart(8)}  ` +
      `vmax ${r.topSpeed.toFixed(0).padStart(3)} km/h  Kontakte ${String(r.contacts).padStart(3)}  ` +
      `off ${r.offTrackPct.toFixed(1)}%`,
  );
}
