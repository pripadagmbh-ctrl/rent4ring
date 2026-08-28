import * as THREE from 'three';
import type { TowTruck } from './towTruck';

/**
 * The ambulance that comes for Herr Müller when he has finally hurt himself
 * properly on his own motorcycle.
 *
 * Returns the same shape as the recovery truck on purpose: the retirement
 * sequence already knows how to drive one of these up the circuit, spin its
 * wheels and flash its lights, and none of that cares whether the thing it is
 * driving carries a wreck or a man. Only the mesh and the colour of the lights
 * are different, so only the mesh and the lights are written twice.
 *
 * A German Rettungswagen, so: white box body, the red-orange stripe down the
 * flank, blue lights rather than amber.
 */
const WHEEL_R = 0.42;

export function buildAmbulance(): TowTruck {
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

  const white = keep(
    new THREE.MeshStandardMaterial({ color: 0xf2f1ed, roughness: 0.42, metalness: 0.15 }),
  );
  // The warning stripe on German emergency vehicles: red-orange, not red.
  const stripe = keep(new THREE.MeshStandardMaterial({ color: 0xd4341c, roughness: 0.5 }));
  const dark = keep(new THREE.MeshStandardMaterial({ color: 0x1a1d21, roughness: 0.6 }));
  const steel = keep(
    new THREE.MeshStandardMaterial({ color: 0x9aa0a7, roughness: 0.34, metalness: 0.85 }),
  );
  const glass = keep(
    new THREE.MeshStandardMaterial({ color: 0x141a20, roughness: 0.12, metalness: 0.5 }),
  );
  const blueOn = keep(new THREE.MeshBasicMaterial({ color: 0x3d8bff }));
  const blueOff = keep(new THREE.MeshBasicMaterial({ color: 0x0d2244 }));

  // ------------------------------------------------------------- the cab
  const cab = add(new THREE.BoxGeometry(2.2, 1.5, 2.1), white);
  cab.position.set(0, 1.35, 1.9);
  const screen = add(new THREE.BoxGeometry(2.0, 0.8, 0.08), glass);
  screen.position.set(0, 1.68, 2.92);
  screen.rotation.x = -0.2;
  for (const s of [-1, 1]) {
    const side = add(new THREE.BoxGeometry(0.08, 0.62, 1.4), glass);
    side.position.set(s * 1.09, 1.62, 1.9);
  }
  const nose = add(new THREE.BoxGeometry(2.2, 0.9, 0.55), white);
  nose.position.set(0, 0.92, 3.05);
  const bumper = add(new THREE.BoxGeometry(2.3, 0.3, 0.32), steel);
  bumper.position.set(0, 0.5, 3.18);
  for (const s of [-1, 1]) {
    const lamp = add(
      new THREE.BoxGeometry(0.4, 0.24, 0.1),
      keep(new THREE.MeshBasicMaterial({ color: 0xf2f0e6 })),
    );
    lamp.position.set(s * 0.78, 1.0, 3.32);
  }

  // ------------------------------------------------------- the box body
  // Taller than the cab and square: this is where the work happens.
  const box = add(new THREE.BoxGeometry(2.34, 2.15, 4.2), white);
  box.position.set(0, 1.66, -1.3);
  // Rear doors, split down the middle.
  const doorGap = add(new THREE.BoxGeometry(0.05, 1.7, 0.06), dark);
  doorGap.position.set(0, 1.55, -3.42);
  for (const s of [-1, 1]) {
    const handle = add(new THREE.BoxGeometry(0.1, 0.06, 0.08), steel);
    handle.position.set(s * 0.2, 1.5, -3.44);
    const rearGlass = add(new THREE.BoxGeometry(0.72, 0.5, 0.05), glass);
    rearGlass.position.set(s * 0.52, 2.1, -3.42);
  }
  // The stripe, all the way down both flanks and across the nose.
  for (const s of [-1, 1]) {
    const flank = add(new THREE.BoxGeometry(0.04, 0.34, 4.2), stripe);
    flank.position.set(s * 1.18, 1.34, -1.3);
    const front = add(new THREE.BoxGeometry(0.04, 0.34, 2.1), stripe);
    front.position.set(s * 1.11, 1.24, 1.9);
  }
  const noseBand = add(new THREE.BoxGeometry(2.22, 0.3, 0.04), stripe);
  noseBand.position.set(0, 0.92, 3.34);

  // A red cross on each side of the box, drawn as two crossed bars.
  for (const s of [-1, 1]) {
    for (const [w, h] of [
      [0.6, 0.18],
      [0.18, 0.6],
    ]) {
      const bar = add(new THREE.BoxGeometry(0.03, h, w), stripe);
      bar.position.set(s * 1.19, 1.9, -1.3);
    }
  }

  // ---------------------------------------------------------- the lights
  // A full bar across the cab roof, plus one on each side of the box.
  const beacons: THREE.Mesh[] = [];
  const barBase = add(new THREE.BoxGeometry(1.9, 0.08, 0.28), dark);
  barBase.position.set(0, 2.14, 2.1);
  for (const s of [-1, 1]) {
    const lens = add(new THREE.BoxGeometry(0.8, 0.17, 0.26), blueOff);
    lens.position.set(s * 0.52, 2.22, 2.1);
    beacons.push(lens);
  }

  // ------------------------------------------------------------- wheels
  const wheels: THREE.Object3D[] = [];
  const tyreGeo = keep(new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.28, 20));
  const rimGeo = keep(new THREE.CylinderGeometry(0.22, 0.22, 0.3, 12));
  for (const z of [1.95, -2.0]) {
    for (const s of [-1, 1]) {
      const pivot = new THREE.Object3D();
      pivot.position.set(s * 0.92, WHEEL_R, z);
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
    // Nothing gets towed, but the sequence expects a point; put it where the
    // rear doors are, which is where he goes.
    hookPoint: new THREE.Vector3(0, 0.35, -3.6),
    update(t: number) {
      // Faster than the recovery truck's amber, and blue. An ambulance in a
      // hurry is the difference between a bad afternoon and a serious one.
      const phase = Math.floor(t * 7) % 2;
      beacons[0].material = phase === 0 ? blueOn : blueOff;
      beacons[1].material = phase === 0 ? blueOff : blueOn;
    },
    dispose() {
      for (const d of disposables) d.dispose();
      disposables.length = 0;
    },
  };
}
