import * as THREE from 'three';
import { curve, loft } from './carMesh';

/**
 * A red Ducati Panigale V4 on a rear paddock stand, as shop decoration.
 *
 * Built to the real bike's numbers so it reads at the right size next to a
 * car: 1469 mm wheelbase, 835 mm seat, 120/70-17 front and 200/60-17 rear on
 * 17" rims. The fairing and the tail use the same swept-section loft() as the
 * cars, which is what stops the bodywork looking like a stack of boxes.
 *
 * Local frame: +z is forward (the nose), +y up, +x the rider's LEFT. Ducati's
 * single-sided swingarm sits on the left, so the bare rear rim shows on -x —
 * that asymmetry is the whole reason to point the right flank at the visitor.
 */
export interface Decoration {
  group: THREE.Group;
  dispose(): void;
}

const WHEELBASE = 1.469;
const FRONT_Z = WHEELBASE / 2;
const REAR_Z = -WHEELBASE / 2;
const FRONT_R = 0.3; // 120/70-17
const REAR_R = 0.336; // 200/60-17
const RIM_R = 0.216; // 17"
/** Rake, from the steering-head angle. Sets the fork line and the clip-ons. */
const RAKE = 0.4276; // 24.5°
/** How far a paddock stand lifts the rear wheel off the floor. */
const STAND_LIFT = 0.07;

export function buildDucatiPanigale(): Decoration {
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };

  // Ducati red is a saturated orange-red, well away from the weathered kerb
  // red in the art direction table — this is fresh paint under shop lighting.
  const paint = keep(
    new THREE.MeshStandardMaterial({ color: 0xc81420, roughness: 0.24, metalness: 0.5 }),
  );
  const carbon = keep(new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.42 }));
  const rubber = keep(new THREE.MeshStandardMaterial({ color: 0x17191b, roughness: 0.92 }));
  const anodised = keep(
    new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.34, metalness: 0.85 }),
  );
  const steel = keep(
    new THREE.MeshStandardMaterial({ color: 0xb2b7bd, roughness: 0.28, metalness: 0.92 }),
  );
  // Öhlins gold — the giveaway detail on the S, and the one splash of warmth
  // against all the black.
  const ohlins = keep(
    new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.3, metalness: 0.9 }),
  );
  const screen = keep(
    new THREE.MeshStandardMaterial({
      color: 0x16181c,
      roughness: 0.1,
      metalness: 0.2,
      transparent: true,
      opacity: 0.55,
    }),
  );
  const lamp = keep(new THREE.MeshStandardMaterial({ color: 0xdceaf6, emissive: 0x9fc4e4 }));
  const tailLamp = keep(new THREE.MeshStandardMaterial({ color: 0x8e1016, emissive: 0x5c0308 }));

  const bike = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh => {
    const mesh = new THREE.Mesh(keep(geo), mat);
    bike.add(mesh);
    return mesh;
  };

  // ------------------------------------------------- fairing, tank and tail
  // The line that makes a Panigale a Panigale, read off the side view: the
  // lower fairing is deepest *under the motor* and sweeps up hard behind the
  // rider's foot, the tank is a tall mass, and the seat is a narrow bridge to
  // the tail. Getting the belly low is what stops it looking like a plank.
  const body = add(
    loft(
      1.55,
      curve([
        [-1.0, 0.09], // seat back
        [-0.75, 0.098], // seat
        [-0.45, 0.135], // tank rear / airbox
        [-0.15, 0.18], // knee cutout
        [0.15, 0.22],
        [0.45, 0.235], // widest, over the radiator
        [0.7, 0.2], // alongside the front wheel
        [0.88, 0.13], // headlight cluster
        [1.0, 0.045], // nose tip
      ]),
      curve([
        [-1.0, 0.79],
        [-0.75, 0.78],
        [-0.45, 0.5], // lower fairing wrapping back to the swingarm pivot
        [-0.15, 0.38],
        [0.15, 0.31], // deepest point of the belly pan, level with the axles
        [0.45, 0.34],
        [0.7, 0.47],
        [0.88, 0.66],
        [1.0, 0.79],
      ]),
      curve([
        [-1.0, 0.86],
        [-0.75, 0.845], // 835 mm seat height, straight off the spec sheet
        [-0.45, 0.875],
        [-0.15, 0.895], // tank top
        [0.15, 0.905],
        [0.45, 0.935],
        [0.7, 0.985],
        [0.88, 1.015], // top of the nose, under the screen
        [1.0, 0.93],
      ]),
      // Lowish roundness on purpose: a Panigale's fairing is slab-sided with
      // hard creases, and at 0.78 the same profile came out as a smooth
      // teardrop that read as a scooter. Not lower than this, though — a
      // dead-flat flank catches no light at all and goes black.
      0.55,
      24,
      20,
    ),
    paint,
  );
  body.position.z = 0.14;

  // The tail kicks up behind the seat and ends in a point.
  const tail = add(
    loft(
      0.62,
      curve([
        [-1.0, 0.028],
        [-0.4, 0.07],
        [0.3, 0.088],
        [1.0, 0.095],
      ]),
      curve([
        [-1.0, 0.905],
        [-0.4, 0.865],
        [0.3, 0.815],
        [1.0, 0.775],
      ]),
      curve([
        [-1.0, 0.985],
        [-0.4, 1.005],
        [0.3, 0.935],
        [1.0, 0.855],
      ]),
      0.45,
      20,
      12,
    ),
    paint,
  );
  tail.position.z = -0.74;

  const seatPad = add(new THREE.BoxGeometry(0.17, 0.05, 0.32), carbon);
  seatPad.position.set(0, 0.85, -0.42);

  const tailLight = add(new THREE.BoxGeometry(0.075, 0.04, 0.02), tailLamp);
  tailLight.position.set(0, 0.935, -0.99);

  // --------------------------------------------------------------- the face
  // Two angular LED slashes either side of the ram-air intake.
  for (const s of [-1, 1]) {
    const led = add(new THREE.BoxGeometry(0.045, 0.1, 0.03), lamp);
    led.position.set(s * 0.075, 0.85, 0.94);
    led.rotation.z = s * 0.55;
  }
  const intake = add(new THREE.BoxGeometry(0.065, 0.075, 0.04), carbon);
  intake.position.set(0, 0.87, 0.95);

  const bubble = add(new THREE.BoxGeometry(0.2, 0.16, 0.025), screen);
  bubble.position.set(0, 1.05, 0.79);
  bubble.rotation.x = 0.5;

  // Biplane winglets — the detail that dates a Panigale to 2020 or later.
  for (const s of [-1, 1]) {
    for (const [y, z, w] of [
      [0.8, 0.73, 0.13],
      [0.71, 0.71, 0.11],
    ]) {
      const wing = add(new THREE.BoxGeometry(w, 0.02, 0.1), paint);
      wing.position.set(s * (0.2 + w / 2), y, z);
      wing.rotation.z = s * -0.12;
    }
  }

  // Fairing mirrors, small and stalk-mounted.
  for (const s of [-1, 1]) {
    const stalk = add(new THREE.CylinderGeometry(0.008, 0.008, 0.09, 6), carbon);
    stalk.position.set(s * 0.23, 1.0, 0.7);
    stalk.rotation.z = s * 0.5;
    const glass = add(new THREE.BoxGeometry(0.07, 0.045, 0.02), carbon);
    glass.position.set(s * 0.26, 1.04, 0.7);
    glass.rotation.y = s * 0.3;
  }

  // Carbon hugger over the front wheel — a big part of the bike's face from
  // the side, and its absence was what made the front end look bare.
  for (let i = 0; i < 6; i++) {
    const a = -0.55 + i * 0.19;
    const r = FRONT_R + 0.06;
    const seg = add(new THREE.BoxGeometry(0.15, 0.02, 0.13), carbon);
    seg.position.set(0, FRONT_R + r * Math.cos(a), FRONT_Z + r * Math.sin(a));
    // The plate's normal is its local +y, which rotation.x carries to
    // (0, cos a, sin a) — the radial direction. Negating it fans them out.
    seg.rotation.x = a;
  }

  // --------------------------------------------------------------- V4 motor
  // The belly pan swallows the crankcases; what stays visible is the gearbox
  // and clutch side in the gap the fairing opens up behind the rider's foot.
  const block = add(new THREE.BoxGeometry(0.3, 0.36, 0.42), anodised);
  block.position.set(0, 0.55, 0.1);
  const cases = add(new THREE.BoxGeometry(0.24, 0.22, 0.26), carbon);
  cases.position.set(0, 0.46, -0.13);
  // Rear cylinder head, poking up between the tank and the swingarm pivot.
  const head = add(new THREE.BoxGeometry(0.24, 0.18, 0.16), anodised);
  head.position.set(0, 0.66, -0.06);

  // Öhlins rear shock, laid down along the left of the gearbox.
  const spring = add(new THREE.CylinderGeometry(0.038, 0.038, 0.22, 10), ohlins);
  spring.position.set(0.07, 0.56, -0.31);
  spring.rotation.x = 0.7;

  // Belly silencer with the twin outlets under the tail, on the right.
  const can = add(new THREE.CylinderGeometry(0.07, 0.07, 0.3, 12), steel);
  can.position.set(0.0, 0.33, -0.2);
  can.rotation.x = Math.PI / 2;
  // Twin outlets tucked under the tail on the right, clear of the bodywork.
  for (const y of [0.56, 0.64]) {
    const pipe = add(new THREE.CylinderGeometry(0.028, 0.028, 0.1, 10), steel);
    pipe.position.set(-0.085, y, -0.7);
    pipe.rotation.x = Math.PI / 2;
  }

  // ----------------------------------------------------------------- wheels
  const wheel = (r: number, width: number, x: number, y: number, z: number) => {
    const tyre = add(new THREE.CylinderGeometry(r, r, width, 28), rubber);
    tyre.position.set(x, y, z);
    tyre.rotation.z = Math.PI / 2;
    const rim = add(new THREE.CylinderGeometry(RIM_R, RIM_R, width + 0.01, 20), anodised);
    rim.position.set(x, y, z);
    rim.rotation.z = Math.PI / 2;
  };
  wheel(FRONT_R, 0.125, 0, FRONT_R, FRONT_Z);
  wheel(REAR_R, 0.2, 0, REAR_R, REAR_Z);

  // Twin 330 mm front discs with red Brembo callipers.
  for (const s of [-1, 1]) {
    const disc = add(new THREE.CylinderGeometry(0.165, 0.165, 0.007, 24), steel);
    disc.position.set(s * 0.078, FRONT_R, FRONT_Z);
    disc.rotation.z = Math.PI / 2;
    const calliper = add(new THREE.BoxGeometry(0.035, 0.09, 0.06), paint);
    calliper.position.set(s * 0.088, FRONT_R + 0.14, FRONT_Z - 0.06);
  }
  const rearDisc = add(new THREE.CylinderGeometry(0.12, 0.12, 0.006, 20), steel);
  rearDisc.position.set(0.11, REAR_R, REAR_Z);
  rearDisc.rotation.z = Math.PI / 2;
  // The exposed side of the rear wheel wears the big centre nut.
  const hubNut = add(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 6), paint);
  hubNut.position.set(-0.105, REAR_R, REAR_Z);
  hubNut.rotation.z = Math.PI / 2;

  // Single-sided swingarm, on the left, pivoting off the back of the motor.
  const arm = add(new THREE.BoxGeometry(0.1, 0.15, 0.58), anodised);
  arm.position.set(0.13, 0.37, -0.47);
  arm.rotation.x = 0.11;

  // ------------------------------------------------------------------ front
  const forkDir = new THREE.Vector3(0, Math.cos(RAKE), -Math.sin(RAKE));
  const axle = new THREE.Vector3(0, FRONT_R, FRONT_Z);
  const along = (d: number) => axle.clone().addScaledVector(forkDir, d);
  for (const s of [-1, 1]) {
    const upper = along(0.3);
    const tube = add(new THREE.CylinderGeometry(0.026, 0.026, 0.62, 12), ohlins);
    tube.position.set(s * 0.105, upper.y, upper.z);
    tube.rotation.x = -RAKE;
    const lowerAt = along(0.16);
    const slider = add(new THREE.CylinderGeometry(0.034, 0.034, 0.33, 12), carbon);
    slider.position.set(s * 0.105, lowerAt.y, lowerAt.z);
    slider.rotation.x = -RAKE;
  }
  for (const d of [0.5, 0.6]) {
    const at = along(d);
    const clamp = add(new THREE.BoxGeometry(0.28, 0.035, 0.11), anodised);
    clamp.position.set(0, at.y, at.z);
    clamp.rotation.x = -RAKE;
  }
  // Clip-ons below the top yoke, with grips on the ends.
  const bars = along(0.55);
  for (const s of [-1, 1]) {
    const bar = add(new THREE.CylinderGeometry(0.016, 0.016, 0.16, 10), anodised);
    bar.position.set(s * 0.21, bars.y, bars.z);
    bar.rotation.z = Math.PI / 2;
    const grip = add(new THREE.CylinderGeometry(0.019, 0.019, 0.11, 10), carbon);
    grip.position.set(s * 0.3, bars.y, bars.z);
    grip.rotation.z = Math.PI / 2;
  }
  // Rearsets, so the bike does not look like it is floating.
  for (const s of [-1, 1]) {
    const peg = add(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 8), steel);
    peg.position.set(s * 0.19, 0.4, -0.24);
    peg.rotation.z = Math.PI / 2;
  }

  // ---------------------------------------------------------- paddock stand
  // The bike is not balanced on anything — a rear stand under the swingarm
  // spools is how a bike this shape actually stands up in a showroom.
  const stand = new THREE.Group();
  const standPart = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
    const mesh = new THREE.Mesh(keep(geo), mat);
    stand.add(mesh);
    return mesh;
  };
  const crossbar = standPart(new THREE.CylinderGeometry(0.022, 0.022, 0.54, 10), carbon);
  crossbar.position.set(0, 0.1, -1.02);
  crossbar.rotation.z = Math.PI / 2;
  for (const s of [-1, 1]) {
    const armBar = standPart(new THREE.BoxGeometry(0.035, 0.035, 0.46), carbon);
    armBar.position.set(s * 0.22, 0.2, -0.82);
    armBar.rotation.x = 0.4636;
    const hook = standPart(new THREE.CylinderGeometry(0.026, 0.026, 0.05, 10), paint);
    hook.position.set(s * 0.2, 0.31, -0.61);
    hook.rotation.z = Math.PI / 2;
    const castor = standPart(new THREE.CylinderGeometry(0.038, 0.038, 0.028, 12), carbon);
    castor.position.set(s * 0.27, 0.038, -1.02);
    castor.rotation.z = Math.PI / 2;
  }
  const handle = standPart(new THREE.CylinderGeometry(0.018, 0.018, 0.38, 10), carbon);
  handle.position.set(0, 0.27, -1.14);
  handle.rotation.x = -0.45;

  // ------------------------------------------------------------------ pitch
  // On the stand the rear sits 70 mm high, so the whole bike noses down about
  // the front contact patch. Pivoting there keeps the front tyre on the floor.
  const pivot = new THREE.Group();
  pivot.position.z = FRONT_Z;
  bike.position.z = -FRONT_Z;
  pivot.rotation.x = Math.asin(STAND_LIFT / WHEELBASE);
  pivot.add(bike);

  const group = new THREE.Group();
  group.add(pivot, stand);

  return {
    group,
    dispose() {
      for (const d of disposables) d.dispose();
      disposables.length = 0;
    },
  };
}
