/**
 * Edge-case checks for the vehicle model — the cases a lap simulation never
 * exercises: reverse, hill hold, frame drops, and a no-assists sanity pass.
 *
 *   npx vite build --ssr scripts/physics-checks.ts --outDir scripts/dist
 *   node scripts/dist/physics-checks.js
 *
 * Exits non-zero on the first failed check.
 */
import { Approach, Track } from '../src/game/track';
import { Vehicle } from '../src/game/physics';
import { FLEET } from '../src/data/fleet';

let failures = 0;

function check(name: string, ok: boolean, detail: string): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(38)} ${detail}`);
  if (!ok) failures++;
}

const dt = 1 / 120;
const zero = { throttle: 0, brake: 0, steer: 0, handbrake: false };

// ---------------------------------------------------------------- reverse
{
  const road = new Approach();
  const v = new Vehicle(FLEET[5]);
  v.placeOnTrack(road, 0, 0);
  for (let s = 0; s < 120 * 3; s++) v.step(dt, { ...zero, brake: 1 }, road);
  const reversed = v.vLong;
  for (let s = 0; s < 120 * 2; s++) v.step(dt, { ...zero, throttle: 1 }, road);
  check('reverse engages on held brake', reversed < -4, `vLong ${reversed.toFixed(2)} m/s`);
  check('reverse exits into forward drive', v.vLong > 3, `vLong ${v.vLong.toFixed(2)} m/s`);
}

// -------------------------------------------------------------- hill hold
{
  const track = new Track();
  // Steilstrecke — the steepest sustained climb on the ring.
  let steepest = 0;
  let steepIdx = 0;
  for (let i = 0; i < track.count; i++) {
    const g = track.at(i).tangent.y;
    if (g > steepest) {
      steepest = g;
      steepIdx = i;
    }
  }
  const v = new Vehicle(FLEET[0]);
  v.placeOnTrack(track, steepIdx, 0);
  for (let s = 0; s < 120 * 3; s++) v.step(dt, { ...zero, brake: 0.4 }, track);
  check(
    `hill hold at ${(steepest * 100).toFixed(0)}% grade, 40% brake`,
    Math.abs(v.vLong) < 0.3,
    `vLong ${v.vLong.toFixed(3)} m/s`,
  );
}

// -------------------------------------------------- frame-drop robustness
{
  const track = new Track();
  const v = new Vehicle(FLEET[6]);
  v.placeOnTrack(track, 0, 0);
  let finite = true;
  // 20 fps worth of steps with aggressive inputs.
  for (let s = 0; s < 20 * 30; s++) {
    const steer = Math.sin(s / 9) * 0.8;
    v.step(0.05, { throttle: 1, brake: 0, steer, handbrake: s % 40 === 0 }, track);
    if (!Number.isFinite(v.vLong) || !Number.isFinite(v.vLat) || !Number.isFinite(v.yaw)) {
      finite = false;
      break;
    }
  }
  check('20 fps frame-drop stays finite', finite, finite ? 'all states finite' : 'NaN/Infinity');
}

// ------------------------------------------------------ no-assists sanity
{
  const track = new Track();
  const v = new Vehicle(FLEET[5]);
  v.assists = false;
  v.placeOnTrack(track, 200, 0);
  let finite = true;
  for (let s = 0; s < 120 * 20; s++) {
    v.step(dt, { throttle: 0.8, brake: 0, steer: 0.3, handbrake: false }, track);
    if (!Number.isFinite(v.vLong) || !Number.isFinite(v.vLat)) {
      finite = false;
      break;
    }
  }
  check('no-assists hard cornering stays finite', finite, finite ? 'bounded' : 'diverged');
}

console.log(failures === 0 ? '\nAll physics checks passed.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
