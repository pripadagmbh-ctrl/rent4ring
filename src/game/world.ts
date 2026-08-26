import * as THREE from 'three';
import type { Approach, RoadPath, Track } from './track';

export interface WorldHandles {
  root: THREE.Group;
  dispose(): void;
}

/** Sections where the Eifel forest crowds the track. */
const FOREST_SECTIONS = new Set([
  'Hatzenbach', 'Hocheichen', 'Fuchsröhre', 'Adenauer Forst', 'Metzgesfeld', 'Kallenhard',
  'Spiegelkurve', 'Dreifach-Rechts', 'Wehrseifen', 'Breidscheid', 'Exmühle', 'Bergwerk',
  'Kesselchen', 'Klostertal', 'Steilstrecke', 'Karussell', 'Hohe Acht', 'Wippermann',
  'Eschbach', 'Brünnchen', 'Eiskurve', 'Pflanzgarten', 'Stefan-Bellof-S', 'Schwalbenschwanz',
  'Mini-Karussell', 'Galgenkopf',
]);

// =====================================================================
// Shared geometry helpers
// =====================================================================

/** Edge point at `offset` metres beyond the asphalt edge on the given side. */
function edgeAt(road: RoadPath, i: number, side: number, offset: number, lift = 0): THREE.Vector3 {
  const p = road.at(i);
  const w = p.halfWidth + offset;
  const v = p.pos.clone().addScaledVector(p.normal, side * w);
  v.y += Math.sin(p.banking) * side * w + lift;
  return v;
}

/**
 * Build a ribbon between two per-point edge functions. Closed roads wrap back
 * to the first point; open ones stop at the last.
 */
function ribbon(
  road: RoadPath,
  inner: (i: number) => THREE.Vector3,
  outer: (i: number) => THREE.Vector3,
  material: THREE.Material,
  uvScale: number,
  disposables: { dispose(): void }[],
): THREE.Mesh {
  const n = road.count;
  const positions = new Float32Array(n * 2 * 3);
  const uvs = new Float32Array(n * 2 * 2);
  const indices: number[] = [];

  for (let i = 0; i < n; i++) {
    const A = inner(i);
    const B = outer(i);
    positions.set([A.x, A.y, A.z], i * 6);
    positions.set([B.x, B.y, B.z], i * 6 + 3);
    const s = road.at(i).s * uvScale;
    uvs.set([0, s], i * 4);
    uvs.set([1, s], i * 4 + 2);
  }

  const segments = road.closed ? n : n - 1;
  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % n;
    const a = i * 2;
    const b = i * 2 + 1;
    const c = j * 2;
    const d = j * 2 + 1;
    indices.push(a, b, c, b, d, c);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  disposables.push(geo);
  const mesh = new THREE.Mesh(geo, material);
  mesh.matrixAutoUpdate = false;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * One giant InstancedMesh defeats frustum culling: its bounding sphere spans
 * the whole 20 km lap, so every tree and rail renders every frame. Splitting
 * the matrices into spatial chunks lets three.js cull whole groups of them,
 * which is where most of the frame time was going.
 */
function instance(
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  matrices: THREE.Matrix4[],
  root: THREE.Group,
  chunkSize = 700,
): void {
  if (!matrices.length) return;
  // Matrices arrive in track order, so consecutive runs are spatially local.
  for (let start = 0; start < matrices.length; start += chunkSize) {
    const slice = matrices.slice(start, start + chunkSize);
    const inst = new THREE.InstancedMesh(geo, mat, slice.length);
    slice.forEach((m, i) => inst.setMatrixAt(i, m));
    inst.instanceMatrix.needsUpdate = true;
    inst.castShadow = true;
    inst.receiveShadow = true;
    inst.computeBoundingSphere();
    root.add(inst);
  }
}

// =====================================================================
// The circuit
// =====================================================================
export function buildWorld(track: Track, entranceIndex = -1): WorldHandles {
  const root = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const edge = (i: number, side: number, offset: number, lift = 0) => edgeAt(track, i, side, offset, lift);

  const asphaltMat = new THREE.MeshStandardMaterial({
    map: asphaltTexture(),
    color: 0x6a6a6e,
    roughness: 0.94,
  });
  const vergeMat = new THREE.MeshStandardMaterial({ color: 0x7d7f76, roughness: 1 });
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x577a3c, roughness: 1 });
  const outerMat = new THREE.MeshStandardMaterial({ color: 0x50713a, roughness: 1 });
  disposables.push(asphaltMat, vergeMat, grassMat, outerMat);

  const rib = (
    inner: (i: number) => THREE.Vector3,
    outer: (i: number) => THREE.Vector3,
    mat: THREE.Material,
    uv: number,
  ) => ribbon(track, inner, outer, mat, uv, disposables);

  root.add(rib((i) => edge(i, 1, 90, -14), (i) => edge(i, -1, 90, -14), outerMat, 0.004));
  root.add(rib((i) => edge(i, -1, 6, -0.35), (i) => edge(i, -1, 95, -13), grassMat, 0.02));
  root.add(rib((i) => edge(i, 1, 95, -13), (i) => edge(i, 1, 6, -0.35), grassMat, 0.02));
  root.add(rib((i) => edge(i, -1, 0.05, -0.02), (i) => edge(i, -1, 6.2, -0.4), vergeMat, 0.05));
  root.add(rib((i) => edge(i, 1, 6.2, -0.4), (i) => edge(i, 1, 0.05, -0.02), vergeMat, 0.05));

  const road = rib((i) => edge(i, 1, 0), (i) => edge(i, -1, 0), asphaltMat, 0.06);
  road.renderOrder = 1;
  root.add(road);

  const lineMat = new THREE.MeshBasicMaterial({ color: 0xe8e8e8, transparent: true, opacity: 0.72 });
  disposables.push(lineMat);
  for (const side of [1, -1]) {
    const line = rib((i) => edge(i, side, -0.32, 0.02), (i) => edge(i, side, -0.12, 0.02), lineMat, 0.05);
    line.renderOrder = 2;
    root.add(line);
  }

  buildKerbs(track, root, disposables);
  buildBarriers(track, root, disposables, entranceIndex);
  buildTrees(track, root, disposables);
  buildDistanceMarkers(track, root, disposables);
  buildStartLine(track, root, disposables);
  buildNuerburg(root, disposables);
  buildPetrolStation(root, disposables);
  if (entranceIndex >= 0) buildEntrance(track, entranceIndex, root, disposables);

  return { root, dispose: () => disposables.forEach((d) => d.dispose()) };
}

// =====================================================================
// The public-road approach from Burgstraße 1
// =====================================================================
export function buildApproachWorld(approach: Approach): WorldHandles {
  const root = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const edge = (i: number, side: number, offset: number, lift = 0) => edgeAt(approach, i, side, offset, lift);

  const asphaltMat = new THREE.MeshStandardMaterial({
    map: asphaltTexture(),
    color: 0x5d5f64,
    roughness: 0.95,
  });
  const kerbMat = new THREE.MeshStandardMaterial({ color: 0x9a9a94, roughness: 1 });
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x51733a, roughness: 1 });
  disposables.push(asphaltMat, kerbMat, grassMat);

  const rib = (
    inner: (i: number) => THREE.Vector3,
    outer: (i: number) => THREE.Vector3,
    mat: THREE.Material,
    uv: number,
  ) => ribbon(approach, inner, outer, mat, uv, disposables);

  root.add(rib((i) => edge(i, -1, 1.2, -0.12), (i) => edge(i, -1, 40, -3), grassMat, 0.02));
  root.add(rib((i) => edge(i, 1, 40, -3), (i) => edge(i, 1, 1.2, -0.12), grassMat, 0.02));
  root.add(rib((i) => edge(i, -1, 0, 0.01), (i) => edge(i, -1, 1.25, -0.1), kerbMat, 0.06));
  root.add(rib((i) => edge(i, 1, 1.25, -0.1), (i) => edge(i, 1, 0, 0.01), kerbMat, 0.06));

  const surface = rib((i) => edge(i, 1, 0), (i) => edge(i, -1, 0), asphaltMat, 0.06);
  surface.renderOrder = 1;
  root.add(surface);

  // Centre line, dashed the way a German Landstraße is marked.
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xf0f0f0 });
  const dashGeo = new THREE.PlaneGeometry(0.12, 2.6);
  disposables.push(dashMat, dashGeo);
  const dashes: THREE.Matrix4[] = [];
  const dummy = new THREE.Object3D();
  for (let i = 4; i < approach.count - 4; i += 3) {
    const p = approach.at(i);
    dummy.position.set(p.pos.x, p.pos.y + 0.02, p.pos.z);
    dummy.rotation.set(-Math.PI / 2, 0, -Math.atan2(p.tangent.x, p.tangent.z));
    dummy.updateMatrix();
    dashes.push(dummy.matrix.clone());
  }
  instance(dashGeo, dashMat, dashes, root);

  buildVillage(approach, root, disposables);
  buildHomeBase(approach, root, disposables);

  return { root, dispose: () => disposables.forEach((d) => d.dispose()) };
}

// =====================================================================
// Village houses along the approach
// =====================================================================
function buildVillage(approach: Approach, root: THREE.Group, disposables: { dispose(): void }[]): void {
  const wallGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofGeo = new THREE.ConeGeometry(0.78, 0.55, 4);
  const wallMats = [0xe8e4dc, 0xdcd6c8, 0xcfc9bd, 0xe0d8cc].map(
    (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.92 }),
  );
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x6b4a3a, roughness: 0.9 });
  const hedgeGeo = new THREE.BoxGeometry(1, 1, 1);
  const hedgeMat = new THREE.MeshStandardMaterial({ color: 0x38562b, roughness: 1 });
  disposables.push(wallGeo, roofGeo, roofMat, hedgeGeo, hedgeMat, ...wallMats);

  const walls: THREE.Matrix4[][] = wallMats.map(() => []);
  const roofs: THREE.Matrix4[] = [];
  const hedges: THREE.Matrix4[] = [];
  const dummy = new THREE.Object3D();

  let seed = 20250826;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  // Houses only line the first stretch — the village gives way to open Eifel.
  const villageEnd = Math.floor(approach.count * 0.55);
  for (let i = 4; i < villageEnd; i += 5) {
    for (const side of [1, -1]) {
      if (rand() > 0.62) continue;
      const p = approach.at(i);
      const off = p.halfWidth + 7 + rand() * 6;
      const pos = p.pos.clone().addScaledVector(p.normal, side * off);
      const yaw = Math.atan2(p.tangent.x, p.tangent.z) + (rand() - 0.5) * 0.25;

      const w = 7 + rand() * 4;
      const d = 8 + rand() * 4;
      const h = 5.5 + rand() * 3;

      dummy.position.set(pos.x, pos.y + h / 2 - 0.4, pos.z);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(w, h, d);
      dummy.updateMatrix();
      walls[Math.floor(rand() * walls.length)].push(dummy.matrix.clone());

      dummy.position.set(pos.x, pos.y + h - 0.4 + 1.4, pos.z);
      dummy.rotation.set(0, yaw + Math.PI / 4, 0);
      dummy.scale.set(w * 1.06, 5.2, d * 1.06);
      dummy.updateMatrix();
      roofs.push(dummy.matrix.clone());

      // Garden hedge along the road frontage.
      const hedgePos = p.pos.clone().addScaledVector(p.normal, side * (p.halfWidth + 2.4));
      dummy.position.set(hedgePos.x, hedgePos.y + 0.55, hedgePos.z);
      dummy.rotation.set(0, Math.atan2(p.tangent.x, p.tangent.z), 0);
      dummy.scale.set(0.7, 1.1, 22);
      dummy.updateMatrix();
      hedges.push(dummy.matrix.clone());
    }
  }

  wallMats.forEach((m, i) => instance(wallGeo, m, walls[i], root));
  instance(roofGeo, roofMat, roofs, root);
  instance(hedgeGeo, hedgeMat, hedges, root);

  // Roadside trees for the open stretch.
  const trunkGeo = new THREE.CylinderGeometry(0.2, 0.3, 3, 5);
  const crownGeo = new THREE.SphereGeometry(2.4, 7, 5);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 1 });
  const crownMat = new THREE.MeshStandardMaterial({ color: 0x3d6b2e, roughness: 1 });
  disposables.push(trunkGeo, crownGeo, trunkMat, crownMat);
  const trunks: THREE.Matrix4[] = [];
  const crowns: THREE.Matrix4[] = [];
  for (let i = villageEnd; i < approach.count - 6; i += 3) {
    for (const side of [1, -1]) {
      if (rand() > 0.5) continue;
      const p = approach.at(i);
      const off = p.halfWidth + 4 + rand() * 12;
      const pos = p.pos.clone().addScaledVector(p.normal, side * off);
      const sc = 0.9 + rand() * 0.8;
      dummy.rotation.set(0, rand() * 6.28, 0);
      dummy.scale.setScalar(sc);
      dummy.position.set(pos.x, pos.y + 1.5 * sc, pos.z);
      dummy.updateMatrix();
      trunks.push(dummy.matrix.clone());
      dummy.position.set(pos.x, pos.y + (3 + 2) * sc, pos.z);
      dummy.updateMatrix();
      crowns.push(dummy.matrix.clone());
    }
  }
  instance(trunkGeo, trunkMat, trunks, root);
  instance(crownGeo, crownMat, crowns, root);
}

// =====================================================================
// The Rent4Ring base at Burgstraße 1 — where every drive starts
// =====================================================================
function buildHomeBase(approach: Approach, root: THREE.Group, disposables: { dispose(): void }[]): void {
  const p = approach.at(0);
  const yaw = Math.atan2(p.tangent.x, p.tangent.z);
  const group = new THREE.Group();
  // The yard sits in a dip below the road, so the building is set down and the
  // forecourt ramps up to the kerb.
  const DIP = 1.9;
  group.position
    .copy(p.pos)
    .addScaledVector(p.normal, p.halfWidth + 9)
    .addScaledVector(p.tangent, -4);
  group.position.y -= DIP;
  group.rotation.y = yaw;

  // Sunken forecourt with a ramp back up to the road.
  const yardGeo = new THREE.BoxGeometry(26, 0.3, 20);
  const yardMat = new THREE.MeshStandardMaterial({ color: 0x74777c, roughness: 0.95 });
  disposables.push(yardGeo, yardMat);
  const yard = new THREE.Mesh(yardGeo, yardMat);
  yard.position.set(0, 0, 3);
  group.add(yard);

  const rampGeo = new THREE.BoxGeometry(9, 0.3, 7);
  disposables.push(rampGeo);
  const ramp = new THREE.Mesh(rampGeo, yardMat);
  ramp.position.set(0, DIP / 2, 14);
  ramp.rotation.x = -Math.atan2(DIP, 7);
  group.add(ramp);

  // Retaining walls holding back the higher ground either side.
  const bankGeo = new THREE.BoxGeometry(0.6, DIP + 0.6, 20);
  const bankMat = new THREE.MeshStandardMaterial({ color: 0x6d6a63, roughness: 1 });
  disposables.push(bankGeo, bankMat);
  for (const bx of [-13, 13]) {
    const bank = new THREE.Mesh(bankGeo, bankMat);
    bank.position.set(bx, DIP / 2 - 0.15, 3);
    group.add(bank);
  }

  const shellGeo = new THREE.BoxGeometry(16, 6, 11);
  const shellMat = new THREE.MeshStandardMaterial({ color: 0xf0f0ee, roughness: 0.9 });
  const shell = new THREE.Mesh(shellGeo, shellMat);
  shell.position.y = 3;
  group.add(shell);
  disposables.push(shellGeo, shellMat);

  const roofGeo = new THREE.BoxGeometry(17, 0.5, 12);
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x2b3038, roughness: 0.85 });
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.y = 6.25;
  group.add(roof);
  disposables.push(roofGeo, roofMat);

  // Two roller doors facing the yard, plus the personnel door on the right.
  const doorGeo = new THREE.BoxGeometry(5.2, 4.2, 0.2);
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x2f3540, roughness: 0.6, metalness: 0.35 });
  const slatGeo = new THREE.BoxGeometry(5.2, 0.06, 0.06);
  const slatMat = new THREE.MeshStandardMaterial({ color: 0x1b2027, roughness: 0.7 });
  disposables.push(doorGeo, doorMat, slatGeo, slatMat);
  for (const dx of [-4.4, 1.4]) {
    const door = new THREE.Mesh(doorGeo, doorMat);
    door.position.set(dx, 2.2, 5.55);
    group.add(door);
    // Slat lines, so the shutters read as shutters.
    for (let s = 0; s < 6; s++) {
      const slat = new THREE.Mesh(slatGeo, slatMat);
      slat.position.set(dx, 0.55 + s * 0.66, 5.67);
      group.add(slat);
    }
  }

  // Personnel door, right-hand end of the frontage.
  const sideDoorGeo = new THREE.BoxGeometry(1.1, 2.3, 0.16);
  const sideDoorMat = new THREE.MeshStandardMaterial({ color: 0xb8342f, roughness: 0.7 });
  disposables.push(sideDoorGeo, sideDoorMat);
  const sideDoor = new THREE.Mesh(sideDoorGeo, sideDoorMat);
  sideDoor.position.set(6.2, 1.15, 5.56);
  group.add(sideDoor);

  const doorFrameGeo = new THREE.BoxGeometry(1.35, 2.55, 0.1);
  const doorFrameMat = new THREE.MeshStandardMaterial({ color: 0xdedad2, roughness: 0.85 });
  disposables.push(doorFrameGeo, doorFrameMat);
  const doorFrame = new THREE.Mesh(doorFrameGeo, doorFrameMat);
  doorFrame.position.set(6.2, 1.28, 5.5);
  group.add(doorFrame);

  // Step up to the door, and a lamp above it.
  const stepGeo = new THREE.BoxGeometry(1.6, 0.16, 0.7);
  disposables.push(stepGeo);
  const step = new THREE.Mesh(stepGeo, doorFrameMat);
  step.position.set(6.2, 0.08, 5.95);
  group.add(step);

  const lampGeo = new THREE.BoxGeometry(0.3, 0.16, 0.22);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe6b0 });
  disposables.push(lampGeo, lampMat);
  const lamp = new THREE.Mesh(lampGeo, lampMat);
  lamp.position.set(6.2, 2.75, 5.62);
  group.add(lamp);

  // Wordmark above the doors.
  const signGeo = new THREE.BoxGeometry(11, 2.4, 0.18);
  const sign = new THREE.Mesh(signGeo, logoMaterial());
  sign.position.set(0, 5.1, 5.6);
  group.add(sign);
  disposables.push(signGeo, sign.material as THREE.Material);

  root.add(group);
}

// =====================================================================
// Circuit furniture
// =====================================================================
function buildKerbs(track: Track, root: THREE.Group, disposables: { dispose(): void }[]): void {
  const n = track.count;
  const geo = new THREE.BoxGeometry(1, 0.12, 1);
  const redMat = new THREE.MeshStandardMaterial({ color: 0xc02828, roughness: 0.85 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xe6e6e6, roughness: 0.85 });
  disposables.push(geo, redMat, whiteMat);

  const red: THREE.Matrix4[] = [];
  const white: THREE.Matrix4[] = [];
  const dummy = new THREE.Object3D();
  let stripe = 0;

  for (let i = 0; i < n; i++) {
    const p = track.at(i);
    if (Math.abs(p.curvature) < 0.008) continue;
    const side = p.curvature > 0 ? 1 : -1;
    const w = p.halfWidth;
    const yaw = Math.atan2(p.tangent.x, p.tangent.z);

    // Two half-spacing stripes per point keeps the red/white rhythm at ~3 m.
    for (let half = 0; half < 2; half++) {
      const pos = p.pos
        .clone()
        .addScaledVector(p.normal, side * (w + 0.65))
        .addScaledVector(p.tangent, (half - 0.25) * track.spacing * 0.5);
      pos.y += Math.sin(p.banking) * side * w + 0.02;

      dummy.position.copy(pos);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(1.3, 1, track.spacing * 0.52);
      dummy.updateMatrix();
      (stripe++ % 2 === 0 ? red : white).push(dummy.matrix.clone());
    }
  }

  instance(geo, redMat, red, root);
  instance(geo, whiteMat, white, root);
}

function buildBarriers(
  track: Track,
  root: THREE.Group,
  disposables: { dispose(): void }[],
  entranceIndex: number,
): void {
  const n = track.count;
  const railGeo = new THREE.BoxGeometry(0.12, 0.62, 1);
  const postGeo = new THREE.BoxGeometry(0.14, 1.0, 0.14);
  const railMat = new THREE.MeshStandardMaterial({ color: 0xb9bec4, roughness: 0.5, metalness: 0.65 });
  const postMat = new THREE.MeshStandardMaterial({ color: 0x8b9096, roughness: 0.7, metalness: 0.4 });
  disposables.push(railGeo, postGeo, railMat, postMat);

  const rails: THREE.Matrix4[] = [];
  const posts: THREE.Matrix4[] = [];
  const dummy = new THREE.Object3D();
  const stride = 2;

  // Leave the Armco out either side of the junction, so the entrance is open.
  const GAP = 11;
  const nearEntrance = (i: number) => {
    if (entranceIndex < 0) return false;
    let d = Math.abs(i - entranceIndex);
    if (d > n / 2) d = n - d;
    return d <= GAP;
  };

  for (let i = 0; i < n; i += stride) {
    const p = track.at(i);
    for (const side of [1, -1]) {
      // The public road joins from the left, so the rail opens on that side.
      if (side === 1 && nearEntrance(i)) continue;
      const off = p.halfWidth + 6.5;
      const pos = p.pos.clone().addScaledVector(p.normal, side * off);
      pos.y += Math.sin(p.banking) * side * off;
      const yaw = Math.atan2(p.tangent.x, p.tangent.z);

      dummy.position.set(pos.x, pos.y + 0.62, pos.z);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(1, 1, track.spacing * stride * 1.02);
      dummy.updateMatrix();
      rails.push(dummy.matrix.clone());

      if (i % (stride * 2) === 0) {
        dummy.position.set(pos.x, pos.y + 0.42, pos.z);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        posts.push(dummy.matrix.clone());
      }
    }
  }

  instance(railGeo, railMat, rails, root);
  instance(postGeo, postMat, posts, root);
}

function buildTrees(track: Track, root: THREE.Group, disposables: { dispose(): void }[]): void {
  const n = track.count;
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 3.2, 5);
  const crownGeo = new THREE.ConeGeometry(2.1, 8.5, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 1 });
  const crownMat = new THREE.MeshStandardMaterial({ color: 0x2f5228, roughness: 1 });
  disposables.push(trunkGeo, crownGeo, trunkMat, crownMat);

  const trunks: THREE.Matrix4[] = [];
  const crowns: THREE.Matrix4[] = [];
  const dummy = new THREE.Object3D();

  let seed = 1337;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  for (let i = 0; i < n; i += 2) {
    const p = track.at(i);
    const dense = FOREST_SECTIONS.has(track.sectionNameAt(i));
    const perSide = dense ? 3 : 1;
    for (const side of [1, -1]) {
      for (let k = 0; k < perSide; k++) {
        if (!dense && rand() > 0.45) continue;
        const off = p.halfWidth + 9 + rand() * (dense ? 46 : 60);
        const along = (rand() - 0.5) * track.spacing * 2;
        const pos = p.pos.clone().addScaledVector(p.normal, side * off).addScaledVector(p.tangent, along);
        pos.y -= 0.4 + (off - p.halfWidth) * 0.12;

        const scale = 0.7 + rand() * 0.85;
        const lean = (rand() - 0.5) * 0.09;

        dummy.position.set(pos.x, pos.y + 1.6 * scale, pos.z);
        dummy.rotation.set(lean, rand() * Math.PI * 2, lean * 0.6);
        dummy.scale.setScalar(scale);
        dummy.updateMatrix();
        trunks.push(dummy.matrix.clone());

        dummy.position.set(pos.x, pos.y + 7.45 * scale, pos.z);
        dummy.updateMatrix();
        crowns.push(dummy.matrix.clone());
      }
    }
  }

  instance(trunkGeo, trunkMat, trunks, root);
  instance(crownGeo, crownMat, crowns, root);
}

function buildDistanceMarkers(track: Track, root: THREE.Group, disposables: { dispose(): void }[]): void {
  const poleGeo = new THREE.BoxGeometry(0.12, 2.4, 0.12);
  const signGeo = new THREE.BoxGeometry(1.1, 0.7, 0.06);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.8 });
  disposables.push(poleGeo, signGeo, poleMat);

  const poles: THREE.Matrix4[] = [];
  const dummy = new THREE.Object3D();
  const marks = Math.floor(track.lapLength / 500);

  for (let m = 1; m <= marks; m++) {
    const targetS = m * 500;
    let idx = 0;
    for (let i = 0; i < track.count; i++) {
      if (track.at(i).s >= targetS) {
        idx = i;
        break;
      }
    }
    const p = track.at(idx);
    const pos = p.pos.clone().addScaledVector(p.normal, -(p.halfWidth + 3.2));
    const yaw = Math.atan2(p.tangent.x, p.tangent.z);

    dummy.position.set(pos.x, pos.y + 1.2, pos.z);
    dummy.rotation.set(0, yaw, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    poles.push(dummy.matrix.clone());

    const sign = new THREE.Mesh(signGeo, textMaterial(`${(targetS / 1000).toFixed(1)} km`));
    sign.position.set(pos.x, pos.y + 2.3, pos.z);
    sign.rotation.set(0, yaw + Math.PI / 2, 0);
    root.add(sign);
    disposables.push(sign.material as THREE.Material);
  }

  instance(poleGeo, poleMat, poles, root);
}

function buildStartLine(track: Track, root: THREE.Group, disposables: { dispose(): void }[]): void {
  const p = track.at(0);
  const group = new THREE.Group();
  group.position.copy(p.pos);
  group.rotation.y = Math.atan2(p.tangent.x, p.tangent.z);

  const w = p.halfWidth * 2;
  const stripGeo = new THREE.PlaneGeometry(w, 1.6);
  const stripMat = new THREE.MeshBasicMaterial({ map: chequerTexture(), transparent: true });
  disposables.push(stripGeo, stripMat);
  const strip = new THREE.Mesh(stripGeo, stripMat);
  strip.rotation.x = -Math.PI / 2;
  strip.position.y = 0.04;
  strip.renderOrder = 3;
  group.add(strip);

  const legGeo = new THREE.BoxGeometry(0.4, 7, 0.4);
  const beamGeo = new THREE.BoxGeometry(w + 2.4, 0.9, 0.5);
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x2c3138, roughness: 0.6, metalness: 0.4 });
  disposables.push(legGeo, beamGeo, steelMat);

  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(legGeo, steelMat);
    leg.position.set(side * (p.halfWidth + 1.1), 3.5, 0);
    group.add(leg);
  }
  const beam = new THREE.Mesh(beamGeo, steelMat);
  beam.position.set(0, 7.3, 0);
  group.add(beam);

  const boardGeo = new THREE.BoxGeometry(7.4, 2.1, 0.12);
  const board = new THREE.Mesh(boardGeo, logoMaterial());
  board.position.set(0, 8.8, 0);
  group.add(board);
  disposables.push(boardGeo, board.material as THREE.Material);

  root.add(group);
}

// =====================================================================
// Burg Nürburg — the 12th-century keep on its volcanic cone, 678 m above sea
// level and the landmark the whole place is named after. It sits roughly 840 m
// from the start/finish line and looms over the village.
// =====================================================================
function buildNuerburg(root: THREE.Group, disposables: { dispose(): void }[]): void {
  // Projected from 50.3333 N, 6.9417 E into the shared track frame.
  const CX = -1478;
  const CZ = 3418;
  // Track datum y=0 is 320 m above sea level; the castle rock tops out at 678 m.
  const HILL_TOP = 678 - 320;
  const HILL_BASE = HILL_TOP - 92;

  const group = new THREE.Group();
  group.position.set(CX, 0, CZ);

  const rockMat = new THREE.MeshStandardMaterial({ color: 0x5a5f4e, roughness: 1 });
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x8d8579, roughness: 0.95 });
  const darkStoneMat = new THREE.MeshStandardMaterial({ color: 0x726b60, roughness: 0.95 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x54372c, roughness: 0.9 });
  disposables.push(rockMat, stoneMat, darkStoneMat, roofMat);

  // The cone the castle stands on, skirted into the surrounding land.
  const hillGeo = new THREE.ConeGeometry(210, HILL_TOP - HILL_BASE, 22, 3);
  // Roughen it so it reads as rock rather than a perfect cone.
  {
    const pos = hillGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const n = Math.sin(pos.getX(i) * 0.08) * Math.cos(pos.getZ(i) * 0.07);
      pos.setX(i, pos.getX(i) + n * 7);
      pos.setZ(i, pos.getZ(i) + n * 7);
      pos.setY(i, y + n * 3);
    }
    pos.needsUpdate = true;
    hillGeo.computeVertexNormals();
  }
  const hill = new THREE.Mesh(hillGeo, rockMat);
  hill.position.y = (HILL_TOP + HILL_BASE) / 2;
  group.add(hill);
  disposables.push(hillGeo);

  // Curtain wall ring around the summit.
  const wallGeo = new THREE.BoxGeometry(1, 7, 1);
  disposables.push(wallGeo);
  const wallMatrices: THREE.Matrix4[] = [];
  const merlonGeo = new THREE.BoxGeometry(1.6, 1.8, 1.8);
  const merlons: THREE.Matrix4[] = [];
  disposables.push(merlonGeo);
  const dummy = new THREE.Object3D();

  const ringR = 30;
  const segments = 16;
  for (let i = 0; i < segments; i++) {
    // A ruin, not a fortress — leave gaps where the wall has fallen.
    if (i === 4 || i === 5 || i === 11) continue;
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const x0 = Math.cos(a0) * ringR;
    const z0 = Math.sin(a0) * ringR;
    const x1 = Math.cos(a1) * ringR;
    const z1 = Math.sin(a1) * ringR;
    const mx = (x0 + x1) / 2;
    const mz = (z0 + z1) / 2;
    const len = Math.hypot(x1 - x0, z1 - z0);
    const yaw = Math.atan2(x1 - x0, z1 - z0);

    dummy.position.set(mx, HILL_TOP + 3.5, mz);
    dummy.rotation.set(0, yaw, 0);
    dummy.scale.set(2.4, 1, len * 1.05);
    dummy.updateMatrix();
    wallMatrices.push(dummy.matrix.clone());

    dummy.position.set(mx, HILL_TOP + 7.9, mz);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    merlons.push(dummy.matrix.clone());
  }
  instance(wallGeo, stoneMat, wallMatrices, group);
  instance(merlonGeo, stoneMat, merlons, group);

  // The bergfried: the tall round keep that makes the silhouette.
  const keepGeo = new THREE.CylinderGeometry(6.4, 7.4, 26, 14);
  const keep = new THREE.Mesh(keepGeo, stoneMat);
  keep.position.set(-4, HILL_TOP + 13, 2);
  group.add(keep);
  disposables.push(keepGeo);

  const keepCapGeo = new THREE.CylinderGeometry(7.2, 7.2, 2.2, 14);
  const keepCap = new THREE.Mesh(keepCapGeo, darkStoneMat);
  keepCap.position.set(-4, HILL_TOP + 27, 2);
  group.add(keepCap);
  disposables.push(keepCapGeo);

  // A square residential tower alongside, part-ruined.
  const hallGeo = new THREE.BoxGeometry(16, 15, 11);
  const hall = new THREE.Mesh(hallGeo, darkStoneMat);
  hall.position.set(13, HILL_TOP + 7.5, -6);
  hall.rotation.y = 0.3;
  group.add(hall);
  disposables.push(hallGeo);

  const hallRoofGeo = new THREE.ConeGeometry(11.5, 6, 4);
  const hallRoof = new THREE.Mesh(hallRoofGeo, roofMat);
  hallRoof.position.set(13, HILL_TOP + 18, -6);
  hallRoof.rotation.y = 0.3 + Math.PI / 4;
  group.add(hallRoof);
  disposables.push(hallRoofGeo);

  // Two smaller flanking turrets.
  const turretGeo = new THREE.CylinderGeometry(3.4, 3.8, 12, 10);
  disposables.push(turretGeo);
  for (const [tx, tz] of [
    [-26, -14],
    [20, 20],
  ]) {
    const t = new THREE.Mesh(turretGeo, stoneMat);
    t.position.set(tx, HILL_TOP + 6, tz);
    group.add(t);
  }

  // Trees skirting the lower slopes.
  const trunkGeo = new THREE.CylinderGeometry(0.3, 0.45, 4, 5);
  const crownGeo = new THREE.ConeGeometry(2.6, 9, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x40301f, roughness: 1 });
  const crownMat = new THREE.MeshStandardMaterial({ color: 0x2b4a24, roughness: 1 });
  disposables.push(trunkGeo, crownGeo, trunkMat, crownMat);
  const trunks: THREE.Matrix4[] = [];
  const crowns: THREE.Matrix4[] = [];
  let seed = 99;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  for (let i = 0; i < 260; i++) {
    const a = rand() * Math.PI * 2;
    const r = 55 + rand() * 150;
    // Follow the cone surface downward as the radius grows.
    const t = (r - 55) / 150;
    const y = HILL_TOP - 10 - t * (HILL_TOP - HILL_BASE - 6);
    const sc = 0.9 + rand() * 0.8;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    dummy.rotation.set(0, rand() * 6.28, 0);
    dummy.scale.setScalar(sc);
    dummy.position.set(x, y + 2 * sc, z);
    dummy.updateMatrix();
    trunks.push(dummy.matrix.clone());
    dummy.position.set(x, y + 8.5 * sc, z);
    dummy.updateMatrix();
    crowns.push(dummy.matrix.clone());
  }
  instance(trunkGeo, trunkMat, trunks, group);
  instance(crownGeo, crownMat, crowns, group);

  root.add(group);
}

// =====================================================================
// The circuit entrance: a gated junction where the public road joins.
// =====================================================================
function buildEntrance(
  track: Track,
  index: number,
  root: THREE.Group,
  disposables: { dispose(): void }[],
): void {
  const p = track.at(index);
  const group = new THREE.Group();
  group.position.copy(p.pos);
  group.rotation.y = Math.atan2(p.tangent.x, p.tangent.z);

  const steel = new THREE.MeshStandardMaterial({ color: 0x9aa0a7, roughness: 0.5, metalness: 0.6 });
  const red = new THREE.MeshStandardMaterial({ color: 0xcf1a2b, roughness: 0.6 });
  const wall = new THREE.MeshStandardMaterial({ color: 0xe6e6e2, roughness: 0.9 });
  disposables.push(steel, red, wall);

  const rail = p.halfWidth + 6.5;

  // Posts flanking the opening.
  const postGeo = new THREE.CylinderGeometry(0.15, 0.15, 2.6, 8);
  disposables.push(postGeo);
  for (const dz of [-10, 10]) {
    const post = new THREE.Mesh(postGeo, steel);
    post.position.set(rail, 1.3, dz);
    group.add(post);
  }

  // Lifting boom, raised to let you through.
  const boomGeo = new THREE.BoxGeometry(6.4, 0.17, 0.17);
  disposables.push(boomGeo);
  const boom = new THREE.Mesh(boomGeo, red);
  boom.position.set(rail + 3.2, 2.3, 0);
  boom.rotation.z = -1.05;
  group.add(boom);

  // Marshal hut set back from the junction.
  const hutGeo = new THREE.BoxGeometry(3.2, 2.6, 2.6);
  disposables.push(hutGeo);
  const hut = new THREE.Mesh(hutGeo, wall);
  hut.position.set(rail + 7, 1.3, -14);
  group.add(hut);

  const hutRoofGeo = new THREE.BoxGeometry(3.7, 0.22, 3.1);
  disposables.push(hutRoofGeo);
  const hutRoof = new THREE.Mesh(hutRoofGeo, steel);
  hutRoof.position.set(rail + 7, 2.72, -14);
  group.add(hutRoof);

  // Sign over the slip road.
  const signGeo = new THREE.BoxGeometry(4.6, 1.3, 0.12);
  disposables.push(signGeo);
  const sign = new THREE.Mesh(signGeo, textMaterial('ZUFAHRT', 0x0f4a8a));
  sign.position.set(rail + 3.2, 3.7, 0);
  sign.rotation.y = Math.PI / 2;
  group.add(sign);
  disposables.push(sign.material as THREE.Material);

  root.add(group);
}

// =====================================================================
// The Total station on the approach, at its surveyed position.
// =====================================================================
function buildPetrolStation(root: THREE.Group, disposables: { dispose(): void }[]): void {
  // OSM way 114676264, projected into the shared track frame.
  const group = new THREE.Group();
  group.position.set(-1028, 268, 3070);
  group.rotation.y = 0.5;

  const white = new THREE.MeshStandardMaterial({ color: 0xf2f2f0, roughness: 0.85 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x1b3f8f, roughness: 0.6 });
  const orange = new THREE.MeshStandardMaterial({ color: 0xef4123, roughness: 0.6 });
  const grey = new THREE.MeshStandardMaterial({ color: 0x8f9296, roughness: 0.9 });
  disposables.push(white, blue, orange, grey);

  const slabGeo = new THREE.BoxGeometry(34, 0.25, 26);
  disposables.push(slabGeo);
  const slab = new THREE.Mesh(slabGeo, grey);
  slab.position.y = -0.1;
  group.add(slab);

  // Canopy on four columns.
  const canopyGeo = new THREE.BoxGeometry(22, 0.9, 14);
  const bandGeo = new THREE.BoxGeometry(22.2, 0.5, 14.2);
  const colGeo = new THREE.BoxGeometry(0.8, 6, 0.8);
  disposables.push(canopyGeo, bandGeo, colGeo);

  const canopy = new THREE.Mesh(canopyGeo, white);
  canopy.position.set(0, 6.2, 0);
  group.add(canopy);
  const band = new THREE.Mesh(bandGeo, blue);
  band.position.set(0, 5.7, 0);
  group.add(band);
  for (const [cx, cz] of [
    [-9, -5],
    [9, -5],
    [-9, 5],
    [9, 5],
  ]) {
    const col = new THREE.Mesh(colGeo, white);
    col.position.set(cx, 3, cz);
    group.add(col);
  }

  // Pump islands.
  const pumpGeo = new THREE.BoxGeometry(1.1, 1.9, 0.7);
  const trimGeo = new THREE.BoxGeometry(1.15, 0.35, 0.75);
  const islandGeo = new THREE.BoxGeometry(5.5, 0.3, 1.4);
  disposables.push(pumpGeo, trimGeo, islandGeo);
  for (const cz of [-3.5, 3.5]) {
    const island = new THREE.Mesh(islandGeo, white);
    island.position.set(0, 0.15, cz);
    group.add(island);
    for (const cx of [-1.8, 1.8]) {
      const pump = new THREE.Mesh(pumpGeo, white);
      pump.position.set(cx, 1.25, cz);
      group.add(pump);
      const trim = new THREE.Mesh(trimGeo, orange);
      trim.position.set(cx, 2.0, cz);
      group.add(trim);
    }
  }

  // Shop behind the forecourt.
  const shopGeo = new THREE.BoxGeometry(14, 4.2, 7);
  const shopRoofGeo = new THREE.BoxGeometry(14.6, 0.4, 7.6);
  disposables.push(shopGeo, shopRoofGeo);
  const shop = new THREE.Mesh(shopGeo, white);
  shop.position.set(0, 2.1, -11);
  group.add(shop);
  const shopRoof = new THREE.Mesh(shopRoofGeo, blue);
  shopRoof.position.set(0, 4.4, -11);
  group.add(shopRoof);

  // Price totem by the road.
  const totemGeo = new THREE.BoxGeometry(3, 4, 0.4);
  const totemPostGeo = new THREE.BoxGeometry(0.5, 3, 0.5);
  disposables.push(totemGeo, totemPostGeo);
  const totem = new THREE.Mesh(totemGeo, textMaterial('TOTAL', 0x1b3f8f, 0xffffff));
  totem.position.set(15, 4.5, 8);
  totem.rotation.y = -0.4;
  group.add(totem);
  disposables.push(totem.material as THREE.Material);
  const totemPost = new THREE.Mesh(totemPostGeo, grey);
  totemPost.position.set(15, 1.5, 8);
  group.add(totemPost);

  root.add(group);
}

// =====================================================================
// Sky and procedural textures
// =====================================================================
export function buildSky(disposables: { dispose(): void }[]): THREE.Mesh {
  const geo = new THREE.SphereGeometry(3200, 32, 20);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(0x7fa8d4) },
      middle: { value: new THREE.Color(0xc3d2de) },
      bottom: { value: new THREE.Color(0xd8dcda) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 top; uniform vec3 middle; uniform vec3 bottom;
      varying vec3 vPos;
      void main() {
        float h = normalize(vPos).y;
        vec3 c = h > 0.0 ? mix(middle, top, pow(h, 0.6)) : mix(middle, bottom, pow(-h, 0.5));
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });
  disposables.push(geo, mat);
  const sky = new THREE.Mesh(geo, mat);
  sky.frustumCulled = false;
  return sky;
}

export function asphaltTexture(): THREE.Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#5f6064';
  ctx.fillRect(0, 0, size, size);
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 34;
    img.data[i] += noise;
    img.data[i + 1] += noise;
    img.data[i + 2] += noise;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

function chequerTexture(): THREE.Texture {
  const cells = 16;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size / 8;
  const ctx = canvas.getContext('2d')!;
  const cw = size / cells;
  const ch = canvas.height / 2;
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < cells; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#f2f2f2' : '#141414';
      ctx.fillRect(x * cw, y * ch, cw, ch);
    }
  }
  return new THREE.CanvasTexture(canvas);
}

export function textMaterial(text: string, bg = 0x14181d, fg = 0xf0f0f0): THREE.MeshBasicMaterial {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = `#${bg.toString(16).padStart(6, '0')}`;
  ctx.fillRect(0, 0, 512, 256);
  ctx.fillStyle = `#${fg.toString(16).padStart(6, '0')}`;
  ctx.font = 'bold 96px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 132);
  return new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas) });
}

/** Canvas rendition of the Rent4Ring wordmark, for signage and liveries. */
export function logoTexture(background: string | null = '#0d1117'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 176;
  const ctx = canvas.getContext('2d')!;
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  const skew = -0.21;
  const bar = (x: number, y: number, w: number, h: number, label: string) => {
    ctx.save();
    ctx.transform(1, 0, skew, 1, 0, 0);
    ctx.fillStyle = '#d81026';
    roundRect(ctx, x, y, w, h, 9);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 46px "Barlow Condensed", "Arial Narrow", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + h / 2 + 2);
    ctx.restore();
  };

  // The bars overlap the "4", but the lettering stays clear of it.
  bar(30, 30, 200, 54, 'R E N T');
  bar(268, 92, 214, 54, 'R I N G');

  // The big 4, straddling the gap between the two bars.
  ctx.save();
  ctx.transform(1, 0, skew, 1, 0, 0);
  ctx.translate(200, 8);
  ctx.beginPath();
  ctx.moveTo(62, 0);
  ctx.lineTo(94, 0);
  ctx.lineTo(94, 84);
  ctx.lineTo(112, 84);
  ctx.lineTo(112, 112);
  ctx.lineTo(94, 112);
  ctx.lineTo(94, 150);
  ctx.lineTo(58, 150);
  ctx.lineTo(58, 112);
  ctx.lineTo(-10, 112);
  ctx.lineTo(-10, 80);
  ctx.closePath();
  ctx.strokeStyle = '#d81026';
  ctx.lineWidth = 20;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  // Punch the counter of the 4.
  ctx.beginPath();
  ctx.moveTo(58, 84);
  ctx.lineTo(58, 38);
  ctx.lineTo(24, 84);
  ctx.closePath();
  ctx.fillStyle = '#d81026';
  ctx.fill();
  ctx.restore();

  return new THREE.CanvasTexture(canvas);
}

function logoMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ map: logoTexture('#0d1117') });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
