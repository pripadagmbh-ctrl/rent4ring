import * as THREE from 'three';
import type { RoadPath } from './track';
import { buildTanju } from './crowd';

/**
 * Tanju, riding escort behind Herr Müller.
 *
 * He only comes out when Herr Müller is on the Panigale — the point of him is
 * that a man of fifty-eight is not out here alone on a superbike, and a friend
 * riding behind is what that looks like. He sits back far enough not to be in
 * the way, and comes past and stops ahead the moment anything goes wrong. That
 * is what the second bike is *for*: nobody rides sweep so they can enjoy the
 * view.
 *
 * Placed along the road rather than driven by physics, for the same reason the
 * patrol car is: he has to follow the same curve and be in the right place at
 * the right moment, and a second driving model would only find new ways to end
 * up in a hedge.
 */
export interface Escort {
  group: THREE.Group;
  /**
   * @param road      the path both of them are on
   * @param leadIndex where Herr Müller is along it
   * @param leadSpeed his speed, m/s
   * @param needsHelp true while he is off the bike or stopped
   */
  update(dt: number, road: RoadPath, leadIndex: number, leadSpeed: number, needsHelp: boolean): void;
  dispose(): void;
}

/** How far back he rides when everything is fine, metres. */
const SWEEP_BEHIND_M = 22;
/** Where he stops when it is not: ahead, and off to the side. */
const HELP_AHEAD_M = 9;
const HELP_ASIDE_M = 2.4;
/** How fast his position slides between those two, metres per second. */
const MOVE_MS = 26;

export function buildEscort(): Escort {
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };

  const group = new THREE.Group();
  const tanju = buildTanju(keep);
  group.add(tanju.group);
  // He is riding, not standing in a yard: no waving.
  tanju.arm.rotation.z = 0;

  /**
   * Where he wants to be, as metres along the road relative to Herr Müller.
   * Negative is behind. Eased rather than snapped, so overtaking to help reads
   * as a rider coming past rather than as a jump cut.
   */
  let along = -SWEEP_BEHIND_M;
  let aside = 0;
  let lean = 0;

  return {
    group,
    update(dt, road, leadIndex, leadSpeed, needsHelp) {
      const wantAlong = needsHelp ? HELP_AHEAD_M : -SWEEP_BEHIND_M;
      const wantAside = needsHelp ? HELP_ASIDE_M : 0;
      const step = MOVE_MS * dt;
      along += THREE.MathUtils.clamp(wantAlong - along, -step, step);
      aside += THREE.MathUtils.clamp(wantAside - aside, -step * 0.2, step * 0.2);

      const idx = leadIndex + along / road.spacing;
      const p = road.at(idx);
      group.position.copy(p.pos).addScaledVector(p.normal, aside);
      group.rotation.y = Math.atan2(p.tangent.x, p.tangent.z);

      // He leans where the road bends, which is the only thing that makes a
      // motorcycle following a curve look like a motorcycle at all.
      const ahead = road.at(idx + 4);
      const turn = Math.atan2(ahead.tangent.x, ahead.tangent.z) - group.rotation.y;
      const wrapped = Math.atan2(Math.sin(turn), Math.cos(turn));
      const wantLean = THREE.MathUtils.clamp(wrapped * Math.min(1, leadSpeed / 30) * 2.4, -0.5, 0.5);
      lean += (wantLean - lean) * Math.min(1, dt * 4);
      group.rotation.z = lean;
    },
    dispose() {
      for (const d of disposables) d.dispose();
      disposables.length = 0;
    },
  };
}
