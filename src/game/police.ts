import * as THREE from 'three';

/**
 * The patrol car that comes after you for the village camera.
 *
 * Deliberately not a fleet car with a light bar bolted on: those are lofted
 * from real dimensions and recolouring one would make a Rent4Ring hire car
 * chase you, which is the wrong joke. This is a plain estate in the silver and
 * blue every German patrol car has worn since the green ones were retired.
 *
 * Same conventions as everything else that drives: +z forward, ground at
 * y = 0, wheels as spin objects the caller turns.
 */
export interface PoliceCar {
  group: THREE.Group;
  wheels: THREE.Object3D[];
  /** Drives the blue lights; call every frame with elapsed seconds. */
  update(t: number): void;
  dispose(): void;
}

const WHEEL_R = 0.33;

export function buildPoliceCar(): PoliceCar {
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

  const silver = keep(
    new THREE.MeshStandardMaterial({ color: 0xc8ccd2, roughness: 0.34, metalness: 0.55 }),
  );
  const blue = keep(new THREE.MeshStandardMaterial({ color: 0x123a86, roughness: 0.45 }));
  const dark = keep(new THREE.MeshStandardMaterial({ color: 0x16191d, roughness: 0.6 }));
  const glass = keep(
    new THREE.MeshStandardMaterial({ color: 0x141a20, roughness: 0.12, metalness: 0.5 }),
  );
  const lampOn = keep(new THREE.MeshBasicMaterial({ color: 0x4f9bff }));
  const lampOff = keep(new THREE.MeshBasicMaterial({ color: 0x101f3c }));

  // ------------------------------------------------------------- the body
  const lower = add(new THREE.BoxGeometry(1.82, 0.62, 4.6), silver);
  lower.position.set(0, 0.62, 0);
  const cabin = add(new THREE.BoxGeometry(1.68, 0.58, 2.5), silver);
  cabin.position.set(0, 1.2, -0.25);
  // Glass all round the cabin, inset so the pillars read as pillars.
  const windscreen = add(new THREE.BoxGeometry(1.5, 0.5, 0.06), glass);
  windscreen.position.set(0, 1.22, 1.0);
  windscreen.rotation.x = -0.38;
  const rear = add(new THREE.BoxGeometry(1.5, 0.46, 0.06), glass);
  rear.position.set(0, 1.22, -1.48);
  rear.rotation.x = 0.34;
  for (const s of [-1, 1]) {
    const side = add(new THREE.BoxGeometry(0.06, 0.42, 2.2), glass);
    side.position.set(s * 0.845, 1.22, -0.25);
  }

  // The blue flash down each flank, and the bonnet band.
  for (const s of [-1, 1]) {
    const flank = add(new THREE.BoxGeometry(0.04, 0.3, 3.4), blue);
    flank.position.set(s * 0.92, 0.68, -0.1);
    const wedge = add(new THREE.BoxGeometry(0.04, 0.5, 0.9), blue);
    wedge.position.set(s * 0.92, 0.8, 1.35);
    wedge.rotation.x = 0.2;
  }
  const bonnet = add(new THREE.BoxGeometry(1.2, 0.04, 1.0), blue);
  bonnet.position.set(0, 0.94, 1.5);

  // Bumpers, lights and grille.
  const front = add(new THREE.BoxGeometry(1.86, 0.26, 0.24), dark);
  front.position.set(0, 0.44, 2.32);
  const back = add(new THREE.BoxGeometry(1.86, 0.26, 0.24), dark);
  back.position.set(0, 0.44, -2.32);
  for (const s of [-1, 1]) {
    const head = add(
      new THREE.BoxGeometry(0.42, 0.16, 0.08),
      keep(new THREE.MeshBasicMaterial({ color: 0xf4f2e8 })),
    );
    head.position.set(s * 0.6, 0.78, 2.3);
    const tail = add(
      new THREE.BoxGeometry(0.38, 0.14, 0.08),
      keep(new THREE.MeshBasicMaterial({ color: 0x8c1410 })),
    );
    tail.position.set(s * 0.6, 0.8, -2.3);
  }

  // POLIZEI across the boot, as a row of blue blocks. Legible at the distance
  // you actually read it from, which is the mirror.
  for (let i = 0; i < 7; i++) {
    const letter = add(new THREE.BoxGeometry(0.11, 0.14, 0.03), blue);
    letter.position.set(-0.45 + i * 0.15, 1.0, -1.62);
  }

  // ---------------------------------------------------------- the lightbar
  const bar = add(new THREE.BoxGeometry(1.36, 0.07, 0.22), dark);
  bar.position.set(0, 1.53, -0.25);
  const lenses: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const lens = add(new THREE.BoxGeometry(0.58, 0.13, 0.2), lampOff);
    lens.position.set(s * 0.36, 1.6, -0.25);
    lenses.push(lens);
  }

  // -------------------------------------------------------------- wheels
  const wheels: THREE.Object3D[] = [];
  const tyreGeo = keep(new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.22, 18));
  const rimGeo = keep(new THREE.CylinderGeometry(0.19, 0.19, 0.24, 10));
  const rimMat = keep(
    new THREE.MeshStandardMaterial({ color: 0x8b9099, roughness: 0.35, metalness: 0.8 }),
  );
  for (const z of [1.5, -1.5]) {
    for (const s of [-1, 1]) {
      const pivot = new THREE.Object3D();
      pivot.position.set(s * 0.82, WHEEL_R, z);
      const spin = new THREE.Object3D();
      const tyre = new THREE.Mesh(tyreGeo, dark);
      tyre.rotation.z = Math.PI / 2;
      const rim = new THREE.Mesh(rimGeo, rimMat);
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
    update(t: number) {
      // Fast alternating blue. Slower than this reads as a breakdown truck.
      const phase = Math.floor(t * 8) % 2;
      lenses[0].material = phase === 0 ? lampOn : lampOff;
      lenses[1].material = phase === 0 ? lampOff : lampOn;
    },
    dispose() {
      for (const d of disposables) d.dispose();
      disposables.length = 0;
    },
  };
}
