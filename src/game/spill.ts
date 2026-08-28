import * as THREE from 'three';

/**
 * Herr Müller parting company with the Panigale, and getting back on it.
 *
 * A fall is the one thing the bike cannot animate from the inside: the rider
 * has to leave it, land somewhere else, stand up on his own and walk back. So
 * he is lifted out of the bike's group into the world, flown along a ballistic
 * arc, and put back afterwards — the same object throughout, so the leathers,
 * the fur at the cuffs and the open-face lid all come along without being
 * rebuilt.
 *
 * The stages are deliberately slow. A fall that is over in half a second reads
 * as a glitch; the beat where he sits in the gravel doing nothing is what
 * makes it read as a man who has just come off a motorcycle.
 */

export type SpillStage = 'flight' | 'down' | 'rising' | 'shaking' | 'remount' | 'done';

interface Beat {
  stage: SpillStage;
  /** Seconds this stage lasts. */
  seconds: number;
}

const BEATS: Beat[] = [
  { stage: 'flight', seconds: 1.1 },
  { stage: 'down', seconds: 0.9 },
  { stage: 'rising', seconds: 0.8 },
  { stage: 'shaking', seconds: 1.0 },
  { stage: 'remount', seconds: 1.0 },
];

export const SPILL_SECONDS = BEATS.reduce((n, b) => n + b.seconds, 0);

/** Gravity for the flight arc. Not 9.81 — a real arc looks floaty on screen. */
const G = 15;
/**
 * The rider is a *group* whose origin sits on the ground and whose parts are
 * built above it — his boots are at local y 0.43. So the group origin is
 * already at road level while he is sitting on the bike, and a naive "has he
 * reached the ground yet" test says yes on the first frame and skips the whole
 * flight. Measured, not assumed: that is exactly what happened.
 */
const FEET = 0.43;

export interface Spill {
  /** Where he is in the sequence right now. */
  readonly stage: SpillStage;
  readonly done: boolean;
  /**
   * Advances the fall; returns false once it has finished.
   *
   * @param bikeAt where the bike is now, so he can walk back to where it
   *               actually slid to rather than to where it went down
   */
  update(dt: number, bikeAt: THREE.Vector3): boolean;
  /** Puts him back in the saddle and restores what was borrowed. */
  finish(): void;
}

/**
 * @param rider  the rider object, currently a child of the bike
 * @param world  the scene he is thrown into
 * @param origin where the bike was when it went down
 * @param launch direction and speed he leaves at, m/s
 */
export function startSpill(
  rider: THREE.Object3D,
  world: THREE.Object3D,
  origin: THREE.Vector3,
  launch: THREE.Vector3,
): Spill {
  const home = rider.parent;
  const homePos = rider.position.clone();
  const homeRot = rider.rotation.clone();

  // Into world space, keeping the pose he was in a moment ago.
  const startPos = new THREE.Vector3();
  rider.getWorldPosition(startPos);
  world.add(rider);
  rider.position.copy(startPos);

  const vel = launch.clone();
  // Where his group origin has to sit for his boots to be on the road.
  const groundY = origin.y - FEET;
  // Tumble axis, picked from the launch so he rotates the way he is travelling.
  const tumble = new THREE.Vector3(-vel.z, 0, vel.x).normalize();
  const restRot = new THREE.Euler();

  let elapsed = 0;
  let beat = 0;
  let landed = false;
  // Seeded with where he started, so a flight that somehow never touches down
  // still has a sane place to walk back from rather than the world origin.
  const landedAt = startPos.clone();

  const stageAt = (t: number): { stage: SpillStage; local: number } => {
    let acc = 0;
    for (const b of BEATS) {
      if (t < acc + b.seconds) return { stage: b.stage, local: (t - acc) / b.seconds };
      acc += b.seconds;
    }
    return { stage: 'done', local: 1 };
  };

  const spill: Spill = {
    stage: 'flight',
    done: false,
    update(dt: number, bikeAt: THREE.Vector3): boolean {
      elapsed += dt;
      const { stage, local } = stageAt(elapsed);
      (spill as { stage: SpillStage }).stage = stage;
      beat = local;

      if (stage === 'flight') {
        vel.y -= G * dt;
        rider.position.addScaledVector(vel, dt);
        // Tumbling, and faster while he is still going up.
        rider.rotateOnAxis(tumble, dt * 7 * (0.5 + Math.max(0, vel.y) * 0.08));
        if (rider.position.y <= groundY) {
          rider.position.y = groundY;
          if (!landed) {
            landed = true;
            // Face down in the gravel, which is where a tumble ends.
            rider.rotation.set(-Math.PI / 2.1, rider.rotation.y, 0);
          }
          // Skidding to a stop rather than sticking on contact.
          vel.set(vel.x * 0.86, 0, vel.z * 0.86);
          rider.position.addScaledVector(vel, dt);
          landedAt.copy(rider.position);
        }
        return true;
      }

      if (stage === 'down') {
        // He lies there. One small twitch, so it does not look like a freeze.
        rider.rotation.z = Math.sin(beat * Math.PI) * 0.08;
        return true;
      }

      if (stage === 'rising') {
        // Up onto his feet, easing out so the last part is slow and creaky.
        // No height change: lying and standing are the same rigid group at the
        // same origin, only rotated, so lifting it here would float him.
        const e = 1 - (1 - beat) * (1 - beat);
        rider.rotation.x = (-Math.PI / 2.1) * (1 - e);
        rider.rotation.z = 0;
        rider.position.y = groundY;
        return true;
      }

      if (stage === 'shaking') {
        // The shake: fast, small, and it dies away. He bounces a little on his
        // heels doing it, which is the only reason the height moves at all.
        const fade = 1 - beat;
        rider.rotation.y = restRot.y + Math.sin(beat * 46) * 0.28 * fade;
        rider.rotation.z = Math.sin(beat * 39 + 1) * 0.09 * fade;
        rider.position.y = groundY + Math.abs(Math.sin(beat * 23)) * 0.04 * fade;
        return true;
      }

      if (stage === 'remount') {
        // Walks back to wherever the bike has slid to and swings a leg over.
        // Eased both ends: he is not sprinting, and he is not young.
        const e = beat * beat * (3 - 2 * beat);
        rider.position.lerpVectors(landedAt, bikeAt, e);
        // Up from the road into the saddle over the last part of the walk.
        rider.position.y = groundY + e * FEET;
        rider.rotation.set(0, restRot.y * (1 - e), 0);
        return true;
      }

      (spill as { done: boolean }).done = true;
      return false;
    },
    finish(): void {
      // Back into the bike's group, in exactly the pose he left it in.
      if (home) home.add(rider);
      rider.position.copy(homePos);
      rider.rotation.copy(homeRot);
      (spill as { done: boolean }).done = true;
      (spill as { stage: SpillStage }).stage = 'done';
    },
  };

  return spill;
}
