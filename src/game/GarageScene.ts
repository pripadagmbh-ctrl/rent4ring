import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { Car } from '../data/fleet';
import { buildCarMesh, type CarMesh } from './carMesh';
import { logoTexture } from './world';
import trackData from '../data/nordschleife.json';

/**
 * The Rent4Ring shop at Burgstraße 1, rebuilt from the real thing: white walls
 * buried under visitors' signatures, alloys hung as trophies, bucket seats
 * stacked in the corner, a blue oil-branded counter and a shelf of silverware.
 * The selected car sits on a slow turntable in the middle.
 */
export class GarageScene {
  /**
   * Two live instances fighting over one canvas paint alternating frames —
   * and the stale one usually has no car in it, which is exactly the
   * "sometimes the car is invisible" bug under StrictMode's double-mount.
   * The newest instance always wins; any predecessor is retired on sight.
   */
  private static active: GarageScene | null = null;

  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private turntable = new THREE.Group();
  private carMesh: CarMesh | null = null;
  private disposables: { dispose(): void }[] = [];
  private envRT: THREE.WebGLRenderTarget | null = null;
  private running = false;
  private frame = 0;
  private clock = new THREE.Clock();
  private spin = 0;
  /** Set by pointer drag so the visitor can turn the car themselves. */
  private manualSpin = 0;
  private autoSpin = true;

  constructor(canvas: HTMLCanvasElement, car: Car) {
    GarageScene.active?.dispose();
    GarageScene.active = this;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.camera = new THREE.PerspectiveCamera(42, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
    this.camera.position.set(5.4, 2.05, 6.2);
    this.camera.lookAt(0, 0.75, 0);

    this.scene.background = new THREE.Color(0x14171b);
    // Metallic paint needs something to reflect, or it shades like dark glass.
    // The render target owns the GPU texture; it is kept for dispose().
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = 0.55;
    pmrem.dispose();
    this.buildRoom();
    this.scene.add(this.turntable);
    this.setCar(car);
    // Dev-only inspection handle.
    if (import.meta.env.DEV) (window as unknown as { __garage?: GarageScene }).__garage = this;
  }

  // ------------------------------------------------------------------ room
  private buildRoom(): void {
    const W = 13; // width
    const D = 11; // depth
    const H = 3.4; // ceiling height

    const push = <T extends { dispose(): void }>(x: T): T => {
      this.disposables.push(x);
      return x;
    };

    // ---------------------------------------------------------- lighting
    this.scene.add(new THREE.AmbientLight(0xdfe6ee, 0.55));
    // Fluorescent strips along the ceiling. RectAreaLight would be the honest
    // choice, but it needs a separately initialised uniforms library and
    // contributes nothing without it — a pair of point lights per tube reads
    // the same here and has no such dependency.
    const tubeGeo = push(new THREE.BoxGeometry(5.4, 0.09, 0.3));
    const tubeMat = push(new THREE.MeshBasicMaterial({ color: 0xf6faff }));
    for (const z of [-2.6, 0.6]) {
      const tube = new THREE.Mesh(tubeGeo, tubeMat);
      tube.position.set(0, H - 0.1, z);
      this.scene.add(tube);

      for (const x of [-1.7, 1.7]) {
        const lamp = new THREE.PointLight(0xf4f8ff, 9, 13, 2);
        lamp.position.set(x, H - 0.3, z);
        this.scene.add(lamp);
      }
    }
    // Daylight through the window on the back wall.
    const daylight = new THREE.DirectionalLight(0xdfeaf6, 1.25);
    daylight.position.set(-3, 2.6, -6);
    this.scene.add(daylight);
    const warm = new THREE.PointLight(0xffe3bd, 18, 14, 2);
    warm.position.set(2.5, 2.6, 1.5);
    this.scene.add(warm);

    // -------------------------------------------------------- floor/walls
    const floorMat = push(
      new THREE.MeshStandardMaterial({ color: 0x8e9095, roughness: 0.72, metalness: 0.05 }),
    );
    const floor = new THREE.Mesh(push(new THREE.PlaneGeometry(W, D)), floorMat);
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);

    const ceilingMat = push(new THREE.MeshStandardMaterial({ color: 0xdadde1, roughness: 0.95 }));
    const ceiling = new THREE.Mesh(push(new THREE.PlaneGeometry(W, D)), ceilingMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = H;
    this.scene.add(ceiling);

    // The signature wall is the room's signature feature.
    const signedMat = push(
      new THREE.MeshStandardMaterial({ map: push(signatureTexture()), roughness: 0.92 }),
    );
    const plainMat = push(new THREE.MeshStandardMaterial({ color: 0xe9e7e2, roughness: 0.93 }));

    const wallGeo = push(new THREE.PlaneGeometry(W, H));
    const sideGeo = push(new THREE.PlaneGeometry(D, H));

    // Right-hand wall — the one covered in signatures in the shop.
    const right = new THREE.Mesh(sideGeo, signedMat);
    right.position.set(W / 2, H / 2, 0);
    right.rotation.y = -Math.PI / 2;
    this.scene.add(right);

    // Back wall, also signed, with the window punched through.
    const back = new THREE.Mesh(wallGeo, signedMat);
    back.position.set(0, H / 2, -D / 2);
    this.scene.add(back);

    const left = new THREE.Mesh(sideGeo, plainMat);
    left.position.set(-W / 2, H / 2, 0);
    left.rotation.y = Math.PI / 2;
    this.scene.add(left);

    const front = new THREE.Mesh(wallGeo, plainMat);
    front.position.set(0, H / 2, D / 2);
    front.rotation.y = Math.PI;
    this.scene.add(front);

    // ------------------------------------------------------------- window
    const glassMat = push(
      new THREE.MeshStandardMaterial({
        color: 0xbcd7e8,
        roughness: 0.08,
        metalness: 0.1,
        emissive: 0x9dc4dd,
        emissiveIntensity: 0.7,
      }),
    );
    const win = new THREE.Mesh(push(new THREE.PlaneGeometry(2.9, 1.35)), glassMat);
    win.position.set(-3.1, 1.85, -D / 2 + 0.02);
    this.scene.add(win);
    const frameMat = push(new THREE.MeshStandardMaterial({ color: 0xf0f0ee, roughness: 0.6 }));
    for (const [w, h, y] of [
      [3.05, 0.09, 1.15],
      [3.05, 0.09, 2.55],
    ]) {
      const bar = new THREE.Mesh(push(new THREE.BoxGeometry(w, h, 0.07)), frameMat);
      bar.position.set(-3.1, y, -D / 2 + 0.05);
      this.scene.add(bar);
    }
    const mullion = new THREE.Mesh(push(new THREE.BoxGeometry(0.07, 1.4, 0.07)), frameMat);
    mullion.position.set(-3.1, 1.85, -D / 2 + 0.05);
    this.scene.add(mullion);

    // ------------------------------------------------ alloys on the wall
    const tyreMat = push(new THREE.MeshStandardMaterial({ color: 0x16181a, roughness: 0.9 }));
    const rimMat = push(
      new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.35, metalness: 0.8 }),
    );
    const wheelGeo = push(new THREE.CylinderGeometry(0.33, 0.33, 0.16, 20));
    const hubGeo = push(new THREE.CylinderGeometry(0.2, 0.2, 0.18, 12));
    const wheelSpots: [number, number][] = [
      [-2.9, 2.55],
      [-1.4, 2.35],
      [0.2, 2.6],
      [1.5, 2.2],
      [2.9, 2.55],
      [-2.2, 1.5],
      [1.0, 1.35],
    ];
    for (const [z, y] of wheelSpots) {
      const g = new THREE.Group();
      g.position.set(W / 2 - 0.16, y, z);
      g.rotation.z = Math.PI / 2;
      const tyre = new THREE.Mesh(wheelGeo, tyreMat);
      const hub = new THREE.Mesh(hubGeo, rimMat);
      g.add(tyre, hub);
      this.scene.add(g);
    }

    // A car nose mounted high on the wall, like the red one in the shop.
    const noseMat = push(new THREE.MeshStandardMaterial({ color: 0xc41f2c, roughness: 0.4, metalness: 0.5 }));
    const wallNose = new THREE.Mesh(push(new THREE.BoxGeometry(0.35, 0.7, 2.1)), noseMat);
    wallNose.position.set(W / 2 - 0.3, 2.75, -1.9);
    wallNose.rotation.z = 0.1;
    this.scene.add(wallNose);

    // Green tow strap coiled on the wall.
    const strapMat = push(new THREE.MeshStandardMaterial({ color: 0x4ec52e, roughness: 0.8 }));
    const strap = new THREE.Mesh(push(new THREE.TorusGeometry(0.42, 0.06, 8, 22)), strapMat);
    strap.position.set(W / 2 - 0.14, 1.05, -0.3);
    strap.rotation.y = Math.PI / 2;
    this.scene.add(strap);

    // Yellow banner hanging from the ceiling.
    const bannerMat = push(new THREE.MeshStandardMaterial({ color: 0xf2c400, roughness: 0.85, side: THREE.DoubleSide }));
    const banner = new THREE.Mesh(push(new THREE.PlaneGeometry(0.62, 1.5)), bannerMat);
    banner.position.set(W / 2 - 0.75, 2.6, -3.4);
    banner.rotation.y = -Math.PI / 2;
    this.scene.add(banner);

    // -------------------------------------------------- bucket seats
    const seatShellMat = push(new THREE.MeshStandardMaterial({ color: 0x1a1c1f, roughness: 0.55 }));
    const seatTrimMat = push(new THREE.MeshStandardMaterial({ color: 0xc0202c, roughness: 0.7 }));
    for (const [i, z] of [1.9, 3.0].entries()) {
      const seat = new THREE.Group();
      seat.position.set(W / 2 - 0.85, 0.35, z);
      seat.rotation.y = -Math.PI / 2 + (i - 0.5) * 0.14;
      const base = new THREE.Mesh(push(new THREE.BoxGeometry(0.55, 0.16, 0.55)), seatShellMat);
      const backRest = new THREE.Mesh(push(new THREE.BoxGeometry(0.55, 1.0, 0.16)), seatShellMat);
      backRest.position.set(0, 0.55, -0.22);
      backRest.rotation.x = -0.12;
      const wingL = new THREE.Mesh(push(new THREE.BoxGeometry(0.1, 0.9, 0.3)), seatShellMat);
      wingL.position.set(-0.24, 0.55, -0.1);
      const wingR = wingL.clone();
      wingR.position.x = 0.24;
      const stripe = new THREE.Mesh(push(new THREE.BoxGeometry(0.14, 0.85, 0.03)), seatTrimMat);
      stripe.position.set(0, 0.56, -0.13);
      seat.add(base, backRest, wingL, wingR, stripe);
      // A low plinth, as they sit on in the shop.
      const plinth = new THREE.Mesh(push(new THREE.BoxGeometry(0.8, 0.3, 0.8)), push(new THREE.MeshStandardMaterial({ color: 0x3c4046, roughness: 0.9 })));
      plinth.position.set(W / 2 - 0.85, 0.15, z);
      this.scene.add(seat, plinth);
    }

    // ------------------------------------- pink bumper leaning on the wall
    const bumperMat = push(new THREE.MeshStandardMaterial({ color: 0xdf3d94, roughness: 0.45, metalness: 0.35 }));
    const bumper = new THREE.Mesh(push(new THREE.BoxGeometry(1.75, 0.62, 0.32)), bumperMat);
    bumper.position.set(W / 2 - 0.55, 0.36, 0.7);
    bumper.rotation.set(0, -Math.PI / 2, 0.22);
    this.scene.add(bumper);

    // Yellow body panel on the bench behind the counter.
    const yellowMat = push(new THREE.MeshStandardMaterial({ color: 0xf5c800, roughness: 0.45, metalness: 0.4 }));
    const panel = new THREE.Mesh(push(new THREE.BoxGeometry(1.5, 0.5, 0.9)), yellowMat);
    panel.position.set(-1.6, 1.15, -4.3);
    panel.rotation.y = 0.2;
    this.scene.add(panel);

    // ------------------------------------------------ counter + workbench
    const benchMat = push(new THREE.MeshStandardMaterial({ color: 0xd8dade, roughness: 0.6, metalness: 0.2 }));
    const bench = new THREE.Mesh(push(new THREE.BoxGeometry(4.4, 0.1, 0.85)), benchMat);
    bench.position.set(-2.4, 0.92, -4.5);
    this.scene.add(bench);
    const benchBody = new THREE.Mesh(push(new THREE.BoxGeometry(4.4, 0.88, 0.8)), push(new THREE.MeshStandardMaterial({ color: 0xeceef0, roughness: 0.85 })));
    benchBody.position.set(-2.4, 0.44, -4.5);
    this.scene.add(benchBody);

    // The blue oil-branded bar across the front of the room.
    const counterBlue = push(new THREE.MeshStandardMaterial({ color: 0x1b2f8f, roughness: 0.5 }));
    const counter = new THREE.Group();
    counter.position.set(-3.5, 0, 3.2);
    counter.rotation.y = -0.42;
    const cBody = new THREE.Mesh(push(new THREE.BoxGeometry(4.8, 1.12, 0.75)), counterBlue);
    cBody.position.y = 0.56;
    const cTop = new THREE.Mesh(push(new THREE.BoxGeometry(5.0, 0.09, 0.9)), push(new THREE.MeshStandardMaterial({ color: 0x11142a, roughness: 0.45 })));
    cTop.position.y = 1.16;
    counter.add(cBody, cTop);

    // Wordmark on the counter front.
    const counterLogo = new THREE.Mesh(
      push(new THREE.PlaneGeometry(2.4, 0.83)),
      push(new THREE.MeshBasicMaterial({ map: push(logoTexture(null)), transparent: true })),
    );
    counterLogo.position.set(-0.6, 0.6, 0.39);
    counter.add(counterLogo);
    this.scene.add(counter);

    // Bar stool.
    const stoolMat = push(new THREE.MeshStandardMaterial({ color: 0x2f5fa8, roughness: 0.6 }));
    const metalMat = push(new THREE.MeshStandardMaterial({ color: 0xa8adb4, roughness: 0.35, metalness: 0.85 }));
    const stool = new THREE.Group();
    stool.position.set(-2.3, 0, 4.2);
    const seatTop = new THREE.Mesh(push(new THREE.CylinderGeometry(0.21, 0.21, 0.08, 16)), stoolMat);
    seatTop.position.y = 0.72;
    const post = new THREE.Mesh(push(new THREE.CylinderGeometry(0.05, 0.05, 0.72, 10)), metalMat);
    post.position.y = 0.36;
    const footRing = new THREE.Mesh(push(new THREE.TorusGeometry(0.18, 0.02, 6, 16)), metalMat);
    footRing.position.y = 0.22;
    footRing.rotation.x = Math.PI / 2;
    stool.add(seatTop, post, footRing);
    this.scene.add(stool);

    // ------------------------------------------------------- trophy shelf
    const shelfMat = push(new THREE.MeshStandardMaterial({ color: 0xf2f2f0, roughness: 0.8 }));
    const shelf = new THREE.Mesh(push(new THREE.BoxGeometry(1.5, 0.05, 0.28)), shelfMat);
    shelf.position.set(1.1, 1.95, -D / 2 + 0.16);
    this.scene.add(shelf);
    const goldMat = push(new THREE.MeshStandardMaterial({ color: 0xf0c23c, roughness: 0.3, metalness: 0.9 }));
    for (const [i, x] of [0.6, 1.05, 1.5].entries()) {
      const cup = new THREE.Group();
      cup.position.set(x, 1.98, -D / 2 + 0.16);
      const sc = 0.85 + i * 0.14;
      const bowl = new THREE.Mesh(push(new THREE.CylinderGeometry(0.07 * sc, 0.045 * sc, 0.12 * sc, 10)), goldMat);
      bowl.position.y = 0.16 * sc;
      const stem = new THREE.Mesh(push(new THREE.CylinderGeometry(0.014, 0.014, 0.07 * sc, 8)), goldMat);
      stem.position.y = 0.07 * sc;
      const plinth = new THREE.Mesh(push(new THREE.BoxGeometry(0.09 * sc, 0.04, 0.09 * sc)), push(new THREE.MeshStandardMaterial({ color: 0x3a2a18, roughness: 0.8 })));
      plinth.position.y = 0.02;
      cup.add(bowl, stem, plinth);
      this.scene.add(cup);
    }

    // ------------------------------------------------ glass display case
    const caseGlass = push(
      new THREE.MeshStandardMaterial({
        color: 0xcfe3ef,
        roughness: 0.05,
        metalness: 0.1,
        transparent: true,
        opacity: 0.3,
      }),
    );
    const display = new THREE.Mesh(push(new THREE.BoxGeometry(0.7, 1.15, 2.4)), caseGlass);
    display.position.set(-W / 2 + 0.55, 0.58, -0.6);
    this.scene.add(display);

    // ------------------------------------------------------- big wordmark
    const signGeo = push(new THREE.PlaneGeometry(3.6, 1.24));
    const signMat = push(new THREE.MeshBasicMaterial({ map: push(logoTexture(null)), transparent: true }));
    const sign = new THREE.Mesh(signGeo, signMat);
    sign.position.set(-W / 2 + 0.06, 2.5, 0.5);
    sign.rotation.y = Math.PI / 2;
    this.scene.add(sign);

    // ------------------------------------------------------------ turntable
    const dais = new THREE.Mesh(
      push(new THREE.CylinderGeometry(3.0, 3.1, 0.09, 48)),
      push(new THREE.MeshStandardMaterial({ color: 0x22262b, roughness: 0.45, metalness: 0.35 })),
    );
    dais.position.y = 0.045;
    this.scene.add(dais);
    const daisRing = new THREE.Mesh(
      push(new THREE.TorusGeometry(3.02, 0.035, 8, 64)),
      push(new THREE.MeshStandardMaterial({ color: 0xd81026, roughness: 0.4, emissive: 0x5a0710 })),
    );
    daisRing.position.y = 0.1;
    daisRing.rotation.x = Math.PI / 2;
    this.scene.add(daisRing);
  }

  // ------------------------------------------------------------------- api
  setCar(car: Car): void {
    if (this.carMesh) {
      this.turntable.remove(this.carMesh.group);
      this.carMesh.dispose();
    }
    this.carMesh = buildCarMesh(car);
    this.carMesh.group.position.y = 0.09;
    this.turntable.add(this.carMesh.group);
  }

  /** Drag horizontally to spin the car; releasing resumes the slow rotation. */
  nudge(deltaX: number): void {
    this.manualSpin += deltaX * 0.008;
    this.autoSpin = false;
  }

  releaseDrag(): void {
    this.autoSpin = true;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    this.tick();
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.frame);
    if (GarageScene.active === this) GarageScene.active = null;
    if (import.meta.env.DEV && (window as unknown as { __garage?: GarageScene }).__garage === this) {
      delete (window as unknown as { __garage?: GarageScene }).__garage;
    }
    this.carMesh?.dispose();
    for (const d of this.disposables) d.dispose();
    this.envRT?.dispose();
    this.renderer.dispose();
  }

  private tick = (): void => {
    if (!this.running) return;
    this.frame = requestAnimationFrame(this.tick);
    const dt = Math.min(this.clock.getDelta(), 0.1);
    if (this.autoSpin) this.spin += dt * 0.22;
    this.turntable.rotation.y = this.spin + this.manualSpin;
    this.renderer.render(this.scene, this.camera);
  };
}

/**
 * The wall of visitors' signatures. Thousands of people have signed the real
 * shop, so this scribbles a dense layer of pseudo-handwriting in mixed inks.
 */
function signatureTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#efece6';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const inks = ['#1b3a8f', '#111111', '#b2202c', '#1c7a3a', '#6c2f8f', '#c2620f', '#0f7b8c'];
  let seed = 4242;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  for (let i = 0; i < 900; i++) {
    const x = rand() * canvas.width;
    const y = rand() * canvas.height;
    const scale = 0.45 + rand() * 1.1;
    const tilt = (rand() - 0.5) * 0.5;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    ctx.strokeStyle = inks[Math.floor(rand() * inks.length)];
    ctx.lineWidth = 0.9 + rand() * 1.5;
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.5 + rand() * 0.5;

    // A squiggle that reads as a signature at a distance.
    ctx.beginPath();
    let px = 0;
    let py = 0;
    ctx.moveTo(px, py);
    const strokes = 3 + Math.floor(rand() * 5);
    for (let s = 0; s < strokes; s++) {
      const cx1 = px + (4 + rand() * 10) * scale;
      const cy1 = py - (4 + rand() * 9) * scale;
      const cx2 = px + (8 + rand() * 14) * scale;
      const cy2 = py + (3 + rand() * 8) * scale;
      px += (12 + rand() * 16) * scale;
      py += (rand() - 0.5) * 5 * scale;
      ctx.bezierCurveTo(cx1, cy1, cx2, cy2, px, py);
    }
    ctx.stroke();
    ctx.restore();
  }

  // A few larger scrawls on top.
  ctx.globalAlpha = 0.8;
  for (let i = 0; i < 40; i++) {
    ctx.save();
    ctx.translate(rand() * canvas.width, rand() * canvas.height);
    ctx.rotate((rand() - 0.5) * 0.6);
    ctx.fillStyle = inks[Math.floor(rand() * inks.length)];
    ctx.font = `${16 + rand() * 18}px "Segoe Script", "Brush Script MT", cursive`;
    ctx.fillText(['Danke!', 'BTG', 'Nordschleife', '<3', 'Grüne Hölle', 'Servus', '2024', 'Ring!'][Math.floor(rand() * 8)], 0, 0);
    ctx.restore();
  }

  // The Nordschleife outline over the top, like the tubing on the real wall.
  {
    const pts = trackData.points as { x: number; z: number }[];
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }
    const span = Math.max(maxX - minX, maxZ - minZ);
    const scale = 380 / span;
    const ox = canvas.width / 2 - ((maxX + minX) / 2) * scale;
    const oy = canvas.height / 2 - ((maxZ + minZ) / 2) * scale;

    ctx.globalAlpha = 1;
    ctx.lineJoin = 'round';
    // Soft halo so the outline reads against the scribbles...
    ctx.strokeStyle = 'rgba(239,236,230,0.75)';
    ctx.lineWidth = 11;
    ctx.beginPath();
    for (let i = 0; i <= pts.length; i += 4) {
      const p = pts[i % pts.length];
      const x = ox + p.x * scale;
      const y = oy + p.z * scale;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
    // ...then the dark tube itself.
    ctx.strokeStyle = '#2c2c31';
    ctx.lineWidth = 5;
    ctx.stroke();

    // Start/finish dot in Rent4Ring red.
    const start = pts[0];
    ctx.fillStyle = '#d81026';
    ctx.beginPath();
    ctx.arc(ox + start.x * scale, oy + start.z * scale, 7, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 1);
  tex.anisotropy = 8;
  return tex;
}
