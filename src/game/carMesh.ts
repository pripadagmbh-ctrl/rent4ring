import * as THREE from 'three';
import type { Car } from '../data/fleet';
import { logoTexture } from './world';

export interface CarMesh {
  group: THREE.Group;
  wheels: THREE.Object3D[];
  frontWheels: THREE.Object3D[];
  brakeLights: THREE.Mesh;
  /** Apply 0–1 bodywork damage: paint dulls, panels sag, glass crazes. */
  setDamage(amount: number): void;
  dispose(): void;
}

interface Options {
  ghost?: boolean;
}

/**
 * Bodies are lofted, not boxed: a rounded-rectangle cross-section is swept
 * along the car with per-station width, belt and roof profiles, then smooth
 * normals give the panels soft, moulded edges. Each car gets its own
 * silhouette — bonnet length, cabin position, haunches, deck height — so a
 * MINI reads as a MINI and a 911 as a 911.
 */
export function buildCarMesh(car: Car, options: Options = {}): CarMesh {
  const [length, width, height] = car.size;
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const damageTargets: {
    mesh: THREE.Mesh;
    baseY: number;
    baseRot: THREE.Euler;
    baseScale: THREE.Vector3;
    /** 0 for the hull, towards 1 for the small bolt-on parts. */
    fragility: number;
  }[] = [];

  const shape = SHAPES[car.id] ?? DEFAULT_SHAPE;
  const P = shape.profile;

  // Paint keeps metalness moderate on purpose: PBR metal is lit almost
  // entirely by the environment map, and on GPUs where the PMREM pass
  // silently fails (no half-float render targets — seen on an Intel HD 5500)
  // a high-metalness body renders pitch black. At 0.3 the diffuse term
  // carries the colour on any hardware and the envMap remains a bonus.
  const bodyMat = new THREE.MeshStandardMaterial({
    color: car.color,
    roughness: 0.3,
    metalness: 0.3,
  });
  const accentMat = new THREE.MeshStandardMaterial({ color: car.accent, roughness: 0.38, metalness: 0.35 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x15181c, roughness: 0.55, metalness: 0.3 });
  // Opaque, deeply tinted glass. Transparent glass here looked see-through in
  // the worst way: there is no interior behind it, so the view continued
  // through the backface-culled far side of the hull and out into the scene —
  // the whole car read as hollow from behind. Racing tint hides all of that
  // and sorts correctly against every other surface.
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x0b1015,
    roughness: 0.05,
    metalness: 0.4,
    envMapIntensity: 1.5,
  });
  const tyreMat = new THREE.MeshStandardMaterial({ color: 0x131313, roughness: 0.95 });
  const rimMat = new THREE.MeshStandardMaterial({
    color: shape.rimColor ?? 0xc8ccd2,
    roughness: 0.3,
    metalness: 0.5,
  });
  const caliperMat = new THREE.MeshStandardMaterial({ color: 0xd8262f, roughness: 0.5 });
  disposables.push(bodyMat, accentMat, trimMat, glassMat, tyreMat, rimMat, caliperMat);

  const add = (mesh: THREE.Mesh, damageable = false) => {
    group.add(mesh);
    if (damageable) {
      // Small parts take the worst of it. A splitter, a grille or a headlight
      // is knocked askew by a shunt that only creases the hull, and moving
      // every panel by the same amount was why the damage read as a slightly
      // grubby car rather than a broken one. Measured off the geometry at
      // build time so the call sites stay a plain boolean.
      mesh.geometry.computeBoundingBox();
      const box = mesh.geometry.boundingBox;
      const span = box ? box.max.z - box.min.z : length;
      const fragility = THREE.MathUtils.clamp(1 - span / length, 0, 1);
      damageTargets.push({
        mesh,
        baseY: mesh.position.y,
        baseRot: mesh.rotation.clone(),
        baseScale: mesh.scale.clone(),
        fragility,
      });
    }
    return mesh;
  };

  // ------------------------------------------------------------- the hull
  // Lower body: floor to beltline, swept nose to tail.
  const hullGeo = loft(
    length,
    (t) => (width / 2) * P.plan(t),
    (t) => height * P.floor(t),
    (t) => height * P.belt(t),
    0.62,
    36,
    14,
  );
  const hull = new THREE.Mesh(hullGeo, bodyMat);
  add(hull, true);
  disposables.push(hullGeo);

  // Greenhouse: beltline to roofline over the cabin span, in glass.
  const cabinGeo = loft(
    length,
    (t) => (width / 2) * P.plan(t) * P.cabinPlan(t),
    (t) => height * P.belt(t) - 0.02,
    (t) => height * Math.max(P.roof(t), P.belt(t) + 0.015),
    0.85,
    30,
    10,
    P.cabinSpan,
  );
  const cabin = new THREE.Mesh(cabinGeo, glassMat);
  add(cabin, true);
  disposables.push(cabinGeo);

  // Roof cap in body colour (skipped on the open Spyder). The MINI wears its
  // trademark contrast roof in the accent colour instead.
  if (!shape.openTop) {
    const roofGeo = loft(
      length,
      (t) => (width / 2) * P.plan(t) * P.cabinPlan(t) * 0.97,
      (t) => height * Math.max(P.roof(t) - 0.045, P.belt(t)),
      (t) => height * Math.max(P.roof(t), P.belt(t) + 0.01),
      0.9,
      24,
      6,
      [P.cabinSpan[0] + 0.06, P.cabinSpan[1] - 0.02],
    );
    const roof = new THREE.Mesh(roofGeo, shape.roofAccent ? accentMat : bodyMat);
    add(roof, true);
    disposables.push(roofGeo);
  } else {
    const hoopGeo = new THREE.TorusGeometry(0.19, 0.045, 8, 14, Math.PI);
    disposables.push(hoopGeo);
    for (const dx of [-0.3, 0.3]) {
      const hoop = new THREE.Mesh(hoopGeo, trimMat);
      hoop.position.set(dx * width, height * 0.78, -length * 0.08);
      group.add(hoop);
    }
    // The Spyder's humps: body-colour cowls flowing back from the hoops.
    const humpGeo = new THREE.SphereGeometry(0.17, 12, 8);
    disposables.push(humpGeo);
    for (const dx of [-0.3, 0.3]) {
      const hump = new THREE.Mesh(humpGeo, bodyMat);
      hump.scale.set(0.85, 0.65, 1.7);
      hump.position.set(dx * width, height * 0.6, -length * 0.16);
      add(hump, true);
    }
  }

  // Door mirrors at the base of the A-pillars — small, but half of what makes
  // a silhouette read as a road car at all.
  {
    const tFront = P.cabinSpan[1];
    const mirrorZ = (tFront * length) / 2 - 0.06;
    const mirrorX = (width / 2) * P.plan(tFront);
    const mirrorY = height * (P.belt(tFront) + 0.1);
    const armGeo = new THREE.BoxGeometry(0.1, 0.022, 0.035);
    const shellGeo = new THREE.BoxGeometry(0.055, 0.085, 0.15);
    disposables.push(armGeo, shellGeo);
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(armGeo, trimMat);
      arm.position.set(side * (mirrorX + 0.04), mirrorY, mirrorZ);
      group.add(arm);
      const shell = new THREE.Mesh(shellGeo, bodyMat);
      shell.position.set(side * (mirrorX + 0.1), mirrorY + 0.02, mirrorZ);
      add(shell, true);
    }
  }

  // Wheel-arch shadows: dark discs tucked behind each wheel opening.
  const archGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.05, 18, 1, false, 0, Math.PI);
  disposables.push(archGeo);
  const halfBase = car.wheelbase / 2;
  for (const z of [halfBase, -halfBase]) {
    for (const side of [-1, 1]) {
      const arch = new THREE.Mesh(archGeo, trimMat);
      arch.position.set(side * (width / 2 - 0.05), 0.34, z);
      arch.rotation.z = Math.PI / 2;
      arch.rotation.y = side > 0 ? 0 : Math.PI;
      group.add(arch);
    }
  }

  // --------------------------------------------------------- nose and tail
  const splitterGeo = new THREE.BoxGeometry(width * 0.98, 0.05, length * 0.1);
  const splitter = new THREE.Mesh(splitterGeo, trimMat);
  splitter.position.set(0, height * 0.09, length * 0.45);
  add(splitter, true);
  disposables.push(splitterGeo);

  const diffuserGeo = new THREE.BoxGeometry(width * 0.88, height * 0.13, length * 0.08);
  const diffuser = new THREE.Mesh(diffuserGeo, trimMat);
  diffuser.position.set(0, height * 0.13, -length * 0.455);
  add(diffuser, true);
  disposables.push(diffuserGeo);

  const grilleGeo = new THREE.BoxGeometry(width * 0.5, height * 0.12, 0.05);
  const grille = new THREE.Mesh(grilleGeo, trimMat);
  grille.position.set(0, height * 0.24, length * 0.492);
  add(grille, true);
  disposables.push(grilleGeo);

  // Tailpipes — centre-exit pair or one per corner; the Taycan gets none.
  if (!car.electric) {
    const tipGeo = new THREE.CylinderGeometry(0.048, 0.054, 0.14, 12);
    const tipMat = new THREE.MeshStandardMaterial({ color: 0x3f444b, roughness: 0.35, metalness: 0.8 });
    disposables.push(tipGeo, tipMat);
    const xs = shape.exhaust === 'centre' ? [-0.07, 0.07] : [-width * 0.3, width * 0.3];
    for (const x of xs) {
      const tip = new THREE.Mesh(tipGeo, tipMat);
      tip.rotation.x = Math.PI / 2;
      tip.position.set(x, height * 0.16, -length * 0.485);
      group.add(tip);
    }
  }

  // ------------------------------------------------------------- rear wing
  if (shape.wing !== 'none') {
    const span = width * 0.95;
    const wingGeo = new THREE.BoxGeometry(span, 0.05, shape.wing === 'gt' ? 0.4 : 0.26);
    const wing = new THREE.Mesh(wingGeo, shape.wing === 'gt' ? accentMat : trimMat);
    // The GT wing stands on its stays; the lip is a ducktail and must sit ON
    // the rear deck — floated at a fixed fraction of overall height it hovered
    // in mid-air over the low-tailed cars.
    const wingY =
      shape.wing === 'gt' ? height * 1.04 : height * (P.belt(-0.92) + 0.05);
    wing.position.set(0, wingY, -length * (shape.wing === 'gt' ? 0.42 : 0.46));
    wing.rotation.x = -0.13;
    add(wing, true);
    disposables.push(wingGeo);

    if (shape.wing === 'gt') {
      const stayGeo = new THREE.BoxGeometry(0.05, wingY - height * 0.6, 0.2);
      const plateGeo = new THREE.BoxGeometry(0.05, 0.24, 0.44);
      disposables.push(stayGeo, plateGeo);
      for (const side of [-1, 1]) {
        const stay = new THREE.Mesh(stayGeo, trimMat);
        stay.position.set(side * span * 0.35, (wingY + height * 0.6) / 2, -length * 0.42);
        group.add(stay);
        const plate = new THREE.Mesh(plateGeo, accentMat);
        plate.position.set(side * span * 0.5, wingY, -length * 0.42);
        group.add(plate);
      }
    }
  }

  // ---------------------------------------------------------------- lights
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff3d0 });
  const headGeo = new THREE.SphereGeometry(0.09, 10, 8);
  disposables.push(headGeo, headMat);
  for (const side of [-1, 1]) {
    const h = new THREE.Mesh(headGeo, headMat);
    // Round bug-eyes on the MINI, swept ovals on everything else.
    if (shape.roundLamps) h.scale.set(1.15, 1.15, 0.6);
    else h.scale.set(1.7, 0.8, 0.6);
    h.position.set(side * width * 0.32, height * 0.36, length * 0.47);
    add(h, true);
  }

  const brakeGeo = new THREE.BoxGeometry(width * 0.76, height * 0.055, 0.05);
  const brakeMat = new THREE.MeshBasicMaterial({ color: 0x3a0806 });
  const brakeLights = new THREE.Mesh(brakeGeo, brakeMat);
  brakeLights.position.set(0, height * 0.5, -length * 0.478);
  add(brakeLights, true);
  disposables.push(brakeGeo, brakeMat);

  // ------------------------------------------------------- Rent4Ring livery
  if (!options.ghost) {
    const liveryMat = new THREE.MeshBasicMaterial({
      map: logoTexture(null),
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    disposables.push(liveryMat, liveryMat.map!);

    // Door decals, angled to the body side.
    const doorGeo = new THREE.PlaneGeometry(length * 0.28, length * 0.28 * (176 / 512));
    disposables.push(doorGeo);
    for (const side of [-1, 1]) {
      const decal = new THREE.Mesh(doorGeo, liveryMat);
      decal.position.set(side * (width / 2 - 0.015), height * 0.42, length * 0.03);
      decal.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      decal.rotation.x = side > 0 ? -0.13 : 0.13;
      decal.renderOrder = 4;
      group.add(decal);
    }

    // Bonnet decal.
    const bonnetGeo = new THREE.PlaneGeometry(width * 0.5, width * 0.5 * (176 / 512));
    disposables.push(bonnetGeo);
    const bonnet = new THREE.Mesh(bonnetGeo, liveryMat);
    bonnet.position.set(0, height * (P.belt(0.62) + 0.012), length * 0.31);
    bonnet.rotation.x = -Math.PI / 2 + 0.09;
    bonnet.renderOrder = 4;
    group.add(bonnet);

    // The Supra carries its anime co-driver on both flanks.
    if (shape.itasha) {
      const animeMat = new THREE.MeshBasicMaterial({
        map: itashaTexture(),
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      });
      disposables.push(animeMat, animeMat.map!);
      const animeGeo = new THREE.PlaneGeometry(length * 0.44, length * 0.44 * 0.62);
      disposables.push(animeGeo);
      for (const side of [-1, 1]) {
        const wrap = new THREE.Mesh(animeGeo, animeMat);
        wrap.position.set(side * (width / 2 - 0.012), height * 0.4, -length * 0.16);
        wrap.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
        if (side < 0) wrap.scale.x = -1; // she faces forwards on both sides
        wrap.renderOrder = 5;
        group.add(wrap);
      }
    } else {
      // Racing stripe for everyone else.
      const stripeGeo = new THREE.PlaneGeometry(width * 0.1, length * 0.9);
      const stripeMat = new THREE.MeshStandardMaterial({
        color: car.accent,
        roughness: 0.35,
        metalness: 0.3,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      });
      disposables.push(stripeGeo, stripeMat);
      const stripe = new THREE.Mesh(stripeGeo, stripeMat);
      stripe.position.set(0, height * (P.belt(0) + 0.013), 0);
      stripe.rotation.x = -Math.PI / 2;
      stripe.renderOrder = 3;
      group.add(stripe);
    }

    // Start number roundel.
    const numberMat = numberMaterial(shape.raceNumber ?? '4');
    disposables.push(numberMat, numberMat.map!);
    const numGeo = new THREE.PlaneGeometry(0.5, 0.5);
    disposables.push(numGeo);
    for (const side of [-1, 1]) {
      const num = new THREE.Mesh(numGeo, numberMat);
      num.position.set(side * (width / 2 - 0.015), height * 0.45, length * 0.28);
      num.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      num.rotation.x = side > 0 ? -0.12 : 0.12;
      num.renderOrder = 5;
      group.add(num);
    }
  }

  // ---------------------------------------------------------------- wheels
  const wheelRadius = 0.34;
  const tyreWidth = car.grip > 1.25 ? 0.33 : 0.26;
  const tyreGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, tyreWidth, 22);
  // A dark barrel behind the spokes gives the wheel visual depth.
  const rimGeo = new THREE.CylinderGeometry(wheelRadius * 0.62, wheelRadius * 0.62, tyreWidth - 0.06, 14);
  // Long axis along y: the tyre cylinder is rotated onto the x-axis, so a
  // y-long box stands in the wheel face and rotating about x fans the five
  // spokes radially (axis-parallel boxes all collapsed onto each other).
  const spokeGeo = new THREE.BoxGeometry(0.035, wheelRadius * 1.16, 0.055);
  const hubGeo = new THREE.CylinderGeometry(wheelRadius * 0.16, wheelRadius * 0.16, 0.03, 10);
  const caliperGeo = new THREE.BoxGeometry(0.07, 0.2, 0.11);
  const barrelMat = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.7, metalness: 0.3 });
  disposables.push(tyreGeo, rimGeo, spokeGeo, hubGeo, caliperGeo, barrelMat);

  const wheels: THREE.Object3D[] = [];
  const frontWheels: THREE.Object3D[] = [];
  const rearExtra = car.drivetrain === 'RWD' ? 0.03 : 0;

  for (const [zi, z] of [halfBase, -halfBase].entries()) {
    for (const side of [-1, 1]) {
      const isRear = zi === 1;
      const pivot = new THREE.Object3D();
      pivot.position.set(side * (width / 2 - tyreWidth * 0.42 + (isRear ? rearExtra : 0)), wheelRadius, z);

      const spin = new THREE.Object3D();
      const tyre = new THREE.Mesh(tyreGeo, tyreMat);
      tyre.rotation.z = Math.PI / 2;
      if (isRear) tyre.scale.set(1, 1 + rearExtra * 2, 1);
      const barrel = new THREE.Mesh(rimGeo, barrelMat);
      barrel.rotation.z = Math.PI / 2;
      spin.add(tyre, barrel);
      // Spokes and hub sit at the outboard face of the rim, not buried in it.
      const face = side * (tyreWidth / 2 - 0.02);
      for (let s = 0; s < 5; s++) {
        const spoke = new THREE.Mesh(spokeGeo, rimMat);
        spoke.rotation.x = (s / 5) * Math.PI;
        spoke.position.x = face;
        spin.add(spoke);
      }
      const hub = new THREE.Mesh(hubGeo, rimMat);
      hub.rotation.z = Math.PI / 2;
      hub.position.x = face;
      spin.add(hub);
      pivot.add(spin);

      const caliper = new THREE.Mesh(caliperGeo, caliperMat);
      caliper.position.set(side * -0.02, 0.16, 0);
      pivot.add(caliper);

      group.add(pivot);
      wheels.push(spin);
      if (!isRear) frontWheels.push(pivot);
    }
  }

  // ------------------------------------------------------------ ghost pass
  if (options.ghost) {
    group.traverse((obj) => {
      const m = obj as THREE.Mesh;
      if (!m.material) return;
      const mat = m.material as THREE.Material;
      mat.transparent = true;
      mat.opacity = 0.32;
      mat.depthWrite = false;
    });
  }

  // ---------------------------------------------------------------- damage
  let currentDamage = -1;
  const setDamage = (amount: number) => {
    const d = Math.max(0, Math.min(1, amount));
    if (Math.abs(d - currentDamage) < 0.01) return;
    currentDamage = d;
    if (options.ghost) return;

    // Paint goes past dull and into bare, scuffed panel: further towards grey,
    // rough, and with the metallic flake gone. A wrecked car should not still
    // be catching the light like a showroom one.
    const base = new THREE.Color(car.color);
    bodyMat.color.copy(base.clone().lerp(new THREE.Color(0x3c3a38), d * 0.78));
    bodyMat.roughness = 0.3 + d * 0.62;
    bodyMat.metalness = 0.3 - d * 0.26;
    // Crazed glass goes matte and milky rather than more see-through.
    glassMat.roughness = 0.05 + d * 0.85;
    glassMat.color.setHex(0x0b1015).lerp(new THREE.Color(0x8f959c), d * 0.7);

    damageTargets.forEach((target, i) => {
      // Deterministic per part, so a given car always crumples the same way.
      const wobble = ((i * 2654435761) % 1000) / 1000 - 0.5;
      const bite = d * (0.35 + target.fragility * 1.15);

      target.mesh.position.y = target.baseY - bite * 0.075 * (0.5 + Math.abs(wobble));
      target.mesh.rotation.set(
        target.baseRot.x + wobble * bite * 0.22,
        target.baseRot.y + wobble * bite * 0.16,
        target.baseRot.z + wobble * bite * 0.26,
      );
      // Crumpled panels are shorter. A few per cent is enough to break the
      // silhouette's straight lines, which is what the eye actually reads.
      const squash = 1 - bite * 0.07 * (0.5 + Math.abs(wobble));
      target.mesh.scale.set(
        target.baseScale.x * (1 + bite * 0.03 * wobble),
        target.baseScale.y * squash,
        target.baseScale.z * squash,
      );
    });
  };
  setDamage(0);

  return {
    group,
    wheels,
    frontWheels,
    brakeLights,
    setDamage,
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}

// =====================================================================
// Lofting
// =====================================================================

/** sign(u) * |u|^k — turns a rectangle into a soft superellipse. */
function softSign(u: number, k: number): number {
  return Math.sign(u) * Math.pow(Math.abs(u), k);
}

/**
 * Sweep a rounded cross-section along z. `t` runs 1 (nose) to -1 (tail);
 * `halfWidth(t)`, `bottom(t)` and `top(t)` shape each station. `roundness`
 * < 1 softens the corners; `span` restricts the sweep to part of the car.
 */
export function loft(
  length: number,
  halfWidth: (t: number) => number,
  bottom: (t: number) => number,
  top: (t: number) => number,
  roundness: number,
  radialSegs: number,
  lengthSegs: number,
  span: [number, number] = [-1, 1],
): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const ring = radialSegs + 1;

  for (let i = 0; i <= lengthSegs; i++) {
    const f = i / lengthSegs;
    const t = span[0] + (span[1] - span[0]) * f;
    const z = (t * length) / 2;
    const w = Math.max(halfWidth(t), 0.02);
    const yLo = bottom(t);
    const yHi = Math.max(top(t), yLo + 0.01);
    const yc = (yLo + yHi) / 2;
    const hh = (yHi - yLo) / 2;

    for (let j = 0; j <= radialSegs; j++) {
      const a = (j / radialSegs) * Math.PI * 2;
      const x = w * softSign(Math.cos(a), roundness);
      const y = yc + hh * softSign(Math.sin(a), roundness);
      positions.push(x, y, z);
    }
  }

  // Verified experimentally (red + DoubleSide in the live scene): this winding
  // faces outward. The "transparent car" bug was never the winding — it was
  // metallic paint with no environment map, which shades like dark glass.
  for (let i = 0; i < lengthSegs; i++) {
    for (let j = 0; j < radialSegs; j++) {
      const a = i * ring + j;
      const b = a + 1;
      const c = a + ring;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  // End caps.
  const capCentre = (i: number, z: number, y: number) => {
    const centreIdx = positions.length / 3;
    positions.push(0, y, z);
    for (let j = 0; j < radialSegs; j++) {
      const a = i * ring + j;
      const b = i * ring + j + 1;
      if (z > 0) indices.push(centreIdx, a, b);
      else indices.push(centreIdx, b, a);
    }
    return centreIdx;
  };
  {
    const tN = span[1];
    const tT = span[0];
    capCentre(lengthSegs, (tN * length) / 2, (bottom(tN) + top(tN)) / 2);
    capCentre(0, (tT * length) / 2, (bottom(tT) + top(tT)) / 2);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** Piecewise-smooth profile through [t, value] control points (cosine eased). */
export function curve(points: [number, number][]): (t: number) => number {
  return (t: number) => {
    if (t <= points[0][0]) return points[0][1];
    for (let i = 0; i < points.length - 1; i++) {
      const [t0, v0] = points[i];
      const [t1, v1] = points[i + 1];
      if (t >= t0 && t <= t1) {
        const f = (t - t0) / (t1 - t0);
        const s = 0.5 - 0.5 * Math.cos(f * Math.PI);
        return v0 + (v1 - v0) * s;
      }
    }
    return points[points.length - 1][1];
  };
}

// =====================================================================
// Per-car silhouettes. t runs -1 (tail) to +1 (nose); heights are fractions
// of the car's overall height, widths fractions of its half-width.
// =====================================================================
interface Profile {
  /** Plan-view half-width factor along the car. */
  plan: (t: number) => number;
  /** Underside of the body. */
  floor: (t: number) => number;
  /** Beltline — top of the lower body. */
  belt: (t: number) => number;
  /** Roofline over the cabin. */
  roof: (t: number) => number;
  /** Cabin narrowing (tumblehome) along the car. */
  cabinPlan: (t: number) => number;
  /** Where the greenhouse starts and ends, in t. */
  cabinSpan: [number, number];
}

interface Shape {
  profile: Profile;
  wing: 'none' | 'lip' | 'gt';
  openTop?: boolean;
  itasha?: boolean;
  rimColor?: number;
  raceNumber?: string;
  /** Contrast roof in the accent colour (the MINI look). */
  roofAccent?: boolean;
  /** Tailpipe arrangement; EVs get none regardless. */
  exhaust?: 'dual' | 'centre';
  /** Round lamps instead of the swept ovals (the MINI face). */
  roundLamps?: boolean;
}

function makeProfile(spec: {
  planPts: [number, number][];
  beltPts: [number, number][];
  roofPts: [number, number][];
  cabinSpan: [number, number];
  cabinWidth?: number;
}): Profile {
  const plan = curve(spec.planPts);
  const belt = curve(spec.beltPts);
  const roof = curve(spec.roofPts);
  const cabinW = spec.cabinWidth ?? 0.86;
  return {
    plan,
    floor: curve([
      [-1, 0.22],
      [-0.75, 0.1],
      [0.75, 0.1],
      [1, 0.2],
    ]),
    belt,
    roof,
    cabinPlan: () => cabinW,
    cabinSpan: spec.cabinSpan,
  };
}

const DEFAULT_SHAPE: Shape = {
  profile: makeProfile({
    planPts: [
      [-1, 0.55],
      [-0.8, 0.92],
      [-0.35, 1],
      [0.4, 0.97],
      [0.85, 0.82],
      [1, 0.5],
    ],
    beltPts: [
      [-1, 0.5],
      [-0.55, 0.56],
      [0, 0.52],
      [0.6, 0.44],
      [1, 0.34],
    ],
    roofPts: [
      [-1, 0.5],
      [-0.6, 0.62],
      [-0.25, 0.95],
      [0.1, 1.0],
      [0.42, 0.62],
      [1, 0.34],
    ],
    cabinSpan: [-0.55, 0.42],
  }),
  wing: 'lip',
};

const SHAPES: Record<string, Shape> = {
  // MINI: short, tall, upright glasshouse, wheels at the corners.
  'mini-cooper-s': {
    profile: makeProfile({
      planPts: [
        [-1, 0.72],
        [-0.85, 0.97],
        [0, 1],
        [0.85, 0.97],
        [1, 0.72],
      ],
      beltPts: [
        [-1, 0.58],
        [0, 0.56],
        [1, 0.5],
      ],
      roofPts: [
        [-1, 0.6],
        [-0.72, 0.98],
        [0.35, 1.0],
        [0.55, 0.72],
        [1, 0.52],
      ],
      cabinSpan: [-0.72, 0.52],
      cabinWidth: 0.9,
    }),
    wing: 'lip',
    rimColor: 0xf2f2f2,
    raceNumber: '17',
    roofAccent: true,
    roundLamps: true,
    exhaust: 'centre',
  },
  // GR Yaris: chunky hot hatch, fast windscreen, wide hips.
  'gr-yaris': {
    profile: makeProfile({
      planPts: [
        [-1, 0.68],
        [-0.8, 1],
        [-0.3, 0.96],
        [0.5, 0.95],
        [0.88, 0.88],
        [1, 0.62],
      ],
      beltPts: [
        [-1, 0.58],
        [-0.7, 0.62],
        [0.2, 0.54],
        [1, 0.44],
      ],
      roofPts: [
        [-1, 0.6],
        [-0.62, 0.96],
        [-0.1, 1.0],
        [0.45, 0.68],
        [1, 0.46],
      ],
      cabinSpan: [-0.62, 0.45],
      cabinWidth: 0.88,
    }),
    wing: 'lip',
    rimColor: 0x1c1c20,
    raceNumber: '32',
  },
  // Supra: long bonnet, cab rearward, double-bubble roof, ducktail.
  'gr-supra': {
    profile: makeProfile({
      planPts: [
        [-1, 0.6],
        [-0.82, 0.98],
        [-0.4, 1],
        [0.3, 0.93],
        [0.8, 0.85],
        [1, 0.52],
      ],
      beltPts: [
        [-1, 0.56],
        [-0.6, 0.6],
        [0.1, 0.5],
        [0.7, 0.42],
        [1, 0.32],
      ],
      roofPts: [
        [-1, 0.58],
        [-0.72, 0.7],
        [-0.35, 0.98],
        [-0.05, 1.0],
        [0.35, 0.6],
        [1, 0.33],
      ],
      cabinSpan: [-0.66, 0.35],
      cabinWidth: 0.82,
    }),
    wing: 'lip',
    itasha: true,
    rimColor: 0x33363b,
    raceNumber: '90',
  },
  // Taycan: very long, very low four-door with a fastback tail.
  'taycan-turbo-gt': {
    profile: makeProfile({
      planPts: [
        [-1, 0.66],
        [-0.8, 0.96],
        [-0.3, 1],
        [0.5, 0.96],
        [0.9, 0.85],
        [1, 0.6],
      ],
      beltPts: [
        [-1, 0.52],
        [-0.5, 0.56],
        [0.3, 0.5],
        [1, 0.36],
      ],
      roofPts: [
        [-1, 0.52],
        [-0.75, 0.72],
        [-0.3, 0.98],
        [0.05, 1.0],
        [0.5, 0.62],
        [1, 0.37],
      ],
      cabinSpan: [-0.72, 0.5],
      cabinWidth: 0.86,
    }),
    wing: 'lip',
    rimColor: 0x1f1f24,
    raceNumber: '99',
  },
  // 718 Spyder RS: mid-engined roadster, low glass, humps behind the seats.
  '718-spyder-rs': {
    profile: makeProfile({
      planPts: [
        [-1, 0.62],
        [-0.75, 0.99],
        [-0.25, 1],
        [0.45, 0.94],
        [0.85, 0.84],
        [1, 0.55],
      ],
      beltPts: [
        [-1, 0.55],
        [-0.55, 0.62],
        [0.1, 0.5],
        [0.65, 0.42],
        [1, 0.3],
      ],
      roofPts: [
        [-1, 0.56],
        [-0.5, 0.72],
        [-0.05, 0.9],
        [0.3, 0.62],
        [1, 0.31],
      ],
      cabinSpan: [-0.42, 0.3],
      cabinWidth: 0.78,
    }),
    wing: 'lip',
    openTop: true,
    rimColor: 0xd8ac52,
    raceNumber: '7',
  },
  // 911 GT3 RS: round nose, fastback, hips over the rear axle.
  '911-gt3-rs': {
    profile: makeProfile({
      planPts: [
        [-1, 0.7],
        [-0.75, 1],
        [-0.3, 0.97],
        [0.4, 0.9],
        [0.85, 0.82],
        [1, 0.58],
      ],
      beltPts: [
        [-1, 0.56],
        [-0.55, 0.62],
        [0.2, 0.5],
        [0.75, 0.42],
        [1, 0.34],
      ],
      roofPts: [
        [-1, 0.57],
        [-0.65, 0.74],
        [-0.2, 0.98],
        [0.08, 1.0],
        [0.45, 0.64],
        [1, 0.36],
      ],
      cabinSpan: [-0.6, 0.45],
      cabinWidth: 0.8,
    }),
    wing: 'gt',
    rimColor: 0x2f6fb2,
    raceNumber: '911',
    exhaust: 'centre',
  },
  // 296 GTB: cab forward, short tail, wide mid-engined hips.
  'ferrari-296-gtb': {
    profile: makeProfile({
      planPts: [
        [-1, 0.66],
        [-0.72, 1],
        [-0.2, 0.98],
        [0.45, 0.9],
        [0.85, 0.8],
        [1, 0.5],
      ],
      beltPts: [
        [-1, 0.55],
        [-0.5, 0.6],
        [0.15, 0.48],
        [0.7, 0.4],
        [1, 0.28],
      ],
      roofPts: [
        [-1, 0.56],
        [-0.55, 0.76],
        [-0.1, 0.98],
        [0.2, 0.86],
        [0.5, 0.55],
        [1, 0.29],
      ],
      cabinSpan: [-0.45, 0.42],
      cabinWidth: 0.76,
    }),
    wing: 'lip',
    rimColor: 0x1a1a1a,
    raceNumber: '296',
    exhaust: 'centre',
  },
};

// =====================================================================
// Decal textures
// =====================================================================
function numberMaterial(text: string): THREE.MeshBasicMaterial {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 256, 256);
  ctx.beginPath();
  ctx.arc(128, 128, 112, 0, Math.PI * 2);
  ctx.fillStyle = '#f2f2f2';
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#d81026';
  ctx.stroke();
  ctx.fillStyle = '#14181d';
  ctx.font = `bold ${text.length > 2 ? 96 : 136}px "Barlow Condensed", "Arial Narrow", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 136);
  return new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true });
}

/**
 * The Supra's itasha wrap: a stylised anime pin-up in a bikini top, drawn as
 * flat-shaded vector art with a magenta-cyan glow, plus lettering.
 */
function itashaTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 318;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Glow burst behind the figure.
  const burst = ctx.createRadialGradient(330, 160, 20, 330, 160, 190);
  burst.addColorStop(0, 'rgba(255,90,200,0.85)');
  burst.addColorStop(0.55, 'rgba(120,80,255,0.4)');
  burst.addColorStop(1, 'rgba(0,200,255,0)');
  ctx.fillStyle = burst;
  ctx.fillRect(90, 0, 422, 318);

  // Speed slashes.
  ctx.strokeStyle = 'rgba(0,220,255,0.8)';
  ctx.lineWidth = 7;
  for (const [x1, y1, x2, y2] of [
    [20, 60, 200, 40],
    [10, 120, 170, 105],
    [30, 250, 210, 262],
  ]) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  ctx.save();
  ctx.translate(330, 30);

  const skin = '#ffd9c0';
  const skinShade = '#f2b394';
  const hairA = '#7ce7ff';
  const hairB = '#3aa5d8';

  // Back hair, flowing off to the left.
  ctx.fillStyle = hairB;
  ctx.beginPath();
  ctx.moveTo(-10, 20);
  ctx.bezierCurveTo(-90, 40, -130, 120, -95, 210);
  ctx.bezierCurveTo(-60, 240, -20, 230, -5, 200);
  ctx.bezierCurveTo(-40, 150, -35, 70, 0, 35);
  ctx.closePath();
  ctx.fill();

  // Torso.
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.moveTo(18, 80);
  ctx.bezierCurveTo(-6, 105, -10, 150, 6, 185);
  ctx.bezierCurveTo(14, 205, 34, 218, 52, 214);
  ctx.bezierCurveTo(46, 188, 44, 165, 50, 140);
  ctx.bezierCurveTo(56, 115, 52, 92, 40, 78);
  ctx.closePath();
  ctx.fill();
  // Waist shading.
  ctx.fillStyle = skinShade;
  ctx.beginPath();
  ctx.moveTo(10, 150);
  ctx.bezierCurveTo(16, 175, 28, 195, 46, 208);
  ctx.bezierCurveTo(32, 210, 16, 198, 8, 180);
  ctx.closePath();
  ctx.fill();

  // Arm raised behind her head.
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.moveTo(30, 82);
  ctx.bezierCurveTo(52, 60, 74, 48, 92, 52);
  ctx.bezierCurveTo(96, 62, 90, 72, 78, 76);
  ctx.bezierCurveTo(60, 80, 46, 90, 40, 100);
  ctx.closePath();
  ctx.fill();

  // Bikini top.
  ctx.fillStyle = '#ff2d78';
  ctx.beginPath();
  ctx.moveTo(12, 108);
  ctx.bezierCurveTo(24, 96, 44, 96, 52, 110);
  ctx.bezierCurveTo(48, 128, 40, 136, 28, 138);
  ctx.bezierCurveTo(18, 130, 12, 120, 12, 108);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#c40d4e';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  // Straps.
  ctx.beginPath();
  ctx.moveTo(20, 104);
  ctx.lineTo(4, 84);
  ctx.moveTo(48, 104);
  ctx.lineTo(58, 86);
  ctx.stroke();

  // Shorts hem at the bottom edge of the wrap.
  ctx.fillStyle = '#2a2438';
  ctx.beginPath();
  ctx.moveTo(2, 188);
  ctx.bezierCurveTo(14, 208, 36, 222, 56, 218);
  ctx.lineTo(58, 246);
  ctx.bezierCurveTo(30, 252, 4, 236, -8, 210);
  ctx.closePath();
  ctx.fill();

  // Head.
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.ellipse(28, 46, 26, 28, -0.08, 0, Math.PI * 2);
  ctx.fill();

  // Front hair: big swept fringe with spikes.
  ctx.fillStyle = hairA;
  ctx.beginPath();
  ctx.moveTo(-6, 40);
  ctx.bezierCurveTo(-4, 8, 30, -4, 56, 12);
  ctx.bezierCurveTo(66, 20, 66, 34, 60, 44);
  ctx.lineTo(48, 30);
  ctx.lineTo(44, 48);
  ctx.lineTo(30, 32);
  ctx.lineTo(24, 52);
  ctx.lineTo(10, 36);
  ctx.lineTo(4, 54);
  ctx.closePath();
  ctx.fill();
  // Long side lock across the shoulder.
  ctx.beginPath();
  ctx.moveTo(56, 34);
  ctx.bezierCurveTo(70, 60, 68, 96, 56, 122);
  ctx.bezierCurveTo(50, 96, 48, 66, 50, 44);
  ctx.closePath();
  ctx.fill();

  // Face: one visible eye, brow, small mouth.
  ctx.fillStyle = '#241b2e';
  ctx.beginPath();
  ctx.ellipse(20, 48, 5.5, 8, -0.06, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#7c4dff';
  ctx.beginPath();
  ctx.ellipse(20, 50, 3.2, 4.6, -0.06, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(18.4, 45.5, 1.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#241b2e';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(12, 37);
  ctx.quadraticCurveTo(20, 33, 28, 36);
  ctx.stroke();
  ctx.strokeStyle = '#c96a5a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(20, 64);
  ctx.quadraticCurveTo(25, 67, 30, 64);
  ctx.stroke();
  // Blush.
  ctx.fillStyle = 'rgba(255,120,140,0.5)';
  ctx.beginPath();
  ctx.ellipse(12, 57, 5, 2.6, -0.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  // Lettering.
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#ff2d78';
  ctx.lineWidth = 5;
  ctx.font = 'italic 900 44px "Barlow Condensed", "Arial Narrow", sans-serif';
  ctx.textAlign = 'left';
  ctx.strokeText('MIDNIGHT', 18, 292);
  ctx.fillText('MIDNIGHT', 18, 292);
  ctx.font = 'italic 900 30px "Barlow Condensed", "Arial Narrow", sans-serif';
  ctx.strokeStyle = '#00c8ff';
  ctx.lineWidth = 4;
  ctx.strokeText('こうそくの女王', 22, 318);
  ctx.fillText('こうそくの女王', 22, 318);

  return new THREE.CanvasTexture(canvas);
}
