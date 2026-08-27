import * as THREE from 'three';

/**
 * What the tyres leave behind: rubber on tarmac, churned earth off it.
 *
 * The buffer draws what it is told to draw; *when* to mark is decided in
 * `Game.layRubber`, because that is where the surface, the drivetrain and the
 * throttle are known. Worth stating the difference from the tyre squeal, since
 * both read the same grip number: the squeal starts at 84 % of grip, because a
 * tyre howls while it is still gripping and letting go. Marking starts past
 * 100 %, because that is where it stops gripping and starts abrading. Tying
 * the two together put a black line down every corner taken properly.
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
/** Tyre width on the road. */
const HALF_WIDTH = 0.11;
/** Above the tarmac, metres. Enough to clear it, small enough not to float. */
const LIFT = 0.02;

/** What the tyre is marking, which decides what colour it leaves. */
export type MarkKind = 'rubber' | 'dirt';

export interface SkidMarks {
  mesh: THREE.Mesh;
  /**
   * @param wheels   ground positions of the wheels, in world space
   * @param strength 0-1 per wheel; 0 leaves nothing and breaks that trail
   * @param kind     black rubber on tarmac, pale dust off it
   */
  update(wheels: THREE.Vector3[], strength: number[], kind: MarkKind): void;
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
  const push = (from: THREE.Vector3, to: THREE.Vector3, strength: number, kind: MarkKind): void => {
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

    // Warm black for rubber — fresh rubber on grey tarmac is never a pure
    // black — and pale Eifel earth for everything churned up off the circuit.
    const rubber = kind === 'rubber';
    const cr = rubber ? 0.055 : 0.3;
    const cg = rubber ? 0.048 : 0.245;
    const cb = rubber ? 0.045 : 0.18;
    const alpha = (rubber ? 0.25 : 0.32) + strength * 0.55;
    for (let n = 0; n < 6; n++) {
      const c = (i + n) * 4;
      colors[c] = cr;
      colors[c + 1] = cg;
      colors[c + 2] = cb;
      colors[c + 3] = alpha;
    }

    head = (head + 1) % MAX_SEGMENTS;
    used = Math.min(used + 1, MAX_SEGMENTS);
  };

  return {
    mesh,
    update(wheels, strength, kind) {
      let wrote = false;
      for (let i = 0; i < wheels.length; i++) {
        const s = strength[i] ?? 0;
        if (s <= 0) {
          // Break this wheel's trail, or the next mark would be joined to the
          // last one by a single quad stretched across everything between.
          lastAt[i] = null;
          continue;
        }
        const now = wheels[i];
        const prev = lastAt[i];
        if (!prev) {
          lastAt[i] = now.clone();
          continue;
        }
        if (prev.distanceToSquared(now) < STEP * STEP) continue;
        a.copy(prev);
        b.copy(now);
        push(a, b, s, kind);
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
