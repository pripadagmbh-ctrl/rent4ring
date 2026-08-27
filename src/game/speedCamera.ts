import * as THREE from 'three';

export interface SpeedCamera {
  group: THREE.Group;
  /** Fires the flash; call once when it catches someone. */
  trigger(): void;
  /** Fades the flash out again. */
  update(dt: number): void;
  dispose(): void;
}

/**
 * A Starenkasten, of the sort that stands on every German village road: a
 * grey anthracite box on a post, lens and flash unit facing the traffic, and
 * a 50 sign a little way before it in case anyone claims they did not know.
 *
 * Local frame matches everything else — +z is the direction of travel, ground
 * at y = 0 — so it can be dropped onto the approach with the road's heading.
 */
export function buildSpeedCamera(): SpeedCamera {
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };

  const group = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D = group) => {
    const mesh = new THREE.Mesh(keep(geo), mat);
    parent.add(mesh);
    return mesh;
  };

  const housing = keep(new THREE.MeshStandardMaterial({ color: 0x53585e, roughness: 0.7, metalness: 0.3 }));
  const dark = keep(new THREE.MeshStandardMaterial({ color: 0x15181c, roughness: 0.5 }));
  const post = keep(new THREE.MeshStandardMaterial({ color: 0x6e737a, roughness: 0.6, metalness: 0.4 }));
  const white = keep(new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.8 }));
  const red = keep(new THREE.MeshStandardMaterial({ color: 0xc4121f, roughness: 0.7 }));
  // Basic, so the flash can be driven straight off its colour.
  const flashMat = keep(new THREE.MeshBasicMaterial({ color: 0x2a2622 }));

  // ------------------------------------------------------------- the box
  const mast = add(new THREE.CylinderGeometry(0.09, 0.11, 2.5, 10), post);
  mast.position.set(0, 1.25, 0);
  const base = add(new THREE.CylinderGeometry(0.2, 0.24, 0.18, 10), post);
  base.position.set(0, 0.09, 0);

  const box = add(new THREE.BoxGeometry(0.62, 1.35, 0.5), housing);
  box.position.set(0, 3.05, 0);
  const lidTop = add(new THREE.BoxGeometry(0.68, 0.09, 0.56), dark);
  lidTop.position.set(0, 3.77, 0);

  // Lens and flash, both facing back down the road at oncoming traffic.
  const lensRing = add(new THREE.CylinderGeometry(0.13, 0.13, 0.09, 14), dark);
  lensRing.position.set(0, 3.3, -0.28);
  lensRing.rotation.x = Math.PI / 2;
  const glass = add(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 14), keep(
    new THREE.MeshStandardMaterial({ color: 0x1b2a33, roughness: 0.1, metalness: 0.6 }),
  ));
  glass.position.set(0, 3.3, -0.33);
  glass.rotation.x = Math.PI / 2;

  const flash = add(new THREE.BoxGeometry(0.34, 0.22, 0.06), flashMat);
  flash.position.set(0, 2.82, -0.29);

  // The obligatory stripes.
  for (const y of [2.5, 2.62]) {
    const band = add(new THREE.BoxGeometry(0.64, 0.06, 0.52), y === 2.5 ? white : red);
    band.position.set(0, y, 0);
  }

  // --------------------------------------------------------- the 50 sign
  const signPost = add(new THREE.CylinderGeometry(0.045, 0.045, 2.2, 8), post);
  signPost.position.set(0, 1.1, 9);
  const disc = add(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 20), white);
  disc.position.set(0, 2.3, 8.94);
  disc.rotation.x = Math.PI / 2;
  const ring = add(new THREE.TorusGeometry(0.38, 0.07, 8, 24), red);
  ring.position.set(0, 2.3, 8.9);
  // "50", as two bars — legible at the distance you actually read it from.
  for (const [dx, w] of [
    [-0.11, 0.13],
    [0.11, 0.13],
  ]) {
    const digit = add(new THREE.BoxGeometry(w, 0.34, 0.03), dark);
    digit.position.set(dx, 2.3, 8.87);
  }

  // A point light, off until it goes off.
  const burst = new THREE.PointLight(0xffffff, 0, 26, 2);
  burst.position.set(0, 2.9, -0.6);
  group.add(burst);

  let flashFor = 0;

  return {
    group,
    trigger() {
      flashFor = FLASH_SECONDS;
    },
    update(dt: number) {
      if (flashFor <= 0) return;
      flashFor = Math.max(0, flashFor - dt);
      const k = flashFor / FLASH_SECONDS;
      // Sharp spike, quick decay — a real one is over before you see it.
      const strength = k * k;
      burst.intensity = strength * 90;
      flashMat.color.setRGB(
        0.16 + strength * 0.84,
        0.15 + strength * 0.85,
        0.13 + strength * 0.87,
      );
    },
    dispose() {
      for (const d of disposables) d.dispose();
      disposables.length = 0;
    },
  };
}

const FLASH_SECONDS = 0.45;
