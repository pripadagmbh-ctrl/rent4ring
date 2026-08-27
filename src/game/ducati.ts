import * as THREE from 'three';
import { curve, loft } from './carMesh';

/**
 * The red Ducati Panigale V4 — Herr Müller's own bike.
 *
 * Built to the real numbers so it reads at the right size beside a car:
 * 1469 mm wheelbase, 835 mm seat, 120/70-17 front and 200/60-17 rear on 17"
 * rims. The fairing and tail use the same swept-section loft() as the cars,
 * which is what stops the bodywork looking like a stack of boxes.
 *
 * Local frame: +z is forward, +y up, +x the rider's LEFT. Ducati's
 * single-sided swingarm sits on the left, so the bare rear rim shows on -x.
 *
 * Two builds come out of here. On a paddock stand it is the shop decoration;
 * with a rider it is a vehicle, and then it has to satisfy the same contract
 * as a car mesh — hub pivots the game can spin, a steering head it can turn,
 * a brake light it can light and a damage model.
 */
export interface BikeMesh {
  group: THREE.Group;
  wheels: THREE.Object3D[];
  frontWheels: THREE.Object3D[];
  brakeLights: THREE.Mesh;
  setDamage(amount: number): void;
  dispose(): void;
}

interface Options {
  /** Rear paddock stand and a nose-down attitude, for the showroom floor. */
  stand?: boolean;
  /** Herr Müller aboard, in leathers that no longer fit him. */
  rider?: boolean;
  /** Translucent, for the lap ghost. */
  ghost?: boolean;
  paint?: number;
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

export function buildDucatiPanigale(options: Options = {}): BikeMesh {
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };

  // Ducati red is a saturated orange-red, well away from the weathered kerb
  // red in the art direction table — this is fresh paint, not a kerbstone.
  const paint = keep(
    new THREE.MeshStandardMaterial({
      color: options.paint ?? 0xc81420,
      roughness: 0.24,
      metalness: 0.5,
    }),
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
  // Basic, not standard: the game recolours this directly every frame to
  // flash the brake, exactly as it does on the cars.
  const tailLamp = keep(new THREE.MeshBasicMaterial({ color: 0x3a0806 }));

  /** Everything that is not a wheel: frame, bodywork, motor, rider. */
  const chassis = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh => {
    const mesh = new THREE.Mesh(keep(geo), mat);
    chassis.add(mesh);
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
  const winglets: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    for (const [y, z, w] of [
      [0.8, 0.73, 0.13],
      [0.71, 0.71, 0.11],
    ]) {
      const wing = add(new THREE.BoxGeometry(w, 0.02, 0.1), paint);
      wing.position.set(s * (0.2 + w / 2), y, z);
      wing.rotation.z = s * -0.12;
      winglets.push(wing);
    }
  }

  // Fairing mirrors, small and stalk-mounted.
  const mirrors: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const stalk = add(new THREE.CylinderGeometry(0.008, 0.008, 0.09, 6), carbon);
    stalk.position.set(s * 0.23, 1.0, 0.7);
    stalk.rotation.z = s * 0.5;
    const glass = add(new THREE.BoxGeometry(0.07, 0.045, 0.02), carbon);
    glass.position.set(s * 0.26, 1.04, 0.7);
    glass.rotation.y = s * 0.3;
    mirrors.push(stalk, glass);
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
  for (const y of [0.56, 0.64]) {
    const pipe = add(new THREE.CylinderGeometry(0.028, 0.028, 0.1, 10), steel);
    pipe.position.set(-0.085, y, -0.7);
    pipe.rotation.x = Math.PI / 2;
  }

  // Single-sided swingarm, on the left, pivoting off the back of the motor.
  const arm = add(new THREE.BoxGeometry(0.1, 0.15, 0.58), anodised);
  arm.position.set(0.13, 0.37, -0.47);
  arm.rotation.x = 0.11;

  // Rearsets, so the bike does not look like it is floating.
  for (const s of [-1, 1]) {
    const peg = add(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 8), steel);
    peg.position.set(s * 0.19, 0.4, -0.24);
    peg.rotation.z = Math.PI / 2;
  }

  // ----------------------------------------------------------------- wheels
  // Same shape as a car wheel so the game can drive it: a pivot at the hub
  // with the ground at y=0, and a spin child it rotates about x.
  const hub = (r: number, width: number, z: number) => {
    const pivot = new THREE.Object3D();
    pivot.position.set(0, r, z);
    const spin = new THREE.Object3D();
    const tyre = new THREE.Mesh(keep(new THREE.CylinderGeometry(r, r, width, 28)), rubber);
    tyre.rotation.z = Math.PI / 2;
    const rim = new THREE.Mesh(
      keep(new THREE.CylinderGeometry(RIM_R, RIM_R, width + 0.01, 20)),
      anodised,
    );
    rim.rotation.z = Math.PI / 2;
    spin.add(tyre, rim);
    pivot.add(spin);
    return { pivot, spin };
  };

  const front = hub(FRONT_R, 0.125, 0);
  const rear = hub(REAR_R, 0.2, 0);

  // Twin 330 mm front discs with red Brembo callipers, on the spinning part.
  for (const s of [-1, 1]) {
    const disc = new THREE.Mesh(
      keep(new THREE.CylinderGeometry(0.165, 0.165, 0.007, 24)),
      steel,
    );
    disc.position.x = s * 0.078;
    disc.rotation.z = Math.PI / 2;
    front.spin.add(disc);
  }
  const rearDisc = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.12, 0.12, 0.006, 20)), steel);
  rearDisc.position.x = 0.11;
  rearDisc.rotation.z = Math.PI / 2;
  rear.spin.add(rearDisc);
  // The exposed side of the rear wheel wears the big centre nut.
  const hubNut = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 6)), paint);
  hubNut.position.x = -0.105;
  hubNut.rotation.z = Math.PI / 2;
  rear.spin.add(hubNut);

  // ------------------------------------------------------------ front end
  // Forks, yokes, bars, callipers and the hugger all turn with the wheel, so
  // they hang off the steering group rather than the chassis. Steering just
  // the tyre would look like the front end had come loose.
  const steerHead = new THREE.Object3D();
  steerHead.position.set(0, 0, FRONT_Z);
  steerHead.add(front.pivot);

  const steerPart = (geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh => {
    const mesh = new THREE.Mesh(keep(geo), mat);
    steerHead.add(mesh);
    return mesh;
  };

  const forkDir = new THREE.Vector3(0, Math.cos(RAKE), -Math.sin(RAKE));
  const axle = new THREE.Vector3(0, FRONT_R, 0);
  const along = (d: number) => axle.clone().addScaledVector(forkDir, d);
  for (const s of [-1, 1]) {
    const upper = along(0.3);
    const tube = steerPart(new THREE.CylinderGeometry(0.026, 0.026, 0.62, 12), ohlins);
    tube.position.set(s * 0.105, upper.y, upper.z);
    tube.rotation.x = -RAKE;
    const lowerAt = along(0.16);
    const slider = steerPart(new THREE.CylinderGeometry(0.034, 0.034, 0.33, 12), carbon);
    slider.position.set(s * 0.105, lowerAt.y, lowerAt.z);
    slider.rotation.x = -RAKE;
    const calliper = steerPart(new THREE.BoxGeometry(0.035, 0.09, 0.06), paint);
    calliper.position.set(s * 0.088, FRONT_R + 0.14, -0.06);
  }
  for (const d of [0.5, 0.6]) {
    const at = along(d);
    const clamp = steerPart(new THREE.BoxGeometry(0.28, 0.035, 0.11), anodised);
    clamp.position.set(0, at.y, at.z);
    clamp.rotation.x = -RAKE;
  }
  // Clip-ons below the top yoke, with grips on the ends.
  const bars = along(0.55);
  for (const s of [-1, 1]) {
    const bar = steerPart(new THREE.CylinderGeometry(0.016, 0.016, 0.16, 10), anodised);
    bar.position.set(s * 0.21, bars.y, bars.z);
    bar.rotation.z = Math.PI / 2;
    const grip = steerPart(new THREE.CylinderGeometry(0.019, 0.019, 0.11, 10), carbon);
    grip.position.set(s * 0.3, bars.y, bars.z);
    grip.rotation.z = Math.PI / 2;
  }
  // Carbon hugger over the front wheel — a big part of the bike's face from
  // the side, and its absence was what made the front end look bare.
  for (let i = 0; i < 6; i++) {
    const a = -0.55 + i * 0.19;
    const r = FRONT_R + 0.06;
    const seg = steerPart(new THREE.BoxGeometry(0.15, 0.02, 0.13), carbon);
    seg.position.set(0, FRONT_R + r * Math.cos(a), r * Math.sin(a));
    // The plate's normal is its local +y, which rotation.x carries to
    // (0, cos a, sin a) — the radial direction. Negating it fans them out.
    seg.rotation.x = a;
  }

  chassis.add(steerHead);
  rear.pivot.position.z = REAR_Z;
  chassis.add(rear.pivot);

  // ------------------------------------------------------------- the rider
  if (options.rider) chassis.add(buildRider(keep));

  // ------------------------------------------------------------ assembly
  const group = new THREE.Group();

  if (options.stand) {
    // On the stand the rear sits 70 mm high, so the whole bike noses down
    // about the front contact patch. Pivoting there keeps the front tyre on
    // the floor.
    const pivot = new THREE.Group();
    pivot.position.z = FRONT_Z;
    chassis.position.z = -FRONT_Z;
    pivot.rotation.x = Math.asin(STAND_LIFT / WHEELBASE);
    pivot.add(chassis);
    group.add(pivot, buildStand(keep, carbon, paint));
  } else {
    group.add(chassis);
  }

  if (options.ghost) {
    group.traverse((obj) => {
      const mat = (obj as THREE.Mesh).material as THREE.Material | undefined;
      if (!mat) return;
      mat.transparent = true;
      mat.opacity = 0.32;
      mat.depthWrite = false;
    });
  }

  const basePaint = paint.color.clone();
  const baseRough = paint.roughness;

  return {
    group,
    wheels: [front.spin, rear.spin],
    frontWheels: [steerHead],
    brakeLights: tailLight,
    setDamage(amount: number) {
      const a = THREE.MathUtils.clamp(amount, 0, 1);
      // Paint dulls and greys off, same idea as the cars.
      paint.color.copy(basePaint).lerp(new THREE.Color(0x6b6560), a * 0.7);
      paint.roughness = baseRough + a * 0.5;
      // A bike sheds its fragile bits early: mirrors go first, then a winglet
      // folds back. Both are the parts that actually break in a slide.
      for (const m of mirrors) m.visible = a < 0.35;
      for (const [i, w] of winglets.entries()) {
        w.visible = a < 0.6 || i % 2 === 0;
        w.rotation.x = a > 0.3 ? -a * 0.8 : 0;
      }
    },
    dispose() {
      for (const d of disposables) d.dispose();
      disposables.length = 0;
    },
  };
}

/**
 * Herr Müller on his own bike, in leathers that stopped fitting some years
 * ago.
 *
 * The rider used to be an anonymous racer folded into a textbook tuck —
 * correct, and nobody. Two things had to change for him to read as himself.
 *
 * **The build.** He is a gorilla: chest and shoulders far wider than a man's,
 * arms longer and thicker, legs short. That silhouette alone identifies him
 * from behind at speed, which is the only angle most of the drive offers.
 *
 * **The fit.** A suit that is merely snug reads as a suit. A suit that has
 * lost is one you can see losing: fur forced out at the collar, the cuffs, the
 * ankles and the waist, where the leather simply runs out and gives up. The
 * stretched panels are a lighter, shinier red than the rest for the same
 * reason real leather goes pale over a strain.
 *
 * And he cannot tuck. Sitting him upright with his knees out is what sells the
 * whole thing — the bike is the right size and the man is not.
 */
function buildRider(keep: <T extends { dispose(): void }>(x: T) => T): THREE.Group {
  const g = new THREE.Group();
  // The shop's own red, because of course he had them made in it.
  const leather = keep(new THREE.MeshStandardMaterial({ color: 0xb01220, roughness: 0.34 }));
  // Leather under strain goes pale and shiny. Used only where he is widest.
  const strained = keep(new THREE.MeshStandardMaterial({ color: 0xd8404a, roughness: 0.2 }));
  const panel = keep(new THREE.MeshStandardMaterial({ color: 0x1b2027, roughness: 0.45 }));
  const fur = keep(new THREE.MeshStandardMaterial({ color: 0x7d7268, roughness: 0.95 }));
  const face = keep(new THREE.MeshStandardMaterial({ color: 0xa8907c, roughness: 0.8 }));
  const helmet = keep(new THREE.MeshStandardMaterial({ color: 0xe8e6e0, roughness: 0.28 }));
  const dark = keep(new THREE.MeshStandardMaterial({ color: 0x14181d, roughness: 0.5 }));
  const glove = keep(new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.6 }));

  const part = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
    const m = new THREE.Mesh(keep(geo), mat);
    g.add(m);
    return m;
  };

  // ------------------------------------------------------------ the torso
  // Barrel chest, only slightly forward: he has neither the flexibility nor
  // the intention to fold himself over that tank.
  const chest = part(new THREE.BoxGeometry(0.58, 0.44, 0.42), leather);
  chest.position.set(0, 1.18, -0.24);
  chest.rotation.x = -0.24;
  // The bit the zip is losing to, bulging past the jacket on both sides.
  const belly = part(new THREE.SphereGeometry(0.24, 14, 10), strained);
  belly.position.set(0, 1.02, -0.16);
  belly.scale.set(1.16, 0.82, 0.92);
  // Shoulders a man does not have.
  for (const s of [-1, 1]) {
    const delt = part(new THREE.SphereGeometry(0.15, 12, 10), strained);
    delt.position.set(s * 0.29, 1.28, -0.24);
    delt.scale.set(1, 0.9, 1.05);
  }
  // The hump every set of leathers has, oversized like the rest of him.
  const hump = part(new THREE.SphereGeometry(0.15, 10, 8), leather);
  hump.position.set(0, 1.36, -0.42);
  hump.scale.set(1.1, 0.62, 1.45);
  // Waist: the leather runs out here and fur takes over for a few centimetres.
  const gut = part(new THREE.CylinderGeometry(0.235, 0.225, 0.09, 14), fur);
  gut.position.set(0, 0.87, -0.16);
  const belt = part(new THREE.CylinderGeometry(0.24, 0.24, 0.06, 14), panel);
  belt.position.set(0, 0.81, -0.16);

  // ------------------------------------------------------------- the head
  // Open face. A full-face lid does not go over that head, which is the same
  // joke as the suit and the reason you can tell who is riding.
  const skull = part(new THREE.SphereGeometry(0.16, 14, 12), fur);
  skull.position.set(0, 1.5, -0.16);
  skull.scale.set(1, 0.98, 1.05);
  const brow = part(new THREE.BoxGeometry(0.27, 0.07, 0.1), fur);
  brow.position.set(0, 1.5, -0.03);
  const muzzle = part(new THREE.SphereGeometry(0.105, 12, 10), face);
  muzzle.position.set(0, 1.43, 0.0);
  muzzle.scale.set(1.05, 0.72, 0.95);
  for (const s of [-1, 1]) {
    const eye = part(new THREE.SphereGeometry(0.022, 8, 8), dark);
    eye.position.set(s * 0.062, 1.52, -0.02);
    const ear = part(new THREE.SphereGeometry(0.045, 8, 8), fur);
    ear.position.set(s * 0.16, 1.5, -0.19);
    ear.scale.set(0.5, 1, 1);
  }
  // Open-face shell, sitting on top of the skull and stopping above the brow.
  const lid = part(new THREE.SphereGeometry(0.185, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.58), helmet);
  lid.position.set(0, 1.5, -0.16);
  const peak = part(new THREE.BoxGeometry(0.3, 0.03, 0.13), dark);
  peak.position.set(0, 1.56, -0.03);
  peak.rotation.x = 0.12;

  // ------------------------------------------------------------- the arms
  // Long and thick, elbows out because there is no room to bring them in.
  for (const s of [-1, 1]) {
    const upper = part(new THREE.CylinderGeometry(0.085, 0.072, 0.34, 10), leather);
    upper.position.set(s * 0.31, 1.13, -0.11);
    upper.rotation.set(-0.7, 0, s * 0.34);
    const fore = part(new THREE.CylinderGeometry(0.068, 0.055, 0.36, 10), leather);
    fore.position.set(s * 0.33, 0.95, 0.23);
    fore.rotation.set(-1.22, 0, s * 0.16);
    // The cuff gave up: a ring of fur before the glove starts.
    const cuff = part(new THREE.CylinderGeometry(0.062, 0.058, 0.07, 10), fur);
    cuff.position.set(s * 0.32, 0.87, 0.38);
    cuff.rotation.set(-1.22, 0, s * 0.16);
    // Measured onto the grip rather than guessed: at (0.31, 0.87, 0.44) the
    // glove closed on thin air seven centimetres above and behind the bar.
    const hand = part(new THREE.BoxGeometry(0.1, 0.09, 0.12), glove);
    hand.position.set(s * 0.3, 0.81, 0.49);
  }

  // ------------------------------------------------------------- the legs
  // Short, and splayed wide: the knee never gets near the tank recess it was
  // designed for.
  for (const s of [-1, 1]) {
    const thigh = part(new THREE.CylinderGeometry(0.115, 0.09, 0.3, 10), strained);
    thigh.position.set(s * 0.21, 0.83, -0.35);
    thigh.rotation.set(0.62, 0, s * 0.42);
    const shin = part(new THREE.CylinderGeometry(0.075, 0.06, 0.3, 10), leather);
    shin.position.set(s * 0.27, 0.6, -0.3);
    shin.rotation.set(-0.42, 0, s * 0.14);
    // Same story at the ankle.
    const sock = part(new THREE.CylinderGeometry(0.062, 0.058, 0.06, 10), fur);
    sock.position.set(s * 0.25, 0.48, -0.27);
    const boot = part(new THREE.BoxGeometry(0.11, 0.09, 0.21), glove);
    boot.position.set(s * 0.25, 0.43, -0.23);
  }

  return g;
}

/** The rear paddock stand the showroom bike sits on. */
function buildStand(
  keep: <T extends { dispose(): void }>(x: T) => T,
  carbon: THREE.Material,
  paint: THREE.Material,
): THREE.Group {
  const stand = new THREE.Group();
  const part = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
    const mesh = new THREE.Mesh(keep(geo), mat);
    stand.add(mesh);
    return mesh;
  };
  const crossbar = part(new THREE.CylinderGeometry(0.022, 0.022, 0.54, 10), carbon);
  crossbar.position.set(0, 0.1, -1.02);
  crossbar.rotation.z = Math.PI / 2;
  for (const s of [-1, 1]) {
    const armBar = part(new THREE.BoxGeometry(0.035, 0.035, 0.46), carbon);
    armBar.position.set(s * 0.22, 0.2, -0.82);
    armBar.rotation.x = 0.4636;
    const hook = part(new THREE.CylinderGeometry(0.026, 0.026, 0.05, 10), paint);
    hook.position.set(s * 0.2, 0.31, -0.61);
    hook.rotation.z = Math.PI / 2;
    const castor = part(new THREE.CylinderGeometry(0.038, 0.038, 0.028, 12), carbon);
    castor.position.set(s * 0.27, 0.038, -1.02);
    castor.rotation.z = Math.PI / 2;
  }
  const handle = part(new THREE.CylinderGeometry(0.018, 0.018, 0.38, 10), carbon);
  handle.position.set(0, 0.27, -1.14);
  handle.rotation.x = -0.45;
  return stand;
}
