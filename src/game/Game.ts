import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { VignetteShader } from 'three/addons/shaders/VignetteShader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { Car } from '../data/fleet';
import { Approach, Track, type RoadPath } from './track';
import { Vehicle, type VehicleTelemetry } from './physics';
import { buildWorld, buildApproachWorld, buildSky, type WorldHandles } from './world';
import { buildCarMesh, type CarMesh } from './carMesh';
import { InputManager, type CameraMode } from './input';
import { EngineAudio } from './audio';
import type { Mood } from '../ui/Gorilla';

export interface SectorSplit {
  name: string;
  time: number;
}

export interface LapResult {
  time: number;
  sectors: SectorSplit[];
  clean: boolean;
  topSpeedKmh: number;
  contacts: number;
  personalBest: boolean;
  previousBest: number | null;
  /** Repair bill accumulated over the lap, euros. */
  damageCost: number;
  /** 0–1 bodywork damage at the flag. */
  damage: number;
  /** Earned discount, 0–10 percent. */
  discountPercent: number;
}

export type Phase = 'approach' | 'outlap' | 'timing';

export interface HudState {
  phase: Phase;
  speedKmh: number;
  rpmRatio: number;
  gear: number;
  lapTime: number;
  bestLap: number | null;
  lastLap: number | null;
  sectionName: string;
  distance: number;
  lapLength: number;
  offTrack: boolean;
  gripUsage: number;
  lateralG: number;
  countdown: number | null;
  delta: number | null;
  sectors: SectorSplit[];
  contacts: number;
  progress: number;
  carPos: { x: number; z: number };
  ghostPos: { x: number; z: number } | null;
  /** Metres still to drive before reaching the circuit. */
  approachRemaining: number;
  damage: number;
  damageCost: number;
  muellerMood: Mood;
  muellerLine: string;
  /** True while the car is backing up, so the HUD can show R. */
  reversing: boolean;
}

const SECTOR_BOUNDS = [
  { name: 'Hatzenbach → Aremberg', at: 0.0 },
  { name: 'Aremberg → Bergwerk', at: 0.27 },
  { name: 'Bergwerk → Pflanzgarten', at: 0.52 },
  { name: 'Pflanzgarten → Finish', at: 0.79 },
];

/**
 * Discount ladder. Beat the car's target time and you get the full 10%; drift
 * up to 50% slower than target and it tapers to nothing.
 */
export function discountFor(lapSeconds: number, targetSeconds: number, damageCost: number): number {
  const ratio = lapSeconds / targetSeconds;
  let pct: number;
  if (ratio <= 1) pct = 10;
  else if (ratio >= 1.5) pct = 0;
  else pct = 10 * (1 - (ratio - 1) / 0.5);
  // A wrecked car costs you goodwill: every 2000 EUR of damage knocks off a point.
  pct -= damageCost / 2000;
  return Math.max(0, Math.min(10, Math.round(pct * 2) / 2));
}

interface GhostSample {
  x: number;
  y: number;
  z: number;
  yaw: number;
  t: number;
}

export interface GameCallbacks {
  onHud(state: HudState): void;
  onLapComplete(result: LapResult): void;
  onArrived?(): void;
}

export class Game {
  readonly track = new Track();
  readonly approach = new Approach();
  readonly vehicle: Vehicle;
  readonly input = new InputManager();
  readonly audio: EngineAudio;

  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private composer!: EffectComposer;
  private bloomPass: UnrealBloomPass | null = null;
  private sun!: THREE.DirectionalLight;
  private sky!: THREE.Mesh;
  private skyDisposables: { dispose(): void }[] = [];
  private lowPower = false;
  /** Adaptive quality: 0 = everything on, 1 = no bloom, 2 = no shadows. */
  private qualityTier = 0;
  private frameCost = 0;
  private frameSamples = 0;
  private world: WorldHandles;
  private approachWorld: WorldHandles;
  private carMesh: CarMesh;
  private ghostMesh: CarMesh | null = null;

  private cameraMode: CameraMode = 'chase';
  private cameraPos = new THREE.Vector3();
  private cameraLook = new THREE.Vector3();

  private running = false;
  private paused = false;
  private frame = 0;
  private clock = new THREE.Clock();
  private accumulator = 0;

  // ------------------------------------------------------------ lap state
  phase: Phase = 'approach';
  private countdown: number | null = 3.0;
  private lapTime = 0;
  /** Index progress since joining the circuit; the line is crossed at `toLine`. */
  private joinProgress = 0;
  private lapProgress = 0;
  private lastIndex = 0;
  private bestLap: number | null = null;
  private lastLap: number | null = null;
  private sectorTimes: SectorSplit[] = [];
  private sectorIndex = 0;
  private contacts = 0;
  private topSpeed = 0;
  private lastGear = 1;

  // -------------------------------------------------------------- damage
  private damage = 0;
  private damageCost = 0;
  private repairRate: number;

  // ------------------------------------------------------- Herr Müller
  private mood: Mood = 'idle';
  private moodHold = 0;
  private moodLine = '';
  private offTrackFor = 0;
  /** Keeps the resting commentary from rewriting itself every frame. */
  private restingLineTimer = 0;

  private ghostRecording: GhostSample[] = [];
  private ghostBest: GhostSample[] | null = null;
  private ghostSampleTimer = 0;

  private telemetry: VehicleTelemetry | null = null;
  private muted = false;

  constructor(
    canvas: HTMLCanvasElement,
    private car: Car,
    private callbacks: GameCallbacks,
  ) {
    this.vehicle = new Vehicle(car);
    this.audio = new EngineAudio(car);
    // A Ferrari panel costs rather more than a MINI one.
    this.repairRate = 0.5 + car.ps / 700;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: window.devicePixelRatio < 2,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;

    // Touch devices skip the heavier effects; desktops get the full pass.
    this.lowPower = window.matchMedia('(pointer: coarse)').matches;

    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.camera = new THREE.PerspectiveCamera(68, canvas.clientWidth / canvas.clientHeight, 0.3, 4000);
    // Fog blends into the sky's horizon band.
    this.scene.fog = new THREE.Fog(0xc3d2de, 260, 1500);

    // Environment reflections keep metallic paint reading as paint.
    {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      this.scene.environmentIntensity = 0.4;
      pmrem.dispose();
    }

    this.scene.add(new THREE.HemisphereLight(0xcfe0f0, 0x55663f, 1.0));
    const sun = new THREE.DirectionalLight(0xfff0da, 2.1);
    sun.castShadow = true;
    sun.shadow.mapSize.setScalar(this.lowPower ? 1024 : 2048);
    // A tight box around the car keeps the shadow map sharp; it follows below.
    const cam = sun.shadow.camera;
    cam.left = -70;
    cam.right = 70;
    cam.top = 70;
    cam.bottom = -70;
    cam.near = 50;
    cam.far = 900;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.6;
    this.sun = sun;
    this.scene.add(sun, sun.target);
    const fill = new THREE.DirectionalLight(0x9fb8d0, 0.3);
    fill.position.set(260, 180, -300);
    this.scene.add(fill);

    // The sky rides with the camera so it can never fall outside the far plane.
    this.sky = buildSky(this.skyDisposables);
    this.scene.add(this.sky);

    this.world = buildWorld(this.track, this.approach.joinIndex);
    this.scene.add(this.world.root);
    this.approachWorld = buildApproachWorld(this.approach);
    this.scene.add(this.approachWorld.root);

    this.carMesh = buildCarMesh(car);
    this.carMesh.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    this.scene.add(this.carMesh.group);

    // ------------------------------------------------------ post-processing
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    if (!this.lowPower) {
      // Subtle bloom lifts brake lights, the sky and painted metal.
      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(canvas.clientWidth, canvas.clientHeight),
        0.32,
        0.5,
        0.86,
      );
      this.composer.addPass(this.bloomPass);
    }
    const vignette = new ShaderPass(VignetteShader);
    vignette.uniforms.offset.value = 0.92;
    vignette.uniforms.darkness.value = 1.08;
    this.composer.addPass(vignette);
    this.composer.addPass(new OutputPass());

    // Start on the driveway at Burgstraße 1.
    this.vehicle.placeOnTrack(this.approach, 0, 0);
    this.lastIndex = 0;
    this.moodLine = "Right then. Down the Burgstrasse and up to the Ring — mind the kerbs.";

    this.input.onCameraToggle = () => this.cycleCamera();
    this.input.onReset = () => this.recover();
    this.input.attach();

    this.loadBest();
    this.updateCameraImmediate();
  }

  /** The road the car is currently driving on. */
  private get road(): RoadPath {
    return this.phase === 'approach' ? this.approach : this.track;
  }

  // ------------------------------------------------------------ lifecycle
  start(): void {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    void this.audio.start();
    this.tick();
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.audio.setMuted(paused || this.muted);
    if (!paused) this.clock.getDelta();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.audio.userMuted = muted;
    this.audio.setMuted(muted || this.paused);
  }

  setAssists(on: boolean): void {
    this.vehicle.assists = on;
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.frame);
    this.input.detach();
    this.audio.dispose();
    this.world.dispose();
    this.approachWorld.dispose();
    this.carMesh.dispose();
    this.ghostMesh?.dispose();
    this.composer.dispose();
    this.skyDisposables.forEach((d) => d.dispose());
    this.renderer.dispose();
  }

  /** Skip the road trip and go straight to the circuit entrance. */
  skipApproach(): void {
    if (this.phase !== 'approach') return;
    this.enterCircuit();
  }

  // ---------------------------------------------------------------- loop
  private tick = (): void => {
    if (!this.running) return;
    this.frame = requestAnimationFrame(this.tick);

    const raw = this.clock.getDelta();
    if (this.paused) {
      this.composer.render();
      return;
    }

    const dt = Math.min(raw, 0.1);
    this.accumulator += dt;
    const STEP = 1 / 120;
    let steps = 0;
    while (this.accumulator >= STEP && steps < 12) {
      this.simulate(STEP);
      this.accumulator -= STEP;
      steps++;
    }

    this.updateVisuals(dt);
    this.updateCamera(dt);
    // The shadow box tracks the car so the map's texels stay where they matter.
    this.sun.position.copy(this.vehicle.position).add(SUN_OFFSET);
    this.sun.target.position.copy(this.vehicle.position);
    this.sky.position.copy(this.camera.position);
    this.composer.render();
    this.adaptQuality(raw);
    this.emitHud();
  };

  /**
   * Old integrated GPUs cannot hold 60 with the full pass, so quality sheds
   * itself: first the bloom, then the shadow map. Never re-arms upward —
   * flip-flopping between tiers looks worse than either tier does.
   */
  private adaptQuality(frameSeconds: number): void {
    this.frameCost += frameSeconds;
    this.frameSamples++;
    if (this.frameSamples < 150) return;
    const avgFps = this.frameSamples / this.frameCost;
    this.frameCost = 0;
    this.frameSamples = 0;

    if (avgFps < 45 && this.qualityTier === 0) {
      this.qualityTier = 1;
      if (this.bloomPass) this.bloomPass.enabled = false;
    } else if (avgFps < 38 && this.qualityTier === 1) {
      this.qualityTier = 2;
      this.sun.castShadow = false;
    }
  }

  private simulate(dt: number): void {
    const input = this.input.update(dt);

    if (this.countdown !== null) {
      this.countdown -= dt;
      if (this.countdown > 0) {
        // Hold the car on the spot. The driver may build revs, but the car must
        // not creep or roll back while the lights are still on.
        const held = { throttle: input.throttle, brake: 0, steer: 0, handbrake: true };
        this.telemetry = this.vehicle.step(dt, held, this.road);
        this.vehicle.vLong = 0;
        this.vehicle.vLat = 0;
        this.vehicle.yawRate = 0;
        return;
      }
      // The car is free the instant the count hits zero; the negative tail
      // keeps "GO" on screen for a moment while the launch is already live.
      if (this.countdown <= -0.7) this.countdown = null;
    }

    this.telemetry = this.vehicle.step(dt, input, this.road);
    this.topSpeed = Math.max(this.topSpeed, this.telemetry.speedKmh);

    this.applyDamage(this.telemetry, dt);
    if (this.vehicle.gear > this.lastGear) this.audio.shift();
    this.lastGear = this.vehicle.gear;

    if (this.phase === 'approach') {
      this.updateApproach();
    } else {
      if (this.phase === 'timing') this.lapTime += dt;
      this.trackProgress();
      this.recordGhost(dt);
    }

    this.updateMood(dt);
  }

  // ------------------------------------------------------------- damage
  /** Previous physics step's contact flag, for edge detection below. */
  private wasInContact = false;

  private applyDamage(t: VehicleTelemetry, dt: number): void {
    void dt;
    // The physics reports contact per 120 Hz step; grinding along the Armco
    // would otherwise count as 120 "hits" a second and spam the impact sound.
    // Only the rising edge — the moment the car first touches — is an event.
    const isNewHit = t.contact && !this.wasInContact;
    this.wasInContact = t.contact;
    if (!isNewHit) return;
    this.contacts++;

    const v = t.impactSpeed;
    this.audio.impact(Math.min(1, v / 18));
    if (v < 0.8) return; // a gentle graze against the Armco costs nothing

    rumble(Math.min(1, v / 14));

    // Repair cost rises steeply with closing speed, and with what the car is worth.
    const cost = 18 * Math.pow(v, 1.75) * this.repairRate;
    this.damageCost += cost;
    this.damage = Math.min(1, this.damage + v / 110);
    this.vehicle.condition = 1 - this.damage;

    if (v > 4) {
      this.setMood('angry', pick(ANGRY_LINES), 5);
    } else if (this.mood !== 'angry') {
      this.setMood('angry', 'Careful! That Armco is solid steel, you know.', 3.5);
    }
  }

  // ------------------------------------------------------------ approach
  private updateApproach(): void {
    this.vehicle.trackIndex = this.approach.nearestIndex(this.vehicle.position, this.vehicle.trackIndex, 40);
    if (this.vehicle.trackIndex >= this.approach.count - 3) {
      this.enterCircuit();
    }
  }

  private enterCircuit(): void {
    this.phase = 'outlap';
    const join = this.approach.joinIndex;
    // Carry the car's momentum onto the circuit rather than stopping it dead.
    const speed = this.vehicle.vLong;
    this.vehicle.placeOnTrack(this.track, join, 0);
    this.vehicle.vLong = speed;
    this.lastIndex = join;
    this.joinProgress = 0;
    this.lapProgress = 0;
    this.lapTime = 0;
    this.sectorTimes = [];
    this.sectorIndex = 0;
    this.setMood('cheer', "There she is. Over the line and the clock starts.", 5);
    this.callbacks.onArrived?.();
    this.updateCameraImmediate();
  }

  /** Accumulate signed progress around the ring; start and stop the clock. */
  private trackProgress(): void {
    const n = this.track.count;
    const idx = this.vehicle.trackIndex;
    let delta = idx - this.lastIndex;
    if (delta > n / 2) delta -= n;
    if (delta < -n / 2) delta += n;
    this.lastIndex = idx;

    if (this.phase === 'outlap') {
      this.joinProgress += delta;
      const toLine = n - this.approach.joinIndex;
      if (this.joinProgress >= toLine) {
        this.phase = 'timing';
        this.lapProgress = this.joinProgress - toLine;
        this.lapTime = 0;
        this.contacts = 0;
        this.topSpeed = 0;
        this.ghostRecording = [];
        this.setMood('cheer', "Clock's running! Let's see what you've got.", 5);
      }
      return;
    }

    this.lapProgress += delta;
    const fraction = this.lapProgress / n;

    while (
      this.sectorIndex < SECTOR_BOUNDS.length &&
      fraction >= (SECTOR_BOUNDS[this.sectorIndex + 1]?.at ?? 1)
    ) {
      this.sectorTimes.push({ name: SECTOR_BOUNDS[this.sectorIndex].name, time: this.lapTime });
      this.sectorIndex++;
    }

    if (this.lapProgress >= n) this.completeLap();
    else if (this.lapProgress < -n * 0.05) this.lapProgress = 0;
  }

  private completeLap(): void {
    const time = this.lapTime;
    if (this.sectorTimes.length < SECTOR_BOUNDS.length) {
      this.sectorTimes.push({ name: SECTOR_BOUNDS[SECTOR_BOUNDS.length - 1].name, time });
    }

    const previousBest = this.bestLap;
    const personalBest = previousBest === null || time < previousBest;

    const result: LapResult = {
      time,
      sectors: this.sectorTimes.slice(0, SECTOR_BOUNDS.length),
      clean: this.contacts === 0,
      topSpeedKmh: this.topSpeed,
      contacts: this.contacts,
      personalBest,
      previousBest,
      damageCost: Math.round(this.damageCost),
      damage: this.damage,
      discountPercent: discountFor(time, this.car.targetLapSec, this.damageCost),
    };

    if (personalBest) {
      this.bestLap = time;
      this.ghostBest = this.ghostRecording.slice();
      this.saveBest();
    }
    this.lastLap = time;
    this.audio.fanfare();
    this.callbacks.onLapComplete(result);

    // Ready for another lap, straight from the line.
    this.lapTime = 0;
    this.lapProgress = 0;
    this.sectorTimes = [];
    this.sectorIndex = 0;
    this.contacts = 0;
    this.topSpeed = 0;
    this.ghostRecording = [];
    this.ghostSampleTimer = 0;
    this.ensureGhostMesh();
  }

  // ---------------------------------------------------------- Herr Müller
  private setMood(mood: Mood, line: string, hold: number): void {
    // Never let a lesser mood interrupt a stronger one mid-hold.
    if (this.moodHold > 0 && MOOD_PRIORITY[mood] < MOOD_PRIORITY[this.mood]) return;
    this.mood = mood;
    this.moodLine = line;
    this.moodHold = hold;
  }

  private updateMood(dt: number): void {
    const t = this.telemetry;
    if (this.moodHold > 0) this.moodHold -= dt;
    this.restingLineTimer -= dt;

    if (t?.offTrack) {
      this.offTrackFor += dt;
      // One outburst per excursion, not a new one every frame.
      if (this.offTrackFor > 0.35 && this.mood !== 'scared') {
        this.setMood('scared', pick(SCARED_LINES), 4);
      }
    } else {
      this.offTrackFor = 0;
    }

    if (this.moodHold > 0) return;
    // Between events, settle the mood but only reword the line occasionally.
    if (this.restingLineTimer > 0) return;
    this.restingLineTimer = 6;

    // Nothing dramatic happening — settle back to a resting read of the drive.
    if (this.phase === 'approach') {
      this.mood = 'idle';
      this.moodLine = `${Math.max(0, Math.round(this.approachRemaining()))} m to the circuit entrance.`;
      return;
    }
    if (t && t.gripUsage > 0.96 && t.speedKmh > 90) {
      this.mood = 'happy';
      this.moodLine = pick(FLOW_LINES);
      return;
    }
    if (this.phase === 'timing' && this.bestLap !== null) {
      const delta = this.currentDelta();
      if (delta !== null && delta < -0.5) {
        this.mood = 'cheer';
        this.moodLine = "You're up on your best lap!";
        return;
      }
    }
    this.mood = 'idle';
    this.moodLine = this.phase === 'outlap' ? 'Out lap. Warm those tyres.' : pick(IDLE_LINES);
  }

  private approachRemaining(): number {
    if (this.phase !== 'approach') return 0;
    const done = this.approach.at(this.vehicle.trackIndex).s;
    return Math.max(0, this.approach.length - done);
  }

  // --------------------------------------------------------------- ghost
  private recordGhost(dt: number): void {
    if (this.phase !== 'timing') return;
    this.ghostSampleTimer += dt;
    if (this.ghostSampleTimer < GHOST_DT) return;
    // Carry the remainder instead of resetting to zero — a hard reset makes
    // every interval slightly longer than GHOST_DT and the drift adds up to
    // the ghost visibly lagging its own recorded lap after a few minutes.
    this.ghostSampleTimer -= GHOST_DT;
    this.ghostRecording.push({
      x: this.vehicle.position.x,
      y: this.vehicle.position.y,
      z: this.vehicle.position.z,
      yaw: this.vehicle.yaw,
      t: this.lapTime,
    });
  }

  /** Index of the last ghost sample at or before `t`, by binary search — no
   *  assumption about the sample grid, so replays survive any timing drift. */
  private ghostIndexFor(g: GhostSample[], t: number): number {
    let lo = 0;
    let hi = g.length - 2;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (g[mid].t <= t) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  private ensureGhostMesh(): void {
    if (!this.ghostBest || this.ghostMesh) return;
    const mesh = buildCarMesh({ ...this.car, color: 0x39c0ff, accent: 0x39c0ff }, { ghost: true });
    this.ghostMesh = mesh;
    this.scene.add(mesh.group);
  }

  private ghostSampleAt(t: number): GhostSample | null {
    const g = this.ghostBest;
    if (!g || g.length < 2) return null;
    if (t >= g[g.length - 1].t) return g[g.length - 1];
    const i = this.ghostIndexFor(g, t);
    const a = g[i];
    const b = g[i + 1];
    const span = b.t - a.t;
    const f = span > 1e-6 ? THREE.MathUtils.clamp((t - a.t) / span, 0, 1) : 0;
    return {
      x: a.x + (b.x - a.x) * f,
      y: a.y + (b.y - a.y) * f,
      z: a.z + (b.z - a.z) * f,
      yaw: a.yaw + shortestAngle(a.yaw, b.yaw) * f,
      t,
    };
  }

  private currentDelta(): number | null {
    const g = this.ghostBest;
    if (!g || g.length < 2 || this.phase !== 'timing') return null;
    const pos = this.vehicle.position;
    const seed = this.ghostIndexFor(g, this.lapTime);
    let best = seed;
    let bestDist = Infinity;
    for (let k = -90; k <= 90; k++) {
      const i = seed + k;
      if (i < 0 || i >= g.length) continue;
      const s = g[i];
      const d = (s.x - pos.x) ** 2 + (s.z - pos.z) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return this.lapTime - g[best].t;
  }

  // -------------------------------------------------------------- visuals
  private updateVisuals(dt: number): void {
    const v = this.vehicle;
    const g = this.carMesh.group;
    g.position.copy(v.position);
    g.rotation.set(0, 0, 0);
    g.rotateY(v.yaw);
    g.rotateX(v.pitch);
    g.rotateZ(-v.roll);

    const spin = (v.vLong / 0.34) * dt;
    for (const w of this.carMesh.wheels) w.rotation.x -= spin;
    // rotation.y is left-positive, the input is right-positive.
    const steerVis = THREE.MathUtils.clamp(-this.input.state.steer * 0.42, -0.42, 0.42);
    for (const fw of this.carMesh.frontWheels) fw.rotation.y = steerVis;

    const brakeMat = this.carMesh.brakeLights.material as THREE.MeshBasicMaterial;
    brakeMat.color.setHex(this.input.state.brake > 0.06 ? 0xff2a1a : 0x3a0806);

    this.carMesh.setDamage(this.damage);

    if (this.ghostMesh && this.ghostBest && this.phase === 'timing') {
      const sample = this.ghostSampleAt(this.lapTime);
      if (sample) {
        this.ghostMesh.group.visible = true;
        this.ghostMesh.group.position.set(sample.x, sample.y, sample.z);
        this.ghostMesh.group.rotation.set(0, sample.yaw, 0);
      } else {
        this.ghostMesh.group.visible = false;
      }
    } else if (this.ghostMesh) {
      this.ghostMesh.group.visible = false;
    }

    const t = this.telemetry;
    if (t) {
      const slip = THREE.MathUtils.clamp((t.gripUsage - 0.9) * 2.5, 0, 1);
      this.audio.update(t.rpm / this.car.redlineRpm, this.input.state.throttle, t.speedKmh, slip);
    }
  }

  // --------------------------------------------------------------- camera
  private cycleCamera(): void {
    this.cameraMode = this.cameraMode === 'chase' ? 'bonnet' : this.cameraMode === 'bonnet' ? 'cockpit' : 'chase';
    this.carMesh.group.visible = this.cameraMode === 'chase';
  }

  private desiredCamera(): { pos: THREE.Vector3; look: THREE.Vector3; fov: number } {
    const v = this.vehicle;
    const fwd = v.forward;
    const left = v.left;
    const speedFactor = Math.min(Math.abs(v.vLong) / 90, 1);

    if (this.cameraMode === 'chase') {
      const back = 6.4 + speedFactor * 2.2;
      const pos = v.position.clone().addScaledVector(fwd, -back);
      pos.y += 2.5 + speedFactor * 0.5;
      const look = v.position.clone().addScaledVector(fwd, 8 + speedFactor * 10);
      look.y += 0.9;
      return { pos, look, fov: 66 + speedFactor * 12 };
    }

    if (this.cameraMode === 'bonnet') {
      const pos = v.position.clone().addScaledVector(fwd, this.car.size[2] * 0.2 + 0.9);
      pos.y += this.car.size[2] * 0.72;
      const look = v.position.clone().addScaledVector(fwd, 40);
      look.y += this.car.size[2] * 0.6;
      return { pos, look, fov: 72 + speedFactor * 10 };
    }

    const seat = this.car.size[1] * 0.21;
    const pos = v.position.clone().addScaledVector(fwd, this.car.size[2] * 0.1).addScaledVector(left, seat);
    pos.y += this.car.size[2] * 0.56;
    const look = v.position.clone().addScaledVector(fwd, 40).addScaledVector(left, seat);
    look.y += this.car.size[2] * 0.5;
    return { pos, look, fov: 74 + speedFactor * 8 };
  }

  private updateCamera(dt: number): void {
    const { pos, look, fov } = this.desiredCamera();
    const lerp = this.cameraMode === 'chase' ? Math.min(1, dt * 7) : 1;
    this.cameraPos.lerp(pos, lerp);
    this.cameraLook.lerp(look, Math.min(1, dt * 9));

    this.camera.position.copy(this.cameraPos);
    this.camera.lookAt(this.cameraLook);

    if (this.telemetry) {
      const tilt = THREE.MathUtils.clamp(-this.telemetry.lateralG * 0.035, -0.07, 0.07);
      this.camera.rotateZ(tilt);
    }

    this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 4);
    this.camera.updateProjectionMatrix();
  }

  private updateCameraImmediate(): void {
    const { pos, look } = this.desiredCamera();
    this.cameraPos.copy(pos);
    this.cameraLook.copy(look);
    this.camera.position.copy(pos);
    this.camera.lookAt(look);
  }

  // ----------------------------------------------------------------- misc
  recover(): void {
    const road = this.road;
    const idx = road.nearestIndexGlobal(this.vehicle.position);
    this.vehicle.placeOnTrack(road, idx, 0);
    this.lastIndex = idx;
    this.input.reset();
    this.updateCameraImmediate();
    this.setMood('scared', 'Right, back on the black stuff. Slower in this time, eh?', 4);
  }

  private emitHud(): void {
    const t = this.telemetry;
    const idx = this.vehicle.trackIndex;
    const n = this.track.count;
    const ghost = this.phase === 'timing' ? this.ghostSampleAt(this.lapTime) : null;

    this.callbacks.onHud({
      phase: this.phase,
      speedKmh: t?.speedKmh ?? 0,
      rpmRatio: (t?.rpm ?? 0) / this.car.redlineRpm,
      gear: this.vehicle.gear,
      lapTime: this.lapTime,
      bestLap: this.bestLap,
      lastLap: this.lastLap,
      sectionName: this.phase === 'approach' ? 'Approach · Burgstrasse' : this.track.sectionNameAt(idx),
      distance: this.phase === 'approach' ? 0 : this.track.distanceAt(idx),
      lapLength: this.track.lapLength,
      offTrack: t?.offTrack ?? false,
      gripUsage: t?.gripUsage ?? 0,
      lateralG: t?.lateralG ?? 0,
      countdown: this.countdown,
      delta: this.currentDelta(),
      sectors: this.sectorTimes,
      contacts: this.contacts,
      progress: this.phase === 'timing' ? THREE.MathUtils.clamp(this.lapProgress / n, 0, 1) : 0,
      carPos: { x: this.vehicle.position.x, z: this.vehicle.position.z },
      ghostPos: ghost ? { x: ghost.x, z: ghost.z } : null,
      approachRemaining: this.approachRemaining(),
      damage: this.damage,
      damageCost: Math.round(this.damageCost),
      muellerMood: this.mood,
      muellerLine: this.moodLine,
      reversing: this.vehicle.vLong < -0.2,
    });
  }

  // ------------------------------------------------------------ persistence
  private storageKey(): string {
    return `r4r.best.${this.car.id}`;
  }

  private saveBest(): void {
    try {
      localStorage.setItem(
        this.storageKey(),
        JSON.stringify({ time: this.bestLap, ghost: this.ghostBest?.slice(0, GHOST_SAVE_CAP) ?? [] }),
      );
    } catch {
      /* storage unavailable — best lap simply will not persist */
    }
  }

  private loadBest(): void {
    try {
      const raw = localStorage.getItem(this.storageKey());
      if (!raw) return;
      const parsed = JSON.parse(raw) as { time: number; ghost: GhostSample[] };
      if (typeof parsed.time === 'number' && Number.isFinite(parsed.time)) this.bestLap = parsed.time;
      if (Array.isArray(parsed.ghost)) {
        const clean = parsed.ghost.filter(
          (s) =>
            s &&
            Number.isFinite(s.x) &&
            Number.isFinite(s.y) &&
            Number.isFinite(s.z) &&
            Number.isFinite(s.yaw) &&
            Number.isFinite(s.t),
        );
        if (clean.length > 2) {
          this.ghostBest = clean;
          this.ensureGhostMesh();
        }
      }
    } catch {
      /* corrupt entry — ignore and start fresh */
    }
  }
}

/** Direction the sun sits from the car; matches the fixed light in the sky. */
const SUN_OFFSET = new THREE.Vector3(-160, 240, 110);

/** Ghost sample interval, seconds. */
const GHOST_DT = 0.08;

/**
 * Persisted-ghost cap: 12,000 samples at GHOST_DT is 16 minutes — comfortably
 * past the slowest sensible lap, where the old 4,000 cut a 10-minute lap off
 * mid-circuit. Roughly 700 KB of JSON, well inside the localStorage budget.
 */
const GHOST_SAVE_CAP = 12000;

const MOOD_PRIORITY: Record<Mood, number> = {
  idle: 0,
  happy: 1,
  cheer: 2,
  scared: 3,
  angry: 4,
  trophy: 5,
};

/** Money, panels and wounded pride — one gets picked per proper thump. */
const ANGRY_LINES = [
  'That was the Armco! Have you any idea what a wing costs?',
  'Right, hand over the Amex. We both know where this is going.',
  'Lovely. Another invoice with your name at the top.',
  'The panels do not pay for themselves, you know.',
  'That noise? That was your deposit leaving the building.',
  'What exactly have I done to you to deserve this?',
  'Do that again and you can walk back to Nurburg. Downhill, mind.',
  'I rent these out. Rent. As in, you give them back.',
  'Marvellous. I shall put the kettle on and ring the body shop.',
  'Do you drive your own car like that? No? Funny, that.',
  'Every scrape is another week I do not get a holiday.',
  'The barrier was there yesterday. It will be there tomorrow. Go around it.',
  'That is four figures, that is. Possibly five, if you fancy another go.',
  'You have upset me, and you have upset the front wing.',
  'Careful — the Armco already paid for the coffee machine this year.',
  'Kiss the Armco once more and the Amex stays with me. Permanently.',
  'I heard that from the office. THE OFFICE.',
  'My accountant sends his regards. And an invoice.',
  'Somewhere a panel beater just bought a boat. Because of you.',
  'That paint was three days in the booth. Three. Days.',
  'Is it me? Be honest. Are you doing this to wind me up?',
  'Go on, have another swing at it. The barrier is undefeated, mind.',
  'Congratulations, you have found the most expensive line through that corner.',
  'You know insurance excess is a thing, yes? You are about to learn.',
  'Deep breaths, Müller. Deep breaths. Think of the deposit.',
  'The steering wheel. Round thing, right in front of you. USE it.',
  'That crunch was not the gearbox. That was my heart.',
];

/** Off in the grass, chewing his knuckles. */
const SCARED_LINES = [
  'Grass! Grass! Get it back on the tarmac!',
  'Oh no, oh no, oh no...',
  'I cannot watch. Tell me when it is over.',
  'Not the barrier, please not the barrier...',
  'That is my pension you are sliding towards.',
  'Steer. Steer! Any direction will do at this point.',
  'I have gone right off you, I really have.',
  'Lift! For the love of God, lift!',
  'Mother said get a proper job. I did not listen.',
  'The gravel! Mind the — that is the gravel.',
  'I am not looking. I am absolutely not looking.',
  'Both hands on the wheel! BOTH of them!',
  'There is a lawn mower for that, you know.',
  'If this ends badly, tell my fleet I loved them.',
];

/** Resting commentary — one of these while nothing dramatic is happening. */
const IDLE_LINES = [
  'Nicely does it. Keep your head.',
  'Smooth is fast. Fast is fewer invoices.',
  'Good. Boring. I love boring.',
  'Keep it just like that and we stay friends.',
  'See? The road. Lovely place for a car.',
  'Textbook. Almost suspiciously textbook.',
  'My blood pressure thanks you.',
  'Tidy lines. The accountant is asleep. Perfect.',
];

const FLOW_LINES = [
  'That is it — right on the limit and tidy with it.',
  'Oh, now you are driving. Keep that up.',
  'Proper job! The tyres are singing, not screaming.',
  'Beautiful. Like it is on rails. MY rails, mind.',
];

function pick(list: string[]): string {
  return list[Math.floor(Math.random() * list.length)];
}

/** Crash feedback: vibrate the phone and any connected gamepad. */
function rumble(strength: number): void {
  const ms = Math.round(60 + strength * 240);
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* not supported */
  }
  try {
    for (const pad of navigator.getGamepads?.() ?? []) {
      const actuator = (pad as unknown as {
        vibrationActuator?: {
          playEffect(type: string, params: Record<string, number>): Promise<unknown>;
        };
      } | null)?.vibrationActuator;
      actuator?.playEffect('dual-rumble', {
        duration: ms,
        strongMagnitude: Math.min(1, strength),
        weakMagnitude: Math.min(1, strength * 0.6),
      });
    }
  } catch {
    /* no haptics */
  }
}

function shortestAngle(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
