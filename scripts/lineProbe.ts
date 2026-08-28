import { Track } from '../src/game/track';
import { FLEET } from '../src/data/fleet';
import { buildRacingLine } from './racingLine';

/**
 * Is the racing line a racing line?
 *
 * Throwaway diagnostic, kept because the answer was no the first time and the
 * next person to touch `racingLine.ts` will want the same numbers.
 */
const track = new Track();
const car = FLEET[5];
const line = buildRacingLine(track, car);
const n = track.count;

let pinned = 0;
let offSum = 0;
let maxOff = 0;
let widthMin = Infinity;
for (let i = 0; i < n; i++) {
  const w = track.at(i).halfWidth;
  widthMin = Math.min(widthMin, w);
  const o = line.offset[i];
  offSum += Math.abs(o);
  maxOff = Math.max(maxOff, Math.abs(o));
  if (Math.abs(o) > w - 0.95) pinned++;
}

// How far the line moves between neighbours — a smooth line moves a little,
// a zigzag moves a lot.
let jumpMax = 0;
let jumpSum = 0;
for (let i = 0; i < n; i++) {
  const d = Math.abs(line.offset[(i + 1) % n] - line.offset[i]);
  jumpMax = Math.max(jumpMax, d);
  jumpSum += d;
}

const speeds = line.speed.map((v) => v * 3.6);
const sorted = [...speeds].sort((a, b) => a - b);

console.log('Punkte              :', n, '· Spurbreite min', widthMin.toFixed(2), 'm');
console.log('Versatz  mittel/max :', (offSum / n).toFixed(2), '/', maxOff.toFixed(2), 'm');
console.log('am Rand geklebt     :', ((pinned / n) * 100).toFixed(1), '%');
console.log('Sprung   mittel/max :', (jumpSum / n).toFixed(3), '/', jumpMax.toFixed(3), 'm pro Punkt');
console.log(
  'Tempo min/med/max   :',
  sorted[0].toFixed(0),
  '/',
  sorted[Math.floor(n / 2)].toFixed(0),
  '/',
  sorted[n - 1].toFixed(0),
  'km/h',
);
console.log('unter 60 km/h       :', speeds.filter((v) => v < 60).length, 'Punkte');
console.log('ueber 250 km/h      :', speeds.filter((v) => v > 250).length, 'Punkte');

// Where the tightest corners are, so the numbers can be sanity-checked
// against a place with a name.
const slow = speeds
  .map((v, i) => ({ v, i }))
  .sort((a, b) => a.v - b.v)
  .slice(0, 6);
console.log('\nlangsamste Stellen:');
for (const s of slow) {
  console.log(
    '  ',
    track.sectionNameAt(s.i).padEnd(26),
    s.v.toFixed(0).padStart(3),
    'km/h  Versatz',
    line.offset[s.i].toFixed(2),
  );
}
