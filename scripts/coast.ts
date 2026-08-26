import { Approach } from '../src/game/track';
import { Vehicle } from '../src/game/physics';
import { FLEET } from '../src/data/fleet';

const road = new Approach();
const dt = 1 / 120;
const v = new Vehicle(FLEET[5]);
v.placeOnTrack(road, 0, 0);
console.log(' t | vLong | idx | lat | offTrack | contact | gear');
for (let s = 0; s <= 120 * 8; s++) {
  const t = v.step(dt, { throttle: 1, brake: 0, steer: 0, handbrake: false }, road);
  if (s % 60 === 0) {
    console.log(
      `${(s / 120).toFixed(1).padStart(4)} | ${v.vLong.toFixed(2).padStart(6)} | ${String(v.trackIndex).padStart(3)} | ` +
        `${road.lateralOffset(v.position, v.trackIndex).toFixed(2).padStart(6)} | ${String(t.offTrack).padStart(5)} | ${String(t.contact).padStart(5)} | ${t.gear}`,
    );
  }
}
