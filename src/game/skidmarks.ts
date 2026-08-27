import * as THREE from 'three';

/**
 * Rubber left on the road where the tyres let go.
 *
 * Driven by exactly the same grip-usage number as the tyre squeal, so what you
 * see and what you hear can never disagree: if it howls, it marks.
 *
 * Built as one pre-allocated ring buffer rather than a mesh per mark. A lap is
 * twenty kilometres and a slide can last hundreds of metres, so anything that
 * allocates per segment would spend the whole lap in the garbage collector.
 * Nothing here allocates after construction: the geometry is written in place
 * and the draw range grows until it wraps.
 */

/** Segments in the ring. Each is one quad under one wheel. */
const MAX_SEGMENTS = 2200;
/** How far a wheel travels before it lays down another segment, metres. */
const STEP = 0.55;
/** Grip usage at which rubber starts coming off. Matches the squeal's floor. */
const MARK_FROM = 0.9;
/** Below this there is no slide worth drawing, km/h. */
const MIN_SPEED = 12;
/** Tyre width on the road. */
const HALF_WIDTH = 0.11;
/** Above the tarmac, metres. Enough to clear it, small enough not to float. */
const LIFT = 0.02;

export interface SkidMarks {
  mesh: THREE.Mesh;
  /**
   * @param wheels  ground positions of the wheels, in world space
   * @param heading unit vector the car is travelling along
   * @param grip    tyre grip usage; 1 is the limit
   * @param speedKmh road speed
   */
  update(wheels: THREE.Vector3[], heading: THREE.Vector3, grip: number, speedKmh: number): void;
  /** Wipes every mark — a new lap starts on a clean road. */
  clear(): void;
  dispose(): void;
}

export function buildSkidMarks(): SkidMarks {
  const geometry = new THREE.BufferGeometry();
  // Non-indexed: two triangles per segment, six vertices, written in place.
  const positions = new Float32Array(MAX_SEGMENTS * 6 * 3);
  const colors = new Float32Array(MAX_SEGMENTS * 6 * 4);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  geometry.setDrawRange(0, 0);

  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    // The marks lie on the road surface; without the offset they z-fight with
    // it at distance, which flickers far more than the marks are worth.
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;

  let head = 0;
  let used = 0;
  /** Where each wheel last laid rubber; null until it first does. */
  const lastAt: (THREE.Vector3 | null)[] = [];

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const side = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  /** Writes one quad from `from` to `to`, `strength` deep. */
  const push = (from: THREE.Vector3, to: THREE.Vector3, strength: number): void => {
    side.subVectors(to, from);
    if (side.lengthSq() < 1e-6) return;
    side.normalize().cross(up).multiplyScalar(HALF_WIDTH);

    const i = head * 6;
    const p = positions;
    const corner = (n: number, base: THREE.Vector3, sign: number) => {
      p[(i + n) * 3] = base.x + side.x * sign;
      p[(i + n) * 3 + 1] = base.y + LIFT;
      p[(i + n) * 3 + 2] = base.z + side.z * sign;
    };
    // from-left, from-right, to-right | from-left, to-right, to-left
    corner(0, from, -1);
    corner(1, from, 1);
    corner(2, to, 1);
    corner(3, from, -1);
    corner(4, to, 1);
    corner(5, to, -1);

    const alpha = 0.25 + strength * 0.55;
    for (let n = 0; n < 6; n++) {
      const c = (i + n) * 4;
      // Warm black: fresh rubber on grey tarmac is never a pure black.
      colors[c] = 0.055;
      colors[c + 1] = 0.048;
      colors[c + 2] = 0.045;
      colors[c + 3] = alpha;
    }

    head = (head + 1) % MAX_SEGMENTS;
    used = Math.min(used + 1, MAX_SEGMENTS);
  };

  return {
    mesh,
    update(wheels, heading, grip, speedKmh) {
      void heading;
      const strength = Math.min(1, Math.max(0, (grip - MARK_FROM) / 0.3));
      if (strength <= 0 || speedKmh < MIN_SPEED) {
        // Break the trail, or the next slide would be joined to this one by a
        // single quad stretched across everything in between.
        for (let i = 0; i < lastAt.length; i++) lastAt[i] = null;
        return;
      }

      let wrote = false;
      for (let i = 0; i < wheels.length; i++) {
        const now = wheels[i];
        const prev = lastAt[i];
        if (!prev) {
          lastAt[i] = now.clone();
          continue;
        }
        if (prev.distanceToSquared(now) < STEP * STEP) continue;
        a.copy(prev);
        b.copy(now);
        push(a, b, strength);
        prev.copy(now);
        wrote = true;
      }

      if (wrote) {
        geometry.attributes.position.needsUpdate = true;
        geometry.attributes.color.needsUpdate = true;
        geometry.setDrawRange(0, used * 6);
      }
    },
    clear() {
      head = 0;
      used = 0;
      for (let i = 0; i < lastAt.length; i++) lastAt[i] = null;
      geometry.setDrawRange(0, 0);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
