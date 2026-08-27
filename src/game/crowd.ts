import * as THREE from 'three';

export interface Crowd {
  group: THREE.Group;
  /** Call each frame with elapsed seconds; drives the waving. */
  update(t: number): void;
  dispose(): void;
}

interface Person {
  /** Skin, top, trousers. */
  skin: number;
  top: number;
  legs: number;
  /** 'helmet' gets an open-face lid and goggles, the rest are hats or nothing. */
  head: 'helmet' | 'cap' | 'beanie' | 'bare';
  hat?: number;
  /** Radians offset so they do not all wave in lockstep. */
  phase: number;
  /** Some of them are holding a coffee instead of waving with both arms. */
  mug?: boolean;
}

/**
 * The crowd that sees you off.
 *
 * Herr Müller's regulars, stood along the yard in front of the shed as the
 * car comes out: a couple of them waving, one on a coffee, one in an
 * open-face helmet and goggles who has clearly been out on something of his
 * own this morning.
 *
 * Deliberately blocky, in the same idiom as the rider on the Ducati. At the
 * distance the departure camera keeps, a figure is a silhouette and a colour;
 * detail beyond that would out-draw the cars.
 */
const CAST: Person[] = [
  { skin: 0xd9ad8c, top: 0x2f4a7a, legs: 0x2b3038, head: 'cap', hat: 0x1d2733, phase: 0 },
  { skin: 0x8d5f43, top: 0xb8323f, legs: 0x3a4048, head: 'helmet', hat: 0x24282c, phase: 1.9 },
  { skin: 0xe0bb9a, top: 0x3f7d5c, legs: 0x24303f, head: 'beanie', hat: 0xd9b64a, phase: 3.4, mug: true },
  { skin: 0xc79a78, top: 0xd8d3c8, legs: 0x2d3440, head: 'bare', phase: 0.9 },
  { skin: 0x9c6b4d, top: 0x4a4f57, legs: 0x1f242c, head: 'cap', hat: 0xb8323f, phase: 2.6, mug: true },
];

export function buildCrowd(): Crowd {
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };

  const group = new THREE.Group();
  const wavers: { arm: THREE.Object3D; phase: number }[] = [];

  // Shared geometry: five people is thirty-odd meshes, and they are all the
  // same shapes at different colours.
  const legGeo = keep(new THREE.BoxGeometry(0.15, 0.78, 0.17));
  const torsoGeo = keep(new THREE.BoxGeometry(0.44, 0.6, 0.24));
  const armGeo = keep(new THREE.BoxGeometry(0.11, 0.56, 0.12));
  const headGeo = keep(new THREE.BoxGeometry(0.24, 0.26, 0.23));
  const capGeo = keep(new THREE.BoxGeometry(0.26, 0.09, 0.25));
  const peakGeo = keep(new THREE.BoxGeometry(0.24, 0.03, 0.12));
  const lidGeo = keep(new THREE.SphereGeometry(0.17, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62));
  const goggleGeo = keep(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 10));
  const mugGeo = keep(new THREE.CylinderGeometry(0.045, 0.04, 0.1, 8));

  for (const [i, p] of CAST.entries()) {
    const person = new THREE.Group();
    const skin = keep(new THREE.MeshStandardMaterial({ color: p.skin, roughness: 0.82 }));
    const top = keep(new THREE.MeshStandardMaterial({ color: p.top, roughness: 0.75 }));
    const legs = keep(new THREE.MeshStandardMaterial({ color: p.legs, roughness: 0.8 }));

    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D = person) => {
      const m = new THREE.Mesh(geo, mat);
      parent.add(m);
      return m;
    };

    for (const s of [-1, 1]) {
      const leg = add(legGeo, legs);
      leg.position.set(s * 0.11, 0.39, 0);
    }
    const torso = add(torsoGeo, top);
    torso.position.y = 1.08;

    const head = add(headGeo, skin);
    head.position.y = 1.51;

    if (p.head === 'cap' || p.head === 'beanie') {
      const hatMat = keep(new THREE.MeshStandardMaterial({ color: p.hat ?? 0x222222, roughness: 0.85 }));
      const crown = add(capGeo, hatMat);
      crown.position.y = 1.68;
      if (p.head === 'cap') {
        const peak = add(peakGeo, hatMat);
        peak.position.set(0, 1.65, 0.17);
      }
    } else if (p.head === 'helmet') {
      const shell = keep(new THREE.MeshStandardMaterial({ color: p.hat ?? 0x24282c, roughness: 0.35, metalness: 0.3 }));
      const lid = add(lidGeo, shell);
      lid.position.y = 1.56;
      // Goggles pushed up onto the lid, the way they always end up.
      const glass = keep(new THREE.MeshStandardMaterial({ color: 0x9aa6ae, roughness: 0.25, metalness: 0.6 }));
      for (const s of [-1, 1]) {
        const eye = add(goggleGeo, glass);
        eye.position.set(s * 0.07, 1.62, 0.15);
        eye.rotation.x = Math.PI / 2;
      }
    }

    // Right arm waves; the left hangs, or holds a coffee.
    const waveArm = new THREE.Object3D();
    waveArm.position.set(0.28, 1.34, 0);
    const upper = add(armGeo, skin, waveArm);
    upper.position.y = -0.24;
    person.add(waveArm);
    wavers.push({ arm: waveArm, phase: p.phase });

    const restArm = add(armGeo, skin);
    restArm.position.set(-0.28, 1.1, 0);
    if (p.mug) {
      restArm.rotation.x = -1.1;
      restArm.position.z = 0.12;
      const mugMat = keep(new THREE.MeshStandardMaterial({ color: 0xf0ece4, roughness: 0.6 }));
      const mug = add(mugGeo, mugMat);
      mug.position.set(-0.28, 1.16, 0.34);
    }

    // Strung out along the yard, turned a little towards the departing car so
    // they are not a row of shop dummies.
    person.position.set(-7.4 + i * 1.45, 0, 7.6 + (i % 2) * 0.55);
    person.rotation.y = 0.5 + (i % 3) * 0.12;
    group.add(person);
  }

  // Tanju, on his bagger at the end of the line. Included with his
  // permission, and drawn the way everyone else here is drawn: the
  // recognisable things — the beard, the half lid and shades, the white tee
  // and shorts, and above all that long black tourer — rather than a
  // likeness, which would sit oddly against low-poly gorillas anyway.
  const tanju = buildTanju(keep);
  // At the far end of the line, not in the middle of the yard: (1.6, 8.4) put
  // him squarely on the departure route, which runs out of the doorway at
  // x = 1.4 before the left-hander. Everyone else stands between x -7.4 and
  // -1.6, so he parks just beyond them.
  tanju.group.position.set(-9.7, 0, 8.2);
  tanju.group.rotation.y = 0.72;
  group.add(tanju.group);
  wavers.push({ arm: tanju.arm, phase: 1.25 });

  return {
    group,
    update(t: number) {
      for (const w of wavers) {
        // Positive, not negative: the arm hangs along -y, and a rotation about
        // +z carries -y towards +x — the side the arm is on. Negative swung it
        // up across the chest instead, where the body hid it.
        w.arm.rotation.z = 2.1 + Math.sin(t * 4.2 + w.phase) * 0.42;
        w.arm.rotation.x = Math.sin(t * 2.1 + w.phase) * 0.1;
      }
    },
    dispose() {
      for (const d of disposables) d.dispose();
      disposables.length = 0;
    },
  };
}


/**
 * A long black bagger with its rider aboard: frame-mounted fairing, twin
 * headlights, hard panniers and a top box. Same local frame as everything
 * else — +z forward, ground at y = 0.
 */
function buildTanju(keep: <T extends { dispose(): void }>(x: T) => T): {
  group: THREE.Group;
  arm: THREE.Object3D;
} {
  const group = new THREE.Group();
  const black = keep(new THREE.MeshStandardMaterial({ color: 0x121417, roughness: 0.32, metalness: 0.55 }));
  const matte = keep(new THREE.MeshStandardMaterial({ color: 0x1b1e22, roughness: 0.7 }));
  const chrome = keep(new THREE.MeshStandardMaterial({ color: 0xb8bec6, roughness: 0.22, metalness: 0.92 }));
  const rubber = keep(new THREE.MeshStandardMaterial({ color: 0x17191b, roughness: 0.92 }));
  const lamp = keep(new THREE.MeshBasicMaterial({ color: 0xe9f2ea }));
  const tee = keep(new THREE.MeshStandardMaterial({ color: 0xecebe6, roughness: 0.8 }));
  const skin = keep(new THREE.MeshStandardMaterial({ color: 0xc99a72, roughness: 0.8 }));
  const shorts = keep(new THREE.MeshStandardMaterial({ color: 0x23272d, roughness: 0.8 }));
  const shade = keep(new THREE.MeshStandardMaterial({ color: 0x0c0e11, roughness: 0.2, metalness: 0.5 }));

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D = group) => {
    const m = new THREE.Mesh(keep(geo), mat);
    parent.add(m);
    return m;
  };

  // ------------------------------------------------------------- the bike
  const FRONT_Z = 0.86;
  const REAR_Z = -0.74;
  for (const [z, r, w] of [
    [FRONT_Z, 0.33, 0.11],
    [REAR_Z, 0.29, 0.19],
  ]) {
    const tyre = add(new THREE.CylinderGeometry(r, r, w, 22), rubber);
    tyre.position.set(0, r, z);
    tyre.rotation.z = Math.PI / 2;
    const rim = add(new THREE.CylinderGeometry(r * 0.62, r * 0.62, w + 0.01, 16), black);
    rim.position.set(0, r, z);
    rim.rotation.z = Math.PI / 2;
  }

  // Long low body, engine, and the bags that make it a bagger.
  const frame = add(new THREE.BoxGeometry(0.26, 0.24, 1.5), matte);
  frame.position.set(0, 0.62, 0.02);
  const motor = add(new THREE.BoxGeometry(0.42, 0.34, 0.44), chrome);
  motor.position.set(0, 0.5, 0.06);
  const tank = add(new THREE.BoxGeometry(0.3, 0.22, 0.5), black);
  tank.position.set(0, 0.82, 0.28);
  const seat = add(new THREE.BoxGeometry(0.3, 0.1, 0.44), matte);
  seat.position.set(0, 0.78, -0.16);
  for (const s of [-1, 1]) {
    const bag = add(new THREE.BoxGeometry(0.16, 0.34, 0.62), black);
    bag.position.set(s * 0.3, 0.62, -0.52);
  }
  const topBox = add(new THREE.BoxGeometry(0.46, 0.28, 0.4), black);
  topBox.position.set(0, 0.98, -0.56);

  // The batwing fairing and its twin lights, which is the whole silhouette.
  const fairing = add(new THREE.BoxGeometry(0.62, 0.42, 0.22), black);
  fairing.position.set(0, 1.02, 0.72);
  const windshield = add(new THREE.BoxGeometry(0.5, 0.22, 0.04), shade);
  windshield.position.set(0, 1.3, 0.7);
  windshield.rotation.x = 0.22;
  for (const s of [-1, 1]) {
    const light = add(new THREE.BoxGeometry(0.17, 0.13, 0.05), lamp);
    light.position.set(s * 0.15, 0.96, 0.84);
  }
  for (const s of [-1, 1]) {
    const fork = add(new THREE.CylinderGeometry(0.028, 0.028, 0.62, 10), chrome);
    fork.position.set(s * 0.1, 0.62, 0.82);
    fork.rotation.x = -0.42;
  }

  // ------------------------------------------------------------ the rider
  const torso = add(new THREE.BoxGeometry(0.42, 0.5, 0.26), tee);
  torso.position.set(0, 1.18, -0.06);
  torso.rotation.x = -0.16;
  const head = add(new THREE.BoxGeometry(0.22, 0.24, 0.22), skin);
  head.position.set(0, 1.56, 0.02);
  // Beard, and the half lid with shades under it.
  const beard = add(new THREE.BoxGeometry(0.19, 0.11, 0.2), matte);
  beard.position.set(0, 1.47, 0.04);
  const lid = add(new THREE.SphereGeometry(0.16, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), black);
  lid.position.set(0, 1.6, 0.02);
  const shades = add(new THREE.BoxGeometry(0.2, 0.06, 0.04), shade);
  shades.position.set(0, 1.58, 0.13);

  // Legs forward onto the boards, in shorts.
  for (const s of [-1, 1]) {
    const thigh = add(new THREE.BoxGeometry(0.14, 0.15, 0.42), shorts);
    thigh.position.set(s * 0.16, 0.8, 0.16);
    const shin = add(new THREE.BoxGeometry(0.12, 0.34, 0.13), skin);
    shin.position.set(s * 0.18, 0.58, 0.38);
    shin.rotation.x = 0.3;
    const boot = add(new THREE.BoxGeometry(0.13, 0.1, 0.24), tee);
    boot.position.set(s * 0.18, 0.4, 0.52);
  }

  // Left hand on the bar; the right one comes off it to wave.
  const barL = add(new THREE.BoxGeometry(0.1, 0.34, 0.11), skin);
  barL.position.set(-0.26, 1.24, 0.42);
  barL.rotation.x = -0.7;

  const arm = new THREE.Object3D();
  arm.position.set(0.24, 1.36, -0.02);
  const upper = add(new THREE.BoxGeometry(0.1, 0.44, 0.11), skin, arm);
  upper.position.y = -0.2;
  group.add(arm);

  return { group, arm };
}
