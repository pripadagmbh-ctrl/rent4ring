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
import { type CarMesh } from './carMesh';
import { buildVehicleMesh } from './vehicleMesh';
import { buildTowTruck, type TowTruck } from './towTruck';
import { buildCrowd, type Crowd } from './crowd';
import { buildSpeedCamera, type SpeedCamera } from './speedCamera';
import { buildSkidMarks, type SkidMarks } from './skidmarks';
import { startSpill, type Spill } from './spill';
import { buildAmbulance } from './ambulance';
import { buildPoliceCar, type PoliceCar } from './police';
import { buildEscort, type Escort } from './escort';
import { InputManager, type CameraMode } from './input';
import { EngineAudio } from './audio';
import type { Mood } from '../ui/Gorilla';
import { farewellLine, type MuellerLine } from '../data/muellerLines';
import { DALE_APOLOGIES, DALE_WORRIED, tipFor, type DaleTip } from '../data/daleTips';
import { departureRoute, departureSpeedAt, fleetParkingSpots, homeBaseFrame, toWorld, YARD_Y, type DepartureRoute } from './departure';
import { FLEET } from '../data/fleet';

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
  /** Speeding fines picked up on the public road, euros. */
  finesEuro: number;
}

/**
 * `departure` is the scripted roll out of the yard — the car drives itself and
 * the HUD presents it as part of the approach.
 */
export type Phase = 'departure' | 'approach' | 'outlap' | 'timing' | 'retired';

/** A speeding ticket from the village camera on the way to the circuit. */
export interface SpeedTicket {
  limitKmh: number;
  measuredKmh: number;
  /** After the statutory tolerance has been deducted. */
  chargedKmh: number;
  overBy: number;
  fineEuro: number;
  points: number;
  banMonths: number;
  /**
   * Which vehicle was caught, for the notice. The camera photographs whoever
   * was riding, and when that is Herr Müller on his own Panigale the whole
   * document reads differently — it is his name on the registration *and* his
   * face in the picture.
   */
  vehicle: string;
  /** True when Herr Müller himself was the one caught. */
  self: boolean;
}

/** Handed to the UI when the damage bar fills and the drive is over. */
export interface Retirement {
  /** Repair bill at the moment of the flag, euros. */
  damageCost: number;
  contacts: number;
  /** How many times this browser has now been thrown out. */
  banCount: number;
  /**
   * True when it was Herr Müller who ran out, not the car. Then there is no
   * ban to hand out — it is his bike and his fault — and an ambulance comes
   * instead of the recovery truck.
   */
  rider: boolean;
}

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
  /**
   * 0-1. In a car this is bodywork; on the bike it is Herr Müller, because he
   * owns the Panigale and a bill he sends himself decides nothing. What ends
   * a ride on it is the man, so that is what the bar has to show.
   */
  damage: number;
  /** True while the bar is measuring the rider rather than the vehicle. */
  damageIsRider: boolean;
  damageCost: number;
  muellerMood: Mood;
  muellerLine: string;
  /** True while the car is backing up, so the HUD can show R. */
  reversing: boolean;
  /**
   * One extra readout, chosen to suit the car being driven — a wing car is
   * read by its downforce, an EV by motor speed, and everything else by how
   * hard it is leaning on the tyres. See `instrumentReadout`.
   */
  instrument: { label: string; value: string };
  /** Dale's current call from the passenger seat, or null when he is quiet. */
  dale: { text: string; kind: DaleTip['kind']; apologising: boolean } | null;
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
  /** The damage bar filled: black flag, recovery truck, and out. */
  onRetired(result: Retirement): void;
  /** Caught by the village speed camera on the public road. */
  onTicket(ticket: SpeedTicket): void;
  /**
   * The send-off Herr Müller gave in the garage. Starting straight from the
   * menu skips the garage, so the drive picks its own when this is absent.
   */
  departureLine?: MuellerLine | null;
}

// The centreline data is immutable, and rebuilding ~3.500 smoothed points on
// every drive start is pure waste — one shared instance serves every Game.
let sharedTrack: Track | null = null;
let sharedApproach: Approach | null = null;

export class Game {
  readonly track = (sharedTrack ??= new Track());
  readonly approach = (sharedApproach ??= new Approach());
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
  /** The rest of the fleet, parked in the yard as scenery. */
  private parkedFleet: CarMesh[] = [];
  private ghostMesh: CarMesh | null = null;

  private cameraMode: CameraMode = 'chase';
  private cameraPos = new THREE.Vector3();
  private cameraLook = new THREE.Vector3();

  private running = false;
  private paused = false;
  private frame = 0;
  private clock = new THREE.Clock();
  private accumulator = 0;
  private pausedFrames = 0;

  // ------------------------------------------------------------ lap state
  phase: Phase = 'departure';
  private countdown: number | null = 3.2;
  /** The scripted roll out of the yard, driven kinematically. */
  private readonly departure: DepartureRoute;
  private departureS = 0;
  private departureV = 0;
  /** Visual steering during the script, in DriveInput convention (+1 right). */
  private departureSteer = 0;
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

  // ------------------------------------------------------------- the law
  /** The Starenkasten in the village, and whether it has had you yet. */
  private speedCamera: SpeedCamera | null = null;
  private skidMarks: SkidMarks | null = null;
  /** Seconds of wheelie left, and the eased nose-up angle in radians. */
  private wheelieFor = 0;
  private wheelieAngle = 0;
  /** Herr Müller off the bike and picking himself up, or null. */
  private spill: Spill | null = null;
  /**
   * On the bike the damage bar is *him*, not the machine. He owns the Panigale,
   * so a repair bill is money out of one pocket into the other; what actually
   * ends a ride is the man. Cars keep the old meaning.
   */
  private riderHurt = 0;
  /** How long the bike's tyres have been asked for more than they have. */
  private overGripFor = 0;
  /** Seconds until Dale says the next worried thing about his partner. */
  private daleWorryIn = 3;
  /** The patrol car, once the camera has given it a reason to exist. */
  /** Tanju, riding sweep. Only exists while Herr Müller is on the Panigale. */
  private escort: Escort | null = null;
  private police: PoliceCar | null = null;
  /** How far back down the approach it is, in metres. */
  private policeBehind = 0;
  private policeFor = 0;
  private ticketed = false;
  /** Running total of fines, kept apart from the repair bill. */
  private fines = 0;

  /**
   * A patrol car pulls out behind you. It is not a chase you can lose by
   * driving well — it gives up at the circuit gate, because the Nordschleife
   * is private ground and the StVO stops at the barrier. That is the whole
   * joke, and Herr Müller is the one who says it out loud.
   */
  private sendPolice(): void {
    if (this.police) return;
    const car = buildPoliceCar();
    this.police = car;
    this.policeBehind = POLICE_START_BEHIND_M;
    this.policeFor = 0;
    this.scene.add(car.group);
    this.setMood('scared', pick(POLICE_LINES), 6);
  }

  /**
   * Keeps the patrol car on the approach centreline a set distance back, and
   * closes that distance steadily. Placed along the road rather than driven by
   * physics: it has to follow the same curve you are on and arrive at the gate
   * when you do, and a second driving model would only find new ways to end up
   * in a hedge.
   */
  private updatePolice(dt: number): void {
    const car = this.police;
    if (!car) return;
    this.policeFor += dt;
    car.update(this.policeFor);

    // Closes in, but never quite arrives — it is pressure, not a collision.
    this.policeBehind = Math.max(POLICE_CLOSEST_M, this.policeBehind - POLICE_CLOSING_MS * dt);

    const spacing = this.approach.spacing;
    const back = Math.max(0, this.vehicle.trackIndex - this.policeBehind / spacing);
    const p = this.approach.at(back);
    car.group.position.copy(p.pos).addScaledVector(p.normal, -1.2);
    car.group.rotation.y = Math.atan2(p.tangent.x, p.tangent.z);
    for (const w of car.wheels) w.rotation.x -= (this.vehicle.speed / 0.33) * dt;

    // Off the public road, off the hook.
    if (this.phase !== 'approach') {
      // This one is allowed to interrupt. `setMood` refuses a lesser mood
      // mid-hold, and relief ranks below panic — but the panic was *about*
      // this, and reaching the gate quickly would otherwise swallow the payoff
      // entirely. The situation has changed, so the hold no longer applies.
      this.moodHold = 0;
      this.setMood('happy', pick(POLICE_GONE_LINES), 5);
      this.scene.remove(car.group);
      car.dispose();
      this.police = null;
    }
  }

  // ---------------------------------------------------------------- Dale
  /** What he is saying, and for how much longer. */
  private daleLine: { text: string; kind: DaleTip['kind']; apologising: boolean } | null = null;
  private daleHold = 0;
  /** The section his last call was for, so one corner gets one call. */
  private daleSection = '';
  /** Rotates his alternatives, so a second lap is not a repeat of the first. */
  private daleVariant = 0;
  /** He does not apologise for every scrape. */
  private daleApologyCooldown = 0;

  // ---------------------------------------------------------- retirement
  /** The regulars stood in the yard, waving the car out. */
  private crowd: Crowd | null = null;
  /** Wall clock for animation that is not tied to the physics step. */
  private elapsed = 0;

  private towTruck: TowTruck | null = null;
  private towFrom = new THREE.Vector3();
  private towTo = new THREE.Vector3();
  private retiredFor = 0;
  private retiredLine = 0;
  private retiredReported = false;

  // -------------------------------------------------------------- damage
  private damage = 0;
  private damageCost = 0;
  private repairRate: number;
  /** The physics reports `contact` per 120 Hz step; these debounce it into events. */
  private inContact = false;
  private contactCooldown = 0;

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
    this.scene.fog = new THREE.Fog(0xa9b4ae, 260, 1500);

    // Environment reflections keep metallic paint reading as paint.
    {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      const roomEnv = new RoomEnvironment();
      // pmrem.dispose() frees the generator but not the baked render target —
      // keep that in skyDisposables so dispose() can free it.
      const envRT = pmrem.fromScene(roomEnv, 0.04);
      this.scene.environment = envRT.texture;
      this.scene.environmentIntensity = 0.4;
      pmrem.dispose();
      roomEnv.dispose();
      this.skyDisposables.push(envRT);
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

    this.world = buildWorld(this.track, this.approach);
    this.scene.add(this.world.root);
    this.approachWorld = buildApproachWorld(this.approach, this.track);
    this.scene.add(this.approachWorld.root);

    this.carMesh = buildVehicleMesh(car);
    this.carMesh.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    this.scene.add(this.carMesh.group);

    // The rest of the fleet, parked on the apron beside the ramp. The car
    // being driven is left out — its bay is the empty one in the row. Built
    // here rather than in world.ts because carMesh already imports from
    // there, and world importing it back would close an import cycle.
    const parked = FLEET.filter((c) => c.id !== car.id);
    const spots = fleetParkingSpots(this.approach, parked.length);
    parked.forEach((other, i) => {
      const mesh = buildVehicleMesh(other);
      mesh.group.position.copy(spots[i].position);
      mesh.group.rotation.y = spots[i].yaw;
      mesh.group.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.castShadow = true;
      });
      this.scene.add(mesh.group);
      this.parkedFleet.push(mesh);
    });

    // Herr Müller's regulars, stood in front of the shed to see you off. The
    // crowd is built in its own local frame, so it only needs the yard's
    // position and heading to be dropped into place.
    // The Starenkasten, on the straightest stretch of the village road —
    // 276 m out, where the road opens up and the limit is the last thing on
    // anyone's mind. Measured off the route: index 46 turns 0.8 degrees over
    // fifteen points, the straightest run on the whole approach.
    const camPoint = this.approach.at(SPEED_CAMERA_INDEX);
    const starenkasten = buildSpeedCamera();
    starenkasten.group.position
      .copy(camPoint.pos)
      .addScaledVector(camPoint.normal, -(camPoint.halfWidth + 1.6));
    starenkasten.group.rotation.y = Math.atan2(camPoint.tangent.x, camPoint.tangent.z);
    this.scene.add(starenkasten.group);
    this.speedCamera = starenkasten;

    // Rubber on the road. Added to the scene rather than to the car, because
    // the marks stay where they were laid while the car drives away.
    const marks = buildSkidMarks();
    this.scene.add(marks.mesh);
    this.skidMarks = marks;

    // Nobody lets a man of fifty-eight go out on a superbike on his own.
    if (car.bike) {
      const tanju = buildEscort();
      this.scene.add(tanju.group);
      this.escort = tanju;
    }

    const yard = homeBaseFrame(this.approach);
    const crowd = buildCrowd();
    crowd.group.position.copy(toWorld(yard, 0, YARD_Y, 0));
    crowd.group.rotation.y = yard.yaw;
    crowd.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    this.scene.add(crowd.group);
    this.crowd = crowd;

    // ------------------------------------------------------ post-processing
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    if (!this.lowPower) {
      // Subtle bloom lifts brake lights, the sky and painted metal.
      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(canvas.clientWidth, canvas.clientHeight),
        0.32,
        0.5,
        0.9,
      );
      this.composer.addPass(this.bloomPass);
    }
    const vignette = new ShaderPass(VignetteShader);
    vignette.uniforms.offset.value = 0.92;
    vignette.uniforms.darkness.value = 1.08;
    this.composer.addPass(vignette);
    this.composer.addPass(new OutputPass());

    // Start inside the shed at Burgstraße 1; the departure script drives the
    // first metres, then hands over on the road.
    this.departure = departureRoute(this.approach);
    const start = this.departure.curve.getPointAt(0);
    const startTangent = this.departure.curve.getTangentAt(0);
    this.vehicle.position.copy(start);
    this.vehicle.yaw = Math.atan2(startTangent.x, startTangent.z);
    this.lastIndex = 0;

    // Open on Herr Müller's send-off, so the drive begins where the garage
    // left off. A straight-from-the-menu start has none, so pick one here.
    const sendOff = callbacks.departureLine ?? farewellLine(car.id);
    this.mood = sendOff.mood;
    this.moodLine = sendOff.text;
    // Hold it past the countdown, or the resting commentary talks over him.
    this.moodHold = 6;

    // Camera and recover must not fire while a dialog owns the screen —
    // teleporting the car from inside the ceremony was possible before.
    this.input.onCameraToggle = () => {
      if (!this.paused) this.cycleCamera();
    };
    this.input.onWheelie = () => this.startWheelie();
    this.input.onReset = () => {
      if (!this.paused) this.recover();
    };
    this.input.attach();

    this.loadBest();
    this.updateCameraImmediate();
  }

  /** The road the car is currently driving on. */
  private get road(): RoadPath {
    return this.phase === 'approach' || this.phase === 'departure' ? this.approach : this.track;
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
    this.audio.setMuted(muted || this.paused);
    this.audio.setUserMuted(muted);
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
    for (const parked of this.parkedFleet) parked.dispose();
    this.parkedFleet = [];
    this.ghostMesh?.dispose();
    // Only ever built if the drive ended under the black flag, but it holds
    // its own geometries and materials like everything else here.
    this.towTruck?.dispose();
    this.towTruck = null;
    this.crowd?.dispose();
    this.crowd = null;
    this.speedCamera?.dispose();
    this.police?.dispose();
    this.escort?.dispose();
    this.skidMarks?.dispose();
    this.speedCamera = null;
    this.composer.dispose();
    this.skyDisposables.forEach((d) => d.dispose());
    this.renderer.dispose();
  }

  /** Skip the road trip and go straight to the circuit entrance. */
  skipApproach(): void {
    if (this.phase !== 'approach' && this.phase !== 'departure') return;
    this.enterCircuit();
  }

  // ---------------------------------------------------------------- loop
  private tick = (): void => {
    if (!this.running) return;
    this.frame = requestAnimationFrame(this.tick);

    const raw = this.clock.getDelta();
    if (this.paused) {
      // The dialog's backdrop blur only needs a live frame now and then;
      // rendering flat out in pause just warms phones and drains batteries.
      this.pausedFrames = (this.pausedFrames + 1) % 30;
      if (this.pausedFrames === 1) this.composer.render();
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
    let input = this.input.update(dt);

    if (this.spill) {
      this.updateSpill(dt);
      this.updateMood(dt);
      return;
    }

    if (this.phase === 'departure') {
      this.updateDeparture(dt);
      this.updateMood(dt);
      return;
    }

    if (this.phase === 'retired') {
      this.updateRetirement(dt);
      return;
    }

    if (this.countdown !== null) {
      this.countdown -= dt;
      if (this.countdown <= 0) {
        this.countdown = null;
      } else {
        // Hold the car on the spot. The driver may build revs, but the car must
        // not creep or roll back while the lights are still on.
        const held = { throttle: input.throttle, brake: 0, steer: 0, handbrake: true };
        this.telemetry = this.vehicle.step(dt, held, this.road);
        this.vehicle.vLong = 0;
        this.vehicle.vLat = 0;
        this.vehicle.yawRate = 0;
        return;
      }
    }

    // A front wheel in the air steers nothing much, so the input is trimmed
    // before it reaches the physics rather than after — trimming afterwards
    // would leave the HUD and the front-wheel visual disagreeing with the car.
    if (this.wheelieFor > 0) {
      input = { ...input, steer: input.steer * WHEELIE_STEER };
    }
    this.telemetry = this.vehicle.step(dt, input, this.road);
    this.updateWheelie(dt);
    this.checkLowside(dt);
    this.topSpeed = Math.max(this.topSpeed, this.telemetry.speedKmh);

    this.applyDamage(this.telemetry, dt);
    if (this.vehicle.gear > this.lastGear) this.audio.shift();
    this.lastGear = this.vehicle.gear;

    if (this.phase === 'approach') {
      this.checkSpeedCamera();
      this.updatePolice(dt);
      this.updateApproach();
    } else {
      if (this.phase === 'timing') this.lapTime += dt;
      this.trackProgress();
      this.recordGhost(dt);
    }

    this.updateMood(dt);
    this.updateDale(dt);
  }

  // ------------------------------------------------------------- damage
  private applyDamage(t: VehicleTelemetry, dt: number): void {
    this.contactCooldown = Math.max(0, this.contactCooldown - dt);
    const fresh = t.contact && !this.inContact && this.contactCooldown <= 0;
    this.inContact = t.contact;

    // Fed every frame, above the early return: the scrape has to be told when
    // the car comes off the barrier as well as when it goes on, or it would
    // hold the last value it was given and grind away over an empty road.
    // Full at 90 km/h — the barrier is not louder for going faster than that,
    // and a car sliding at walking pace should barely be heard.
    this.audio.scrape(t.contact ? Math.min(1, t.speedKmh / 90) : 0);
    if (!t.contact) return;

    const v = t.impactSpeed;
    // Count events, not frames: a scrape along the Armco reports contact on
    // every 120 Hz step, but it is one contact — count and thump only on the
    // contact-free-to-contact edge, with a short cooldown against chatter.
    if (fresh) {
      this.audio.impact(Math.min(1, v / 18));
      this.contactCooldown = 0.3;
      if (v >= 0.8) this.contacts++;
    }
    if (v < 0.8) return; // a gentle graze against the Armco costs nothing

    rumble(Math.min(1, v / 14));

    // Repair cost rises steeply with closing speed, and with what the car is worth.
    const cost = 18 * Math.pow(v, 1.75) * this.repairRate;
    this.damageCost += cost;
    this.damage = Math.min(1, this.damage + v / 110);
    this.vehicle.condition = 1 - this.damage;

    // On the bike a hit hurts the rider rather than the balance sheet, and a
    // solid one puts him over the bars.
    // (The other way a bike ends up on its side is `checkLowside`, which does
    // not need a barrier at all.)
    if (this.car.bike && v >= SPILL_FROM_MS) {
      this.riderHurt = Math.min(1, this.riderHurt + v / 26);
      this.throwRider(v);
      return;
    }

    if (this.damage >= 1) {
      this.retire();
      return;
    }

    if (v > 4) {
      this.daleApologise();
      this.setMood('angry', pick(this.ranting.angry), 5);
    } else if (this.mood !== 'angry') {
      this.setMood(
        'angry',
        this.car.bike
          ? 'Careful, Mueller. That Armco is solid steel and you know it.'
          : 'Careful! That Armco is solid steel, you know.',
        3.5,
      );
    }
  }

  /**
   * On the bike he is the rider, so there is nobody to blame but himself and
   * the whole commentary flips. One accessor, so the anger and the black-flag
   * rant can never disagree about who is at fault.
   */
  private get ranting(): { angry: string[]; retired: string[] } {
    return this.car.bike
      ? { angry: SELF_ANGRY_LINES, retired: SELF_RETIRED_LINES }
      : { angry: ANGRY_LINES, retired: RETIRED_LINES };
  }

  // ------------------------------------------------------------- the law
  /**
   * The village camera. On the public road the StVO applies, whatever is in
   * the garage behind you.
   *
   * Triggered on passing the post rather than on a radius, so creeping past
   * it slowly and then flooring it does not count — same as the real thing.
   * The statutory tolerance is deducted before the fine: 3 km/h below 100,
   * 3 per cent above it.
   */
  /**
   * A motorcycle that runs out of grip does not drift, it falls over.
   *
   * The bicycle model underneath is shared with the cars, and past the limit
   * it does what a car does: shares the friction circle and slides, which on
   * two wheels is a thing that cannot happen. So the moment the tyres are
   * genuinely overworked for longer than a twitch, the bike lowsides and the
   * existing spill takes over — which is also what makes leaning worth
   * anything, because now there is a price for asking too much of it.
   *
   * A brief spike is not a crash: kerbs and crests push grip usage past 1 for
   * a frame or two constantly, and going down for that would be unplayable.
   */
  private checkLowside(dt: number): void {
    if (this.car.bike !== true || this.spill) return;
    const t = this.telemetry;
    if (!t || t.speedKmh < LOWSIDE_MIN_KMH) {
      this.overGripFor = 0;
      return;
    }
    if (t.gripUsage < LOWSIDE_GRIP) {
      this.overGripFor = 0;
      return;
    }
    this.overGripFor += dt;
    if (this.overGripFor < LOWSIDE_SECONDS) return;

    this.overGripFor = 0;
    // A lowside hurts less than hitting something, but it still hurts, and it
    // hurts more the faster you were going when the front let go.
    this.riderHurt = Math.min(1, this.riderHurt + t.speedKmh / 900);
    this.throwRider(Math.min(9, t.speedKmh / 14));
  }

  private checkSpeedCamera(): void {
    if (this.ticketed || !this.speedCamera) return;
    const i = this.vehicle.trackIndex;
    if (i < SPEED_CAMERA_INDEX || i > SPEED_CAMERA_INDEX + 3) return;

    const measured = this.telemetry?.speedKmh ?? 0;
    const charged = measured - (measured <= 100 ? 3 : measured * 0.03);
    const over = Math.round(charged - VILLAGE_LIMIT_KMH);
    this.ticketed = true;
    if (over <= 0) return;

    const { fine, points, banMonths } = penaltyFor(over);
    this.fines += fine;
    this.speedCamera.trigger();
    // Caught on his own motorcycle, the whole speech changes: there is nobody
    // to bill, nobody to be furious with, and the points are his.
    this.setMood(
      this.car.bike === true ? 'scared' : 'angry',
      pick(this.car.bike === true ? TICKET_SELF_LINES : TICKET_LINES),
      6,
    );
    this.sendPolice();
    this.callbacks.onTicket({
      limitKmh: VILLAGE_LIMIT_KMH,
      measuredKmh: Math.round(measured),
      chargedKmh: Math.round(charged),
      overBy: over,
      fineEuro: fine,
      points,
      banMonths,
      vehicle: `${this.car.brand} ${this.car.model}`,
      self: this.car.bike === true,
    });
  }

  // ---------------------------------------------------------------- Dale
  /**
   * His call for whatever is coming, said early enough to act on.
   *
   * The look-ahead is a time, not a distance: a call two hundred metres out
   * is ample warning in a MINI and far too late in the Taycan. Three seconds
   * of travel puts it in the same place relative to the corner whatever you
   * are driving, with a floor so it still works at walking pace.
   */
  private updateDale(dt: number): void {
    this.daleHold = Math.max(0, this.daleHold - dt);
    this.daleApologyCooldown = Math.max(0, this.daleApologyCooldown - dt);
    if (this.daleHold <= 0 && this.daleLine && !this.daleLine.apologising) this.daleLine = null;
    if (this.daleHold <= 0 && this.daleLine?.apologising) this.daleLine = null;

    if (this.phase === 'departure' || this.phase === 'approach' || this.phase === 'retired') return;

    // When Herr Müller is the one riding, Dale stops instructing. You do not
    // instruct a man on his own bike who has ridden here longer than you have
    // known him — you watch your business partner do something dangerous and
    // say so, and you say it more often the worse it is going.
    if (this.car.bike) {
      this.daleWorryIn -= dt;
      if (this.daleWorryIn > 0 || this.daleHold > 0) return;
      const tone =
        this.riderHurt > 0.62 ? 'alarmed' : this.riderHurt > 0.28 ? 'nervous' : 'calm';
      this.daleLine = { text: pick(DALE_WORRIED[tone]), kind: tone === 'calm' ? 'line' : 'warn', apologising: false };
      this.daleHold = DALE_DWELL_SECONDS;
      // He frets faster the more worried he is.
      this.daleWorryIn = DALE_WORRY_GAP * (tone === 'alarmed' ? 0.45 : tone === 'nervous' ? 0.7 : 1);
      return;
    }

    const lookAheadM = Math.max(80, (this.vehicle.speed || 0) * DALE_LOOKAHEAD_SECONDS);
    const ahead = Math.round(lookAheadM / this.track.spacing);
    const coming = this.track.sectionNameAt(this.vehicle.trackIndex + ahead);
    if (coming === this.daleSection) return;

    this.daleSection = coming;
    const tip = tipFor(coming, this.daleVariant);
    if (!tip) return;
    // A fresh apology outranks a corner call; otherwise he takes the corner.
    if (this.daleLine?.apologising && this.daleHold > 0) return;
    this.daleLine = { text: tip.text, kind: tip.kind, apologising: false };
    this.daleHold = DALE_DWELL_SECONDS;
  }

  /** He takes the blame with Herr Müller, which is not the same as with you. */
  private daleApologise(): void {
    // Not on the bike. The apologies are Dale taking the blame with Herr
    // Müller for the customer's mistakes — with Herr Müller himself riding
    // there is no customer, and apologising to a man for his own riding is a
    // different conversation entirely. He worries instead.
    if (this.car.bike) return;
    if (this.daleApologyCooldown > 0) return;
    this.daleApologyCooldown = DALE_APOLOGY_GAP_SECONDS;
    this.daleLine = { text: pick(DALE_APOLOGIES), kind: 'warn', apologising: true };
    this.daleHold = DALE_DWELL_SECONDS;
    // He has stopped talking about the corner, so let the next one speak up.
    this.daleSection = '';
  }

  // ---------------------------------------------------------- retirement
  /**
   * The damage bar is full. Control is taken away, the car is brought to a
   * stop under the black flag, and the recovery truck comes out for it.
   *
   * Driven kinematically like the departure: the physics would keep fighting
   * for the wheel, and there is nothing left to drive anyway.
   */
  private retire(): void {
    if (this.phase === 'retired') return;
    this.phase = 'retired';
    this.retiredFor = 0;
    this.retiredLine = 0;
    this.input.captureEnabled = false;
    // Bonnet and cockpit views hide the bodywork. The whole point now is
    // watching the wreck sit there and get collected, so it comes back.
    this.cameraMode = 'chase';
    this.carMesh.group.visible = true;
    this.setMood(
      this.car.bike === true && this.riderHurt >= 1 ? 'scared' : 'angry',
      this.car.bike === true && this.riderHurt >= 1 ? AMBULANCE_LINES[0] : this.ranting.retired[0],
      99,
    );
    // Engine off — the car is not going anywhere under its own power again.
    // The scrape is silenced by hand: `applyDamage` feeds it, and it stops
    // being called the moment the car retires, so whatever it was doing when
    // the car hit the barrier for the last time would otherwise stay on.
    this.audio.update(0, 0, 0, 0);
    this.audio.scrape(0);

    // The truck comes up the road behind the wreck and stops just short — or
    // an ambulance does, when it is the rider who has run out rather than the
    // machine. Same drive-up either way; only the vehicle differs.
    const p = this.track.at(this.vehicle.trackIndex);
    const truck = this.car.bike === true && this.riderHurt >= 1 ? buildAmbulance() : buildTowTruck();
    truck.group.position.copy(p.pos).addScaledVector(p.tangent, -TOW_APPROACH_M);
    truck.group.rotation.y = Math.atan2(p.tangent.x, p.tangent.z);
    this.scene.add(truck.group);
    this.towTruck = truck;
    this.towFrom = truck.group.position.clone();
    this.towTo = p.pos.clone().addScaledVector(p.tangent, -6);
  }

  private updateRetirement(dt: number): void {
    this.retiredFor += dt;
    const truck = this.towTruck;

    // The wreck rolls to a halt on its own; nobody is driving it any more.
    this.vehicle.vLong *= Math.max(0, 1 - dt * 1.6);
    this.vehicle.vLat *= Math.max(0, 1 - dt * 3);
    this.vehicle.yawRate *= Math.max(0, 1 - dt * 3);
    this.vehicle.position.addScaledVector(this.vehicle.forward, this.vehicle.vLong * dt);

    // One line at a time, so it reads as a rant rather than a wall of text.
    // Flat on his back beside his own motorcycle, he is not ranting about a
    // customer — there isn't one. He is talking himself through it.
    const hurt = this.car.bike === true && this.riderHurt >= 1;
    const rant = hurt ? AMBULANCE_LINES : this.ranting.retired;
    const wanted = Math.min(rant.length - 1, Math.floor(this.retiredFor / RETIRED_LINE_SECONDS));
    if (wanted !== this.retiredLine) {
      this.retiredLine = wanted;
      this.setMood(hurt ? 'scared' : 'angry', rant[wanted], 99);
    }

    if (truck) {
      truck.update(this.retiredFor);
      // Aim six metres behind the wreck itself, not behind where it was
      // flagged — it coasts on for a good thirty metres after that. Taken
      // from the car's own position and heading rather than its track index,
      // because that index is only advanced inside Vehicle.step() and this
      // sequence moves the car kinematically: the index stands still, and the
      // truck parked in an empty stretch of road well short of it.
      this.towTo.copy(this.vehicle.position).addScaledVector(this.vehicle.forward, -6);
      truck.group.rotation.y = this.vehicle.yaw;
      // Drive it in over the first stretch, then let it sit with the beacons
      // going while he finishes telling you what he thinks.
      const f = THREE.MathUtils.clamp(this.retiredFor / TOW_ARRIVE_SECONDS, 0, 1);
      const eased = f * f * (3 - 2 * f);
      truck.group.position.lerpVectors(this.towFrom, this.towTo, eased);
      const roll = (this.towFrom.distanceTo(this.towTo) / TOW_ARRIVE_SECONDS) * dt;
      if (f < 1) for (const w of truck.wheels) w.rotation.x -= roll / 0.45;
    }

    this.updateMood(dt);

    if (!this.retiredReported && this.retiredFor >= rant.length * RETIRED_LINE_SECONDS) {
      this.retiredReported = true;
      const hurt = this.car.bike === true && this.riderHurt >= 1;
      this.callbacks.onRetired({
        damageCost: Math.round(this.damageCost),
        contacts: this.contacts,
        // Nobody gets banned for hurting themselves on their own motorcycle,
        // so that run does not go on the wall behind the counter.
        banCount: hurt ? 0 : recordBan(),
        rider: hurt,
      });
    }
  }

  // ----------------------------------------------------------- departure
  /**
   * The scripted roll out of the yard. Driven kinematically along the curve
   * rather than through the physics: `Vehicle.step()` forces the car back
   * inside the barrier 6.5 m off the centreline, and the whole yard lies well
   * beyond that.
   */
  private updateDeparture(dt: number): void {
    // The countdown runs with the car still parked in the shed.
    if (this.countdown !== null) {
      this.countdown -= dt;
      if (this.countdown > 0) return;
      this.countdown = null;
    }

    const route = this.departure;
    const u = Math.min(1, this.departureS / route.length);
    const target = departureSpeedAt(u);
    // Ease towards the schedule so the speed never steps.
    this.departureV += THREE.MathUtils.clamp(target - this.departureV, -8 * dt, 4 * dt);
    this.departureS += this.departureV * dt;

    if (this.departureS >= route.length) {
      this.finishDeparture();
      return;
    }

    const at = this.departureS / route.length;
    const pos = route.curve.getPointAt(at);
    const tangent = route.curve.getTangentAt(at);
    this.vehicle.position.copy(pos);
    this.vehicle.yaw = Math.atan2(tangent.x, tangent.z);

    // Read the local curvature ahead and steer the front wheels into it, so
    // the car does not slide round the U-turn with its wheels dead straight.
    const ahead = route.curve.getTangentAt(Math.min(1, at + 0.01));
    let dyaw = Math.atan2(ahead.x, ahead.z) - this.vehicle.yaw;
    if (dyaw > Math.PI) dyaw -= Math.PI * 2;
    if (dyaw < -Math.PI) dyaw += Math.PI * 2;
    const curvature = dyaw / Math.max(1e-3, route.length * 0.01);
    // dyaw is left-positive (three.js +Y); DriveInput.steer is right-positive.
    const steer = THREE.MathUtils.clamp(-Math.atan(this.car.wheelbase * curvature) / 0.42, -1, 1);
    this.departureSteer += (steer - this.departureSteer) * Math.min(1, dt * 8);
    // Feed the ramp's slope into the body attitude: negative pitch is nose-up.
    const climb = Math.atan2(tangent.y, Math.hypot(tangent.x, tangent.z));
    this.vehicle.pitch += (-climb - this.vehicle.pitch) * Math.min(1, dt * 7);
    // Real longitudinal speed, so the wheels turn and the engine note follows.
    this.vehicle.vLong = this.departureV;

    this.telemetry = {
      speedKmh: this.departureV * 3.6,
      rpm: Math.min(this.car.redlineRpm * 0.4, 1100 + this.departureV * 120),
      gear: 1,
      gripUsage: 0,
      lateralG: 0,
      longitudinalG: 0,
      offTrack: false,
      contact: false,
      impactSpeed: 0,
      slipAngle: 0,
    };
  }

  /** Hand the car over to the driver, already rolling in the right-hand lane. */
  private finishDeparture(): void {
    this.phase = 'approach';
    const speed = this.departureV;
    this.vehicle.placeOnTrack(this.approach, this.departure.joinIndex, this.departure.joinLateral);
    this.vehicle.vLong = speed;
    this.lastIndex = this.departure.joinIndex;
  }

  // ------------------------------------------------------------ approach
  private updateApproach(): void {
    this.vehicle.trackIndex = this.approach.nearestIndex(this.vehicle.position, this.vehicle.trackIndex, 240);
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

    // Time the car needed to cover the distance it is already PAST the line.
    // Crossings land mid-step on a 6 m point grid, which quantised every lap
    // to ~0.1 s; backing the overshoot out (and carrying it into the next
    // lap) makes the clock line-accurate.
    const overshootSeconds = (points: number) =>
      (points * this.track.spacing) / Math.max(Math.abs(this.vehicle.vLong), 5);

    if (this.phase === 'outlap') {
      this.joinProgress += delta;
      const toLine = n - this.approach.joinIndex;
      if (this.joinProgress >= toLine) {
        this.phase = 'timing';
        this.lapProgress = this.joinProgress - toLine;
        this.lapTime = overshootSeconds(this.lapProgress);
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

    if (this.lapProgress >= n) {
      const overshoot = overshootSeconds(this.lapProgress - n);
      const carryProgress = this.lapProgress - n;
      this.completeLap(overshoot, carryProgress);
    } else if (this.lapProgress < -n * 0.05) {
      this.lapProgress = 0;
    }
  }

  private completeLap(overshoot: number, carryProgress: number): void {
    const time = Math.max(0, this.lapTime - overshoot);
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
      finesEuro: Math.round(this.fines),
    };

    if (personalBest) {
      this.bestLap = time;
      this.ghostBest = this.ghostRecording.slice();
      this.saveBest();
    }
    this.lastLap = time;
    this.audio.fanfare();
    this.callbacks.onLapComplete(result);

    // Ready for another lap, straight from the line — the stretch already
    // driven past it belongs to the new lap, in time and in distance.
    this.lapTime = overshoot;
    this.lapProgress = carryProgress;
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
    if (this.phase === 'approach' || this.phase === 'departure') {
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
    if (this.phase === 'departure') {
      // Still in the yard: the whole road, plus what is left of the script.
      return this.approach.length + Math.max(0, this.departure.length - this.departureS);
    }
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
    // every interval slightly longer than GHOST_DT and the drift adds up.
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
    const mesh = buildVehicleMesh({ ...this.car, color: 0x39c0ff, accent: 0x39c0ff }, { ghost: true });
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
  /**
   * Puts the four contact patches where the wheels actually are and decides,
   * per wheel, whether anything is being left behind. The positions come from
   * the vehicle's own frame rather than from the wheel meshes: the meshes
   * carry steering and spin, and a contact patch does neither.
   *
   * Three ways to mark the ground, and only three — the first version marked
   * continuously from 90 % of grip, which meant a black line down every corner
   * taken properly. A tyre at the limit is gripping, not abrading.
   *
   *  · **Off the circuit.** Grass and gravel churn under any wheel that is
   *    turning, at any speed. Nothing has to go wrong for a car to leave ruts
   *    across a verge.
   *  · **Actually sliding.** On tarmac, past the limit rather than near it.
   *  · **Wheelspin off the line.** Driven axle only, and it fades out as the
   *    car gets going, so it is a launch mark and not a trail.
   */
  private layRubber(): void {
    const marks = this.skidMarks;
    const t = this.telemetry;
    if (!marks || !t || this.phase === 'departure') return;

    const v = this.vehicle;
    const fwd = v.forward;
    const left = v.left;
    const halfTrack = this.car.size[1] * 0.42;
    const front = this.car.wheelbase * 0.5;
    const y = v.position.y;

    let n = 0;
    for (const along of [front, -front]) {
      for (const across of [halfTrack, -halfTrack]) {
        const p = this.rubberPoints[n++];
        p.set(
          v.position.x + fwd.x * along + left.x * across,
          y,
          v.position.z + fwd.z * along + left.z * across,
        );
      }
    }
    // Index order above: 0,1 front · 2,3 rear.
    const w = this.rubberStrength;
    w[0] = w[1] = w[2] = w[3] = 0;

    if (t.offTrack && t.speedKmh > 3) {
      const dust = Math.min(1, t.speedKmh / 70);
      w[0] = w[1] = w[2] = w[3] = dust;
      marks.update(this.rubberPoints, w, 'dirt');
      return;
    }

    // Past the limit, not near it. 1.0 is the limit; below SLIDE_FROM the
    // tyre is working hard and staying put, which leaves nothing.
    const sliding = Math.min(1, Math.max(0, (t.gripUsage - SLIDE_FROM) / 0.25));
    if (sliding > 0 && t.speedKmh > 15) {
      w[0] = w[1] = w[2] = w[3] = sliding;
    }

    // Wheelspin: hard throttle, still slow, and the tyre already at its limit.
    // Gone by SPIN_UNTIL_KMH, so pulling away hard leaves two short stripes
    // rather than a line all the way down the straight.
    const spin =
      this.input.state.throttle > 0.75 && t.gripUsage > 0.95
        ? Math.max(0, 1 - t.speedKmh / SPIN_UNTIL_KMH)
        : 0;
    if (spin > 0) {
      const drive = this.car.drivetrain;
      if (drive !== 'RWD') w[0] = w[1] = Math.max(w[0], spin);
      if (drive !== 'FWD') w[2] = w[3] = Math.max(w[2], spin);
    }

    marks.update(this.rubberPoints, w, 'rubber');
  }

  /** Reused per frame alongside `rubberPoints`; one entry per wheel. */
  private readonly rubberStrength = [0, 0, 0, 0];

  /** Reused every frame; the mark buffer must not allocate in the hot loop. */
  private readonly rubberPoints = [
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
  ];

  private updateVisuals(dt: number): void {
    this.elapsed += dt;
    // They wave the car out of the yard and then get on with their morning —
    // an arm going up and down for twenty kilometres would be unnerving.
    if (this.crowd && this.phase === 'departure') this.crowd.update(this.elapsed);
    this.speedCamera?.update(dt);

    const v = this.vehicle;
    const g = this.carMesh.group;
    g.position.copy(v.position);
    g.rotation.set(0, 0, 0);
    g.rotateY(v.yaw);
    g.rotateX(v.pitch + this.wheelieAngle);
    g.rotateZ(-v.roll);

    // A wheelie pivots about the rear contact patch, not about the model's
    // origin between the wheels. Rotating about the origin buries the rear
    // tyre in the tarmac by a quarter of a metre at full lift — the nose does
    // go up, but the bike sinks, and it reads as the road swallowing it.
    // Undo the movement the rotation gives that one point.
    if (this.wheelieAngle !== 0) {
      const zr = -this.car.wheelbase * 0.5;
      const sin = Math.sin(this.wheelieAngle);
      const cos = Math.cos(this.wheelieAngle);
      const dy = zr * sin;
      const dz = zr * (1 - cos);
      const fwd = v.forward;
      g.position.y += dy;
      g.position.x += fwd.x * dz;
      g.position.z += fwd.z * dz;
    }

    const spin = (v.vLong / 0.34) * dt;
    for (const w of this.carMesh.wheels) w.rotation.x -= spin;
    // Nothing drives the front wheel once it is in the air; it keeps whatever
    // rotation it had. Backing out the spin it was just given is cheaper than
    // tracking which wheel is which through the mesh contract.
    if (this.wheelieAngle < -0.05) {
      for (const fw of this.carMesh.frontWheels) {
        for (const child of fw.children) child.rotation.x += spin;
      }
    }
    // rotation.y is left-positive, the input is right-positive. During the
    // scripted departure the route steers, not the player.
    const steerInput = this.phase === 'departure' ? this.departureSteer : this.input.state.steer;
    const steerVis = THREE.MathUtils.clamp(-steerInput * 0.42, -0.42, 0.42);
    for (const fw of this.carMesh.frontWheels) fw.rotation.y = steerVis;

    const brakeMat = this.carMesh.brakeLights.material as THREE.MeshBasicMaterial;
    brakeMat.color.setHex(this.input.state.brake > 0.06 ? 0xff2a1a : 0x3a0806);

    this.carMesh.setDamage(this.damage);
    this.layRubber();
    this.updateEscort(dt);

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
      // Grip usage goes across raw. The audio owns the question of what a tyre
      // at 94% sounds like as against one at 108%, and squashing it to a 0–1
      // "slip" here threw away the part above the limit that tells the two
      // apart.
      this.audio.update(t.rpm / this.car.redlineRpm, this.input.state.throttle, t.speedKmh, t.gripUsage);
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

    // The departure opens on a fixed yard camera watching the car leave the
    // shed, up the ramp and round the U-turn — that whole manoeuvre happens
    // within a few metres of the retaining walls, where a vehicle-relative
    // chase camera would constantly clip through them. Only once the car is
    // running straight down the link lane (u >= 0.42, the same break as
    // departureSpeedAt's ramp/link-lane split) is there enough clearance for
    // the normal chase to take over; the position lerp carries the cut smoothly.
    if (this.phase === 'departure' && this.departureS / this.departure.length < 0.42) {
      const look = v.position.clone();
      look.y += 0.8;
      return { pos: this.departure.cameraAnchor.clone(), look, fov: 58 };
    }

    // Retirement gets its own view. The chase camera sits about six metres
    // behind the car — which is exactly where the recovery truck parks, so it
    // ended up inside the cab, looking at the back of a red panel. Standing
    // off to the side shows both vehicles and the flag instead.
    if (this.phase === 'retired') {
      const mid = v.position.clone();
      if (this.towTruck) mid.lerp(this.towTruck.group.position, 0.5);
      const pos = mid
        .clone()
        .addScaledVector(left, -9.5)
        .addScaledVector(fwd, 4.5);
      pos.y += 4.2;
      const look = mid.clone();
      look.y += 0.9;
      return { pos, look, fov: 60 };
    }

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

  /**
   * Double-tap X on the bike and the front wheel comes up.
   *
   * Gated on a speed band rather than allowed anywhere: below WHEELIE_MIN_KMH
   * there is not enough drive to lift it and it would read as the bike simply
   * tipping over backwards, and above WHEELIE_MAX_KMH nothing short of a jump
   * gets a Panigale's nose off the ground. Throttle is required for the same
   * reason it is required in life.
   */
  private startWheelie(): void {
    if (!this.car.bike || this.wheelieFor > 0) return;
    if (this.phase === 'departure' || this.phase === 'retired') return;
    const kmh = this.telemetry?.speedKmh ?? 0;
    if (kmh < WHEELIE_MIN_KMH || kmh > WHEELIE_MAX_KMH) return;
    if (this.input.state.throttle < 0.4) return;
    this.wheelieFor = WHEELIE_SECONDS;
    this.setMood('cheer', pick(WHEELIE_LINES), 3);
  }

  /**
   * Eases the nose up and back down, and drops it early if the rider does
   * anything that would put it down in life: shuts the throttle, brakes, or
   * runs out of the speed band.
   */
  private updateWheelie(dt: number): void {
    if (this.wheelieFor > 0) {
      const kmh = this.telemetry?.speedKmh ?? 0;
      const bail =
        this.input.state.throttle < 0.15 ||
        this.input.state.brake > 0.1 ||
        kmh < WHEELIE_MIN_KMH * 0.6 ||
        kmh > WHEELIE_MAX_KMH * 1.15;
      this.wheelieFor = bail ? 0 : Math.max(0, this.wheelieFor - dt);
    }
    const target = this.wheelieFor > 0 ? WHEELIE_ANGLE : 0;
    // Up quickly, down more gently: a nose that slams back reads as a crash.
    const rate = this.wheelieFor > 0 ? 5.2 : 2.6;
    this.wheelieAngle += (target - this.wheelieAngle) * Math.min(1, dt * rate);
    if (Math.abs(this.wheelieAngle) < 1e-4) this.wheelieAngle = 0;
  }

  /**
   * Over the bars. The bike goes down and slides; he goes his own way and
   * lands somewhere else, which is the whole reason the rider is a separate
   * object rather than part of the bodywork.
   */
  private throwRider(closingSpeed: number): void {
    const rider = this.carMesh.rider;
    if (!rider || this.spill) return;

    this.input.captureEnabled = false;
    this.cameraMode = 'chase';
    this.wheelieFor = 0;
    this.audio.impact(Math.min(1, closingSpeed / 18));
    this.audio.scrape(0);

    // Up and forward, along the way he was already going. A harder hit throws
    // him further, but not without limit — past about this he is a cartoon.
    //
    // The vertical is sized against the flight beat rather than picked: at
    // gravity 15 a launch of v rises v²/30 and is back down after 2v/15, so
    // 8.4 m/s gives 2.3 m of air over 1.12 s, which fills the 1.1 s stage
    // almost exactly. The first attempt used 3.4 and produced a 94 cm hop —
    // a stumble, not a flight.
    const speed = Math.min(closingSpeed, 16);
    const fwd = this.vehicle.forward;
    const launch = new THREE.Vector3(fwd.x * speed * 0.7, 4.6 + speed * 0.42, fwd.z * speed * 0.7);
    this.spill = startSpill(rider, this.scene, this.vehicle.position.clone(), launch);

    const bad = this.riderHurt > 0.66;
    this.setMood('scared', pick(bad ? SPILL_BAD_LINES : SPILL_LINES), 4);
  }

  /**
   * Runs the fall. The bike is riderless for the duration and simply slides to
   * a stop: nothing about the machine is being driven, so nothing about it is
   * simulated beyond friction.
   */
  private updateSpill(dt: number): void {
    const spill = this.spill;
    if (!spill) return;

    const v = this.vehicle;
    v.vLong *= Math.max(0, 1 - dt * 2.2);
    v.vLat *= Math.max(0, 1 - dt * 3.4);
    v.yawRate *= Math.max(0, 1 - dt * 3.4);
    v.position.addScaledVector(v.forward, v.vLong * dt);
    this.wheelieAngle *= Math.max(0, 1 - dt * 6);

    if (spill.update(dt, v.position)) return;

    spill.finish();
    this.spill = null;
    // Hurt enough and he does not get to carry on.
    if (this.riderHurt >= 1) {
      this.retire();
      return;
    }
    this.input.captureEnabled = true;
    this.setMood('idle', pick(REMOUNT_LINES), 4);
  }

  /**
   * Keeps Tanju where a friend riding sweep would be. He needs helping when
   * Herr Müller is off the bike or has stopped — those are the two moments a
   * second rider exists for, and both are already known here.
   */
  private updateEscort(dt: number): void {
    const escort = this.escort;
    if (!escort) return;
    // He waits in the yard until the ride actually starts; the departure
    // choreography has no room for a second machine on that ramp.
    escort.group.visible = this.phase !== 'departure';
    if (!escort.group.visible) return;

    // A *fractional* index, not `trackIndex`. That one is a whole number and
    // the bike is somewhere between two of them, so hanging Tanju off it left
    // him a constant 15 m further back than asked for — measured: 37,7 m for
    // a requested 22, and he settled 2,7 m behind when told to stop 9 ahead.
    const p = this.road.at(this.vehicle.trackIndex);
    const past = this.vehicle.position.clone().sub(p.pos).dot(p.tangent);
    const lead = this.vehicle.trackIndex + past / this.road.spacing;

    const stopped = (this.telemetry?.speedKmh ?? 0) < 6;
    escort.update(dt, this.road, lead, this.vehicle.speed, this.spill !== null || stopped);
  }

  // ----------------------------------------------------------------- misc
  recover(): void {
    // The car is driving itself out of the yard; there is nothing to recover
    // from, and the road snap would teleport it out of the choreography.
    if (this.phase === 'departure') return;
    const road = this.road;
    const idx = road.nearestIndexGlobal(this.vehicle.position);
    this.vehicle.placeOnTrack(road, idx, 0);
    this.lastIndex = idx;
    this.input.reset();
    this.updateCameraImmediate();
    this.setMood('scared', 'Right, back on the black stuff. Slower in this time, eh?', 4);
  }

  /**
   * The car-specific gauge. Which number is worth a tile depends entirely on
   * what the car is: the GT3 RS makes 423 kg of downforce at 200 km/h and the
   * GR Yaris 60, so the wing cars are read by their aero; the Taycan's single
   * -speed drive unit spins to 16,000 rpm, where a gear-based tacho says
   * nothing; and for the rest, tyre load through a corner is the live number.
   * All three come from telemetry the physics already produces.
   */
  private instrumentReadout(t: VehicleTelemetry | null): { label: string; value: string } {
    const car = this.car;
    if (car.electric) {
      return { label: 'Motor', value: `${((t?.rpm ?? 0) / 1000).toFixed(1)}k` };
    }
    if (car.downforce >= 5e-5) {
      const v = (t?.speedKmh ?? 0) / 3.6;
      return { label: 'Downforce', value: `${Math.round(car.downforce * v * v * car.massKg)} kg` };
    }
    return { label: 'Lateral', value: `${Math.abs(t?.lateralG ?? 0).toFixed(1)} g` };
  }

  private emitHud(): void {
    const t = this.telemetry;
    const idx = this.vehicle.trackIndex;
    const n = this.track.count;
    const ghost = this.phase === 'timing' ? this.ghostSampleAt(this.lapTime) : null;

    // The scripted departure presents as the approach: same timebox, same
    // remaining-distance readout, no separate HUD state to design around.
    const onRoad = this.phase === 'approach' || this.phase === 'departure';

    this.callbacks.onHud({
      phase: onRoad ? 'approach' : this.phase,
      speedKmh: t?.speedKmh ?? 0,
      rpmRatio: (t?.rpm ?? 0) / this.car.redlineRpm,
      gear: this.vehicle.gear,
      lapTime: this.lapTime,
      bestLap: this.bestLap,
      lastLap: this.lastLap,
      sectionName: onRoad ? 'Approach · Burgstrasse' : this.track.sectionNameAt(idx),
      distance: onRoad ? 0 : this.track.distanceAt(idx),
      lapLength: this.track.lapLength,
      damageIsRider: this.car.bike === true,
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
      damage: this.car.bike ? this.riderHurt : this.damage,
      damageCost: Math.round(this.damageCost),
      muellerMood: this.mood,
      muellerLine: this.moodLine,
      reversing: this.vehicle.vLong < -0.2,
      instrument: this.instrumentReadout(t),
      dale: this.daleLine,
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
        // A corrupt entry with non-numbers would poison the ghost mesh and
        // minimap with NaN positions — keep only fully finite samples.
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
 * mid-circuit. Roughly 1 MB of JSON, inside the localStorage budget.
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
  'Marvellous. That will buff out, will it? It will not.',
  'I could have hired that car to somebody careful.',
  'Every panel on that thing has a price and I know all of them.',
  'You are not driving it, you are redecorating it.',
  'Stop. Just for one corner. Stop.',
  'The barrier does not move. It has never once moved.',
  'Do you want me to send the truck now or after the next one?',
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
  'Careful. Careful careful careful.',
  'That is enough of that, thank you.',
  'My heart, driver. Consider my heart.',
  'I felt that from here and I am sitting down.',
  'Whoa! Give it a moment to settle.',
  'You found the edge. Now leave it alone.',
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
  'Steady now. The circuit is not going anywhere.',
  'Nice and smooth. Smooth is what gets a car home.',
  'Eyes up. Look through the corner, not at the bonnet.',
  'Breathe. It is twenty kilometres, not twenty seconds.',
  'You are doing fine. I have watched far worse from this chair.',
  'One corner at a time. That is the whole secret, really.',
  'Feel the road through the wheel. It is telling you things.',
  'No need to hurry the entry. The exit is where the time lives.',
  'Right foot is not a switch. Roll onto it.',
  'That is it. Tidy. Boring, even. Boring is quick.',
];

const FLOW_LINES = [
  'That is it — right on the limit and tidy with it.',
  'Oh, now you are driving. Keep that up.',
  'Proper job! The tyres are singing, not screaming.',
  'Beautiful. Like it is on rails. MY rails, mind.',
  'Now you have it. That is the rhythm — do not think about it.',
  'Look at that. Someone has been paying attention.',
  'Yes! That is exactly what the car wants.',
  'Smooth hands, quiet car, quick lap. Textbook.',
  'I could watch that all afternoon. Keep going.',
  'You are carrying speed now instead of chasing it.',
  'That is the line. That is genuinely the line.',
  'Whatever you just did — do it again at the next one.',
];

/**
 * What he says once the damage bar is full and the car is his problem. Read
 * in order, not at random — it is one rant, and it escalates.
 */
/**
 * Where the village camera stands, as an approach index. Index 46 is 276 m
 * from the yard and the straightest run on the whole route — 0.8 degrees of
 * direction change over fifteen points.
 */
/**
 * What he says lying at the side of the circuit waiting to be collected. The
 * order matters: the retirement sequence walks this list one line at a time.
 */
const AMBULANCE_LINES = [
  'Do not move me. Do not — right. Someone is moving me.',
  'Dale. Dale, stop saying you told me. You did tell me. Stop saying it.',
  'The bike. Is the bike all right. Ask about the bike.',
  'Fifty-eight years old on a superbike. What did I think was going to happen.',
  'Should have stayed behind the counter pulling Amex cards through the reader.',
];

/** Caught on his own bike. His licence, his points, his own stupid fault. */
const TICKET_SELF_LINES = [
  'That was me. That was me on my own licence. Marvellous.',
  'Points. On mine. In my own village, past my own shop.',
  'Do not look at me like that. I know exactly what I did.',
  'Forty years without a single one and I do this on a Tuesday.',
];

/** Where the patrol car appears behind you, and how close it ever gets. */
const POLICE_START_BEHIND_M = 90;
const POLICE_CLOSEST_M = 18;
/** How fast it eats into that gap, m/s. */
const POLICE_CLOSING_MS = 7;

/** Herr Müller, watching a patrol car fill the mirror. */
const POLICE_LINES = [
  'Blue lights. Go — go, before the constables want money as well.',
  'That is a patrol car and I am not stopping for it. Neither are you.',
  'Right. The gate. Get to the gate — they cannot follow us in there.',
  'Do not stop. Whatever you do, do not stop. They take cash and dignity.',
];
/** And once the gate has swallowed you. */
const POLICE_GONE_LINES = [
  'And there they stop. Private ground, gentlemen. Wonderful.',
  'The StVO ends at that barrier. So does their afternoon.',
  'Look at them turning round. That is the best thing I will see today.',
];

/** How often Dale frets while Herr Müller is riding, seconds. */
const DALE_WORRY_GAP = 9;

/**
 * When a bike goes down on its own. Above this share of the available grip,
 * held for this long, at more than this speed.
 */
const LOWSIDE_GRIP = 1.04;
const LOWSIDE_SECONDS = 0.22;
const LOWSIDE_MIN_KMH = 30;

/** Closing speed into a barrier that puts him over the bars, m/s. */
const SPILL_FROM_MS = 4.5;

/** The speed band in which the front wheel will actually come up. */
const WHEELIE_MIN_KMH = 25;
const WHEELIE_MAX_KMH = 140;
/** How long he holds it before it comes back down. */
const WHEELIE_SECONDS = 2.1;
/** Nose-up angle at full lift. Negative is nose-up (see `pitch` in physics). */
const WHEELIE_ANGLE = -0.42;
/**
 * A front wheel in the air steers nothing. Not zero — the bike still turns by
 * leaning, and taking the steering away completely made it feel broken rather
 * than airborne.
 */
const WHEELIE_STEER = 0.35;

/** Grip usage past which a tyre is genuinely abrading rather than gripping. */
const SLIDE_FROM = 1.02;
/** Wheelspin marks are gone by this road speed, km/h. */
const SPIN_UNTIL_KMH = 45;

const SPEED_CAMERA_INDEX = 46;
/** Built-up area, so 50. */
const VILLAGE_LIMIT_KMH = 50;

/**
 * The German fine table for a car inside a built-up area, 2021 onwards.
 * Real numbers, because an invented one would be the least believable thing
 * in a game that surveys the circuit off OpenStreetMap.
 */
function penaltyFor(over: number): { fine: number; points: number; banMonths: number } {
  if (over <= 10) return { fine: 30, points: 0, banMonths: 0 };
  if (over <= 15) return { fine: 50, points: 0, banMonths: 0 };
  if (over <= 20) return { fine: 70, points: 0, banMonths: 0 };
  if (over <= 25) return { fine: 115, points: 1, banMonths: 0 };
  if (over <= 30) return { fine: 180, points: 1, banMonths: 1 };
  if (over <= 40) return { fine: 260, points: 2, banMonths: 1 };
  if (over <= 50) return { fine: 400, points: 2, banMonths: 1 };
  if (over <= 60) return { fine: 560, points: 2, banMonths: 2 };
  if (over <= 70) return { fine: 700, points: 2, banMonths: 3 };
  return { fine: 800, points: 2, banMonths: 3 };
}

/** What Herr Müller has to say about it. */
const TICKET_LINES = [
  'That was a camera. In a village. On my insurance.',
  'Fifty means fifty. It is written on a large round sign.',
  'Wonderful. A photograph of my car, and your right foot.',
  'The circuit is that way. The village is not part of it.',
  'They post those to me, you know. With my name on them.',
];

/** How far ahead Dale reads the road, in seconds of travel. */
const DALE_LOOKAHEAD_SECONDS = 3;
/** How long one of his calls stays up. */
const DALE_DWELL_SECONDS = 4.5;
/** He apologises to Müller at most this often. */
const DALE_APOLOGY_GAP_SECONDS = 18;

/** How far back up the road the recovery truck appears, metres. */
const TOW_APPROACH_M = 85;
/** How long it takes to come up and stop behind the wreck. */
const TOW_ARRIVE_SECONDS = 6;
/** Dwell on each line of his rant. */
const RETIRED_LINE_SECONDS = 2.6;

/** localStorage: how many times this browser has been thrown out for good. */
const BAN_KEY = 'r4r.bans';

/**
 * Records the ban and returns the running total.
 *
 * A plain integer under its own key — nothing existing is touched, so there
 * is no format to migrate. Storage can be unavailable (private mode, a
 * browser set to block it), and being unable to count bans is no reason to
 * fail the sequence, so it falls back to "this is the first".
 */
function recordBan(): number {
  try {
    const n = Number.parseInt(localStorage.getItem(BAN_KEY) ?? '0', 10);
    const next = (Number.isFinite(n) ? n : 0) + 1;
    localStorage.setItem(BAN_KEY, String(next));
    return next;
  } catch {
    return 1;
  }
}

/**
 * On the Ducati there is no customer to shout at — he is riding it himself.
 * So the rant turns inward, which is funnier and, by his own account,
 * entirely deserved.
 */
/** What he says with the front wheel in the air. He is delighted and appalled. */
/** Coming off, and not badly hurt yet. */
const SPILL_LINES = [
  'Ohhh. That is the gravel. That is definitely the gravel.',
  'I am fine. Nothing is broken that was not already.',
  'Do not tell Dale. Dale worries.',
  'The bike is fine. I am the crumple zone.',
];
/** Coming off when he is already in a bad way. */
const SPILL_BAD_LINES = [
  'That one hurt in a new place.',
  'Right. Right. Give me a moment.',
  'I am getting too old to land like that.',
];
/** Back on the bike, dusting himself down. */
const REMOUNT_LINES = [
  'Nothing to see. Back on. The leathers took most of it.',
  'That was a controlled dismount. I meant most of that.',
  'Up we get. This is why the suit costs what it costs.',
  'If anyone asks, the bike slid out on its own.',
];

const WHEELIE_LINES = [
  'Front wheel up! Do not tell the insurer. Do not tell Dale either.',
  'This is a demonstration of throttle control. That is what it says on the invoice.',
  'Look at that. Fifty-eight years old and still an idiot.',
  'One wheel does the work, the other one watches. Marvellous.',
  'If it comes down sideways we never did this.',
];

const SELF_ANGRY_LINES = [
  'MUELLER! What in the name of God was that?',
  'Twenty-six years. Twenty-six years and I still do that.',
  'Right. That is coming out of my own wages. Wonderful.',
  'I would sack me. I genuinely would sack me.',
  'Do not look at me like that. ...I am talking to myself again.',
  'That was my fault. Say it out loud, Mueller. That was my fault.',
  'If a customer did that I would have the truck out by now.',
  'And to think I lecture people about this exact corner.',
];

/** The self-directed version of the black-flag rant, for the same reason. */
const SELF_RETIRED_LINES = [
  'BLACK FLAG. On myself. Marvellous.',
  'Look at it. My bike. MY bike.',
  'And there is nobody to blame. I have checked. Twice.',
  'I am calling my own truck. The shame of it.',
  'Twenty-six years I have run this yard, and I do this on a Tuesday.',
  'The Armco is fine. It always is. It has had the practice.',
  'Do not tell the dog. He will only give me that look.',
  'Up on the deck with it, before I have to look at it any longer.',
  'And I am banning myself. For life. ...I will be in at eight.',
];

const RETIRED_LINES = [
  'BLACK FLAG! Off. Now. You are done.',
  'Look at it. LOOK at it. That was a car this morning.',
  'Do not touch anything else. You have touched quite enough.',
  'I am calling the truck. No, you do not get a say.',
  'Twenty-six years I have run this yard. Twenty-six.',
  'The Armco is fine, by the way. It usually is. It has practice.',
  'Out. Mind the oil. That is yours as well.',
  'Right — up on the deck with it, before it leaks on my tarmac.',
  'And you: banned. For life. Do not write to me about it.',
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
