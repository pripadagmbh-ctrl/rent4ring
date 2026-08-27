import * as THREE from 'three';
import { logoTexture } from './world';

export interface TowTruck {
  group: THREE.Group;
  /** Hub pivots, so the wheels can be spun as it drives. */
  wheels: THREE.Object3D[];
  /** Where a towed car hangs, in truck-local coordinates. */
  hookPoint: THREE.Vector3;
  /** Drives the amber beacons; call every frame with elapsed seconds. */
  update(t: number): void;
  dispose(): void;
}

const WHEEL_R = 0.45;

/**
 * The Rent4Ring recovery truck: a flatbed with a winch and two amber
 * beacons, in the firm's own red with the wordmark on the door.
 *
 * Same conventions as the cars — +z forward, ground at y = 0, wheels as
 * pivot/spin pairs — so the code that moves a car along the circuit moves
 * this too, and the wreck can simply be parented behind it on the hook.
 */
export function buildTowTruck(): TowTruck {
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };

  const group = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh => {
    const mesh = new THREE.Mesh(keep(geo), mat);
    group.add(mesh);
    return mesh;
  };

  const red = keep(
    new THREE.MeshStandardMaterial({ color: 0xc4121f, roughness: 0.36, metalness: 0.4 }),
  );
  const dark = keep(new THREE.MeshStandardMaterial({ color: 0x1a1d21, roughness: 0.6 }));
  const steel = keep(
    new THREE.MeshStandardMaterial({ color: 0x9aa0a7, roughness: 0.34, metalness: 0.85 }),
  );
  const deckMat = keep(new THREE.MeshStandardMaterial({ color: 0x6a6f75, roughness: 0.88 }));
  const glass = keep(
    new THREE.MeshStandardMaterial({ color: 0x141a20, roughness: 0.12, metalness: 0.5 }),
  );
  const amberOn = keep(new THREE.MeshBasicMaterial({ color: 0xffb020 }));
  const amberOff = keep(new THREE.MeshBasicMaterial({ color: 0x4a3208 }));

  // ------------------------------------------------------------- chassis
  const rails = add(new THREE.BoxGeometry(2.0, 0.26, 6.2), dark);
  rails.position.set(0, 0.72, -0.2);

  // ------------------------------------------------------------- the cab
  const cab = add(new THREE.BoxGeometry(2.2, 1.45, 2.0), red);
  cab.position.set(0, 1.62, 1.95);
  const roof = add(new THREE.BoxGeometry(2.24, 0.1, 2.04), red);
  roof.position.set(0, 2.36, 1.95);
  // Windscreen and door glass, raked back.
  const screen = add(new THREE.BoxGeometry(2.0, 0.78, 0.08), glass);
  screen.position.set(0, 1.9, 2.9);
  screen.rotation.x = -0.22;
  for (const s of [-1, 1]) {
    const side = add(new THREE.BoxGeometry(0.08, 0.62, 1.5), glass);
    side.position.set(s * 1.09, 1.86, 1.9);
  }
  // Nose, bumper and lights.
  const nose = add(new THREE.BoxGeometry(2.2, 0.9, 0.5), red);
  nose.position.set(0, 1.1, 3.1);
  const bumper = add(new THREE.BoxGeometry(2.3, 0.32, 0.34), steel);
  bumper.position.set(0, 0.66, 3.2);
  for (const s of [-1, 1]) {
    const lamp = add(new THREE.BoxGeometry(0.42, 0.24, 0.1), keep(
      new THREE.MeshBasicMaterial({ color: 0xf2f0e6 }),
    ));
    lamp.position.set(s * 0.78, 1.16, 3.34);
  }

  // Wordmark on both doors.
  const doorTex = keep(logoTexture(null));
  const doorMat = keep(new THREE.MeshBasicMaterial({ map: doorTex, transparent: true }));
  for (const s of [-1, 1]) {
    const badge = add(new THREE.PlaneGeometry(1.15, 0.4), doorMat);
    badge.position.set(s * 1.115, 1.44, 1.85);
    badge.rotation.y = (s * Math.PI) / 2;
  }

  // ------------------------------------------------------------- the bed
  const deck = add(new THREE.BoxGeometry(2.3, 0.14, 3.7), deckMat);
  deck.position.set(0, 0.92, -1.3);
  for (const s of [-1, 1]) {
    const rail = add(new THREE.BoxGeometry(0.1, 0.24, 3.7), red);
    rail.position.set(s * 1.1, 1.09, -1.3);
  }
  // Headboard between the deck and the cab, with the winch on it.
  const headboard = add(new THREE.BoxGeometry(2.3, 1.0, 0.14), red);
  headboard.position.set(0, 1.45, 0.62);
  const drum = add(new THREE.CylinderGeometry(0.17, 0.17, 0.7, 14), steel);
  drum.position.set(0, 1.3, 0.42);
  drum.rotation.z = Math.PI / 2;
  // Cable running back down the deck to the hook.
  const cable = add(new THREE.CylinderGeometry(0.022, 0.022, 2.6, 6), dark);
  cable.position.set(0, 1.06, -0.75);
  cable.rotation.x = Math.PI / 2 - 0.08;
  const hook = add(new THREE.BoxGeometry(0.16, 0.2, 0.12), steel);
  hook.position.set(0, 0.86, -2.1);

  // Amber beacons on the cab roof.
  const beacons: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const bar = add(new THREE.BoxGeometry(0.44, 0.16, 0.24), amberOff);
    bar.position.set(s * 0.72, 2.49, 1.95);
    beacons.push(bar);
  }

  // ------------------------------------------------------------- wheels
  const wheels: THREE.Object3D[] = [];
  const tyreGeo = keep(new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.3, 20));
  const rimGeo = keep(new THREE.CylinderGeometry(0.24, 0.24, 0.32, 12));
  for (const z of [1.95, -1.5, -2.35]) {
    for (const s of [-1, 1]) {
      const pivot = new THREE.Object3D();
      pivot.position.set(s * 0.9, WHEEL_R, z);
      const spin = new THREE.Object3D();
      const tyre = new THREE.Mesh(tyreGeo, dark);
      tyre.rotation.z = Math.PI / 2;
      const rim = new THREE.Mesh(rimGeo, steel);
      rim.rotation.z = Math.PI / 2;
      spin.add(tyre, rim);
      pivot.add(spin);
      group.add(pivot);
      wheels.push(spin);
    }
  }

  return {
    group,
    wheels,
    // Behind the deck and low down, where a rope would actually reach.
    hookPoint: new THREE.Vector3(0, 0.35, -3.4),
    update(t: number) {
      // Alternating amber, the way a real light bar runs.
      const phase = Math.floor(t * 4) % 2;
      beacons[0].material = phase === 0 ? amberOn : amberOff;
      beacons[1].material = phase === 0 ? amberOff : amberOn;
    },
    dispose() {
      for (const d of disposables) d.dispose();
      disposables.length = 0;
    },
  };
}
