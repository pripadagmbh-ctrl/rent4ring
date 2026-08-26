import * as THREE from 'three';
import type { Car } from '../data/fleet';
import type { RoadPath } from './track';

const G = 9.81;
const AIR_DENSITY = 1.225;
const WHEEL_RADIUS = 0.34;
const DRIVELINE_EFFICIENCY = 0.9;

export interface DriveInput {
  throttle: number;
  brake: number;
  steer: number;
  handbrake: boolean;
}

export interface VehicleTelemetry {
  speedKmh: number;
  rpm: number;
  gear: number;
  /** 0–1, how much of the available tyre grip is being used. */
  gripUsage: number;
  lateralG: number;
  longitudinalG: number;
  offTrack: boolean;
  /** Set for one frame when the car touches the barriers. */
  contact: boolean;
  /** Closing speed into the barrier for that frame, m/s. Drives the damage bill. */
  impactSpeed: number;
  slipAngle: number;
}

/**
 * Sign convention, fixed by three.js: rotating about +Y by an increasing angle
 * turns (0,0,1) towards (1,0,0), which is a *left* turn. So throughout this
 * model `vLat`, `yawRate` and the steer angle `delta` are all positive to the
 * LEFT, matching `Track.normal`. `DriveInput.steer` keeps the intuitive meaning
 * (+1 = right) and is negated once, on entry to `step`.
 */
export class Vehicle {
  readonly car: Car;
  readonly position = new THREE.Vector3();
  yaw = 0;
  /** Velocity in the car's own frame: x = forward, y = left. */
  vLong = 0;
  vLat = 0;
  yawRate = 0;
  gear = 1;
  rpm = 0;

  /** Visual-only body attitude, driven by load transfer. */
  pitch = 0;
  roll = 0;

  assists = true;
  /**
   * Mechanical condition, 1 = fresh out of the garage. Bodywork damage costs
   * grip and power, so a battered car is measurably slower.
   */
  condition = 1;

  private steerActual = 0;
  private readonly telemetry: VehicleTelemetry = {
    speedKmh: 0,
    rpm: 0,
    gear: 1,
    gripUsage: 0,
    lateralG: 0,
    longitudinalG: 0,
    offTrack: false,
    contact: false,
    impactSpeed: 0,
    slipAngle: 0,
  };

  /** Index of the nearest centreline point, carried between frames. */
  trackIndex = 0;

  constructor(car: Car) {
    this.car = car;
  }

  get forward(): THREE.Vector3 {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  /** Unit vector pointing to the driver's left — the same side as `Track.normal`. */
  get left(): THREE.Vector3 {
    return new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  get speed(): number {
    return Math.hypot(this.vLong, this.vLat);
  }

  placeOnTrack(road: RoadPath, index: number, lateral = 0): void {
    const p = road.at(index);
    this.position.copy(p.pos).addScaledVector(p.normal, lateral);
    this.position.y = p.pos.y;
    this.yaw = Math.atan2(p.tangent.x, p.tangent.z);
    this.vLong = 0;
    this.vLat = 0;
    this.yawRate = 0;
    this.gear = 1;
    this.rpm = 0;
    this.steerActual = 0;
    this.trackIndex = index;
  }

  step(dt: number, input: DriveInput, road: RoadPath): VehicleTelemetry {
    const car = this.car;
    const mass = car.massKg;
    const L = car.wheelbase;
    // CG-to-axle distances: more front weight pulls the CG forward.
    const a = L * (1 - car.frontWeight);
    const b = L * car.frontWeight;
    const Izz = mass * L * L * 0.18;

    // --- Track context -------------------------------------------------
    this.trackIndex = road.nearestIndex(this.position, this.trackIndex, 40);
    const tp = road.at(this.trackIndex);
    const lateral = road.lateralOffset(this.position, this.trackIndex);
    const absLateral = Math.abs(lateral);
    const onAsphalt = absLateral <= tp.halfWidth;
    const onKerb = !onAsphalt && absLateral <= tp.halfWidth + 1.2;
    const offTrack = !onAsphalt && !onKerb;

    let surfaceMu = 1;
    let rollingCoef = 0.014;
    if (onKerb) {
      surfaceMu = 0.88;
      rollingCoef = 0.02;
    } else if (offTrack) {
      surfaceMu = 0.52;
      rollingCoef = 0.09;
    }

    // --- Steering ------------------------------------------------------
    const speed = Math.max(Math.abs(this.vLong), 0.01);
    // Speed-sensitive lock keeps the car stable on the Döttinger Höhe.
    const maxSteer = THREE.MathUtils.clamp(0.58 / (1 + speed * 0.045), 0.055, 0.58);
    // Input is +1 for a right turn; the model below is left-positive.
    const targetSteer = -input.steer * maxSteer;
    const steerRate = 6.5;
    this.steerActual += THREE.MathUtils.clamp(targetSteer - this.steerActual, -steerRate * dt, steerRate * dt);
    const delta = this.steerActual;

    // --- Vertical loads ------------------------------------------------
    const v2 = this.vLong * this.vLong;
    const downforceN = car.downforce * v2 * mass * G;
    const staticFront = mass * G * car.frontWeight;
    const staticRear = mass * G * (1 - car.frontWeight);
    // Longitudinal load transfer from the previous frame's acceleration.
    const cgHeight = 0.42;
    const transfer = THREE.MathUtils.clamp(
      (this.telemetry.longitudinalG * G * mass * cgHeight) / L,
      -staticFront * 0.6,
      staticRear * 0.6,
    );
    const Fzf = Math.max(400, staticFront - transfer + downforceN * 0.42);
    const Fzr = Math.max(400, staticRear + transfer + downforceN * 0.58);

    const mu = car.grip * surfaceMu * (0.82 + 0.18 * this.condition);

    // --- Longitudinal forces -------------------------------------------
    const gearRatio = car.gearRatios[this.gear - 1] ?? 1;
    const wheelOmega = Math.abs(this.vLong) / WHEEL_RADIUS;
    let rpm = (wheelOmega * gearRatio * car.finalDrive * 60) / (2 * Math.PI);
    rpm = THREE.MathUtils.clamp(rpm, car.electric ? 0 : 900, car.redlineRpm);
    this.rpm = rpm;

    const rpmRatio = rpm / car.redlineRpm;
    let torqueFactor: number;
    if (car.electric) {
      // Flat torque to base speed, then constant power.
      torqueFactor = rpmRatio < 0.35 ? 1 : Math.max(0.25, 0.35 / rpmRatio);
    } else {
      torqueFactor = THREE.MathUtils.clamp(0.62 + 0.95 * rpmRatio - 0.62 * rpmRatio * rpmRatio, 0.2, 1.02);
    }

    let driveForce = 0;
    if (input.throttle > 0) {
      const engineForce =
        (car.torqueNm * torqueFactor * gearRatio * car.finalDrive * DRIVELINE_EFFICIENCY) / WHEEL_RADIUS;
      // Power ceiling keeps low gears from producing silly force at speed.
      const powerW = car.ps * 735.5;
      const powerForce = powerW / Math.max(Math.abs(this.vLong), 6);
      driveForce = Math.min(engineForce, powerForce) * input.throttle * (0.7 + 0.3 * this.condition);
    }

    // Engine braking and coasting drag.
    const engineBrake = input.throttle > 0.02 ? 0 : Math.min(Math.abs(this.vLong) * 22, 900);

    const dragForce = 0.5 * AIR_DENSITY * car.cdA * v2;
    const rollingForce = rollingCoef * (mass * G + downforceN);

    // Holding the brake at a standstill is the deliberate request for reverse —
    // decided here, before the brake force is applied, because a live brake
    // would otherwise fight the very reversing it is asking for.
    const wantsReverse = input.brake > 0.5 && input.throttle < 0.05 && this.vLong < 0.4;

    const maxBrakeForce = mu * (Fzf + Fzr) * 1.02;
    const brakeForce = wantsReverse ? 0 : input.brake * maxBrakeForce;

    const capFront = mu * Fzf;
    const capRear = mu * Fzr;

    // --- Slip angles and lateral forces --------------------------------
    // Cornering is resolved first, at the tyres' full capability. Longitudinal
    // force then gets whatever is left on the friction ellipse. Doing it the
    // other way round lets a whiff of throttle wipe out the rear axle's
    // lateral grip, which turns every RWD car into an instant spin.
    const vxAbs = Math.max(Math.abs(this.vLong), 1.2);
    const alphaFront = Math.atan2(this.vLat + a * this.yawRate, vxAbs) - delta * Math.sign(this.vLong || 1);
    const alphaRear = Math.atan2(this.vLat - b * this.yawRate, vxAbs);

    // Cornering stiffness scales with load; grippier tyres are also stiffer.
    const stiffnessFront = 11 * Fzf * (0.7 + car.grip * 0.3);
    const stiffnessRear = 11.5 * Fzr * (0.7 + car.grip * 0.3);

    let FyFront = -clampSym(stiffnessFront * alphaFront, capFront);
    let FyRear = -clampSym(stiffnessRear * alphaRear, capRear);

    // --- Longitudinal budget left over after cornering -------------------
    const longCapFront = ellipseRemainder(capFront, FyFront);
    const longCapRear = ellipseRemainder(capRear, FyRear);

    let driveFront = 0;
    let driveRear = 0;
    if (car.drivetrain === 'FWD') driveFront = driveForce;
    else if (car.drivetrain === 'RWD') driveRear = driveForce;
    else {
      driveFront = driveForce * 0.42;
      driveRear = driveForce * 0.58;
    }
    // Braking is front-biased like any road car.
    let brakeFront = brakeForce * 0.64 + engineBrake * (car.drivetrain === 'FWD' ? 0.8 : 0.2);
    let brakeRear = brakeForce * 0.36 + engineBrake * (car.drivetrain === 'FWD' ? 0.2 : 0.8);

    if (this.assists) {
      // Traction control and ABS keep each axle inside what it can still take,
      // so cornering grip survives throttle and brake inputs. The floor matters:
      // a real car mid-corner can still hold its speed against drag, and a hard
      // zero here would leave low-powered cars unable to accelerate at all.
      const floorFront = capFront * 0.18;
      const floorRear = capRear * 0.18;
      driveFront = Math.min(driveFront, Math.max(longCapFront * 0.92, floorFront));
      driveRear = Math.min(driveRear, Math.max(longCapRear * 0.92, floorRear));
      brakeFront = Math.min(brakeFront, Math.max(longCapFront * 0.98, floorFront));
      brakeRear = Math.min(brakeRear, Math.max(longCapRear * 0.98, floorRear));
      driveForce = driveFront + driveRear;
    }

    // Brakes resist motion; they do not propel. `dir` is 0 at a standstill, so a
    // held brake pedal keeps the car still instead of driving it backwards.
    const dir = Math.abs(this.vLong) < 0.05 ? 0 : Math.sign(this.vLong);
    const longFront = driveFront - brakeFront * dir;
    const longRear = driveRear - brakeRear * dir;

    if (!this.assists) {
      // Without the electronics, overdriving an axle scrubs its lateral grip
      // away — this is where power oversteer and lock-up understeer come from.
      FyFront = clampSym(FyFront, ellipseRemainder(capFront, longFront));
      FyRear = clampSym(FyRear, ellipseRemainder(capRear, longRear));
    }

    if (input.handbrake) {
      // Lock the rears: lateral grip collapses, longitudinal drag rises.
      FyRear *= 0.32;
    }

    // --- Accelerations --------------------------------------------------
    const cosD = Math.cos(delta);
    const sinD = Math.sin(delta);

    // Drag and rolling resistance also only ever oppose motion.
    let aLong = (longFront * cosD + longRear - FyFront * sinD - (dragForce + rollingForce) * dir) / mass;
    let aLat = (FyFront * cosD + FyRear) / mass;

    // Gravity along the slope: the Fuchsröhre pulls, the climb to Hohe Acht drags.
    const headingDot = this.forward.x * tp.tangent.x + this.forward.z * tp.tangent.z;
    const gradient = tp.tangent.y * Math.sign(headingDot || 1);
    aLong -= G * gradient;

    // Banking in the Karussell adds lateral load into the corner. Positive
    // banking raises the left edge, so gravity pulls the car to the right.
    aLat -= G * Math.sin(tp.banking) * 0.6;

    let yawAccel = (a * FyFront * cosD - b * FyRear) / Izz - this.yawRate * 0.55;

    // Electronic stability control: pull the yaw rate back towards what the
    // steering angle actually asks for. Applied as a moment, so the sign is
    // unambiguous regardless of which way the tyres are loaded.
    if (this.assists && Math.abs(this.vLong) > 3) {
      const targetYawRate = (this.vLong * Math.tan(delta)) / L;
      const yawError = this.yawRate - targetYawRate;
      yawAccel += THREE.MathUtils.clamp(-yawError * 3.2, -6, 6);
    }

    // --- Integrate ------------------------------------------------------
    if (Math.abs(this.vLong) < 2.2 && input.throttle < 0.05 && input.brake < 0.05) {
      // Kinematic blend at crawling speed keeps the model numerically calm.
      this.vLat *= 0.82;
      this.yawRate = (this.vLong * Math.tan(delta)) / L;
    } else {
      this.vLat += (aLat - this.yawRate * this.vLong) * dt;
      this.yawRate += yawAccel * dt;
    }
    const vLongBefore = this.vLong;
    this.vLong += (aLong + this.yawRate * this.vLat) * dt;
    // Resistance may bring the car to a halt but must never drag it through zero
    // — only the explicit reverse control below may put it into reverse.
    if (
      !wantsReverse &&
      input.throttle < 0.05 &&
      dir !== 0 &&
      Math.sign(this.vLong) !== Math.sign(vLongBefore)
    ) {
      this.vLong = 0;
    }

    // Safety net: a divergent tyre model must never poison the world transform.
    if (!Number.isFinite(this.vLong)) this.vLong = 0;
    if (!Number.isFinite(this.vLat)) this.vLat = 0;
    if (!Number.isFinite(this.yawRate)) this.yawRate = 0;
    this.vLat = THREE.MathUtils.clamp(this.vLat, -55, 55);
    this.yawRate = THREE.MathUtils.clamp(this.yawRate, -3.5, 3.5);

    // Top-speed ceiling.
    const topSpeedMs = car.topSpeedKmh / 3.6;
    if (this.vLong > topSpeedMs) this.vLong = topSpeedMs;
    if (this.vLong < -12) this.vLong = -12;

    // Reverse gear: hold the brake once stopped and the car backs up slowly.
    if (wantsReverse) {
      this.vLong = Math.max(this.vLong - 4 * dt, -6);
    }

    this.yaw += this.yawRate * dt;

    const move = this.forward.multiplyScalar(this.vLong * dt).add(this.left.multiplyScalar(this.vLat * dt));
    this.position.add(move);

    // --- Automatic gearbox ----------------------------------------------
    if (!car.electric || car.gearRatios.length > 1) {
      if (rpm > car.redlineRpm * 0.94 && this.gear < car.gearRatios.length && input.throttle > 0.1) {
        this.gear++;
      } else if (rpm < car.redlineRpm * 0.42 && this.gear > 1) {
        this.gear--;
      }
    }

    // --- Barriers ---------------------------------------------------------
    this.trackIndex = road.nearestIndex(this.position, this.trackIndex, 40);
    const tpAfter = road.at(this.trackIndex);
    const newLateral = road.lateralOffset(this.position, this.trackIndex);
    const barrier = tpAfter.halfWidth + 6.5;
    let contact = false;
    let impactSpeed = 0;
    if (Math.abs(newLateral) > barrier) {
      contact = true;
      const overshoot = Math.abs(newLateral) - barrier;
      const dir = Math.sign(newLateral) || 1;
      // Unit vector pointing from the track out towards the barrier that was hit.
      const outward = tpAfter.normal.clone().multiplyScalar(dir);

      // Push the car back onto the barrier line.
      this.position.addScaledVector(outward, -overshoot);

      // Resolve the impact in world space: kill the component heading into the
      // barrier, keep a little bounce, and scrub the rest along the steel.
      const fwd = this.forward;
      const lft = this.left;
      const vWorld = fwd.clone().multiplyScalar(this.vLong).addScaledVector(lft, this.vLat);
      const intoBarrier = vWorld.dot(outward);
      impactSpeed = Math.max(0, intoBarrier);
      if (intoBarrier > 0) {
        vWorld.addScaledVector(outward, -intoBarrier * 1.25);
      }
      vWorld.multiplyScalar(0.93);

      this.vLong = vWorld.dot(fwd);
      this.vLat = vWorld.dot(lft);
      this.yawRate *= 0.45;
    }

    // --- Stick to the surface ---------------------------------------------
    const targetY = road.surfaceHeight(this.position, this.trackIndex);
    this.position.y += (targetY - this.position.y) * Math.min(1, dt * 12);

    // --- Visual attitude ---------------------------------------------------
    const lonG = aLong / G;
    const latG = aLat / G;
    this.pitch += (THREE.MathUtils.clamp(-lonG * 0.035, -0.06, 0.06) - this.pitch) * Math.min(1, dt * 7);
    this.roll += (THREE.MathUtils.clamp(latG * 0.045, -0.09, 0.09) + tpAfter.banking * 0.85 - this.roll) * Math.min(1, dt * 7);

    // --- Telemetry ----------------------------------------------------------
    const usedFront = Math.hypot(FyFront, longFront) / Math.max(capFront, 1);
    const usedRear = Math.hypot(FyRear, longRear) / Math.max(capRear, 1);
    const t = this.telemetry;
    t.speedKmh = Math.abs(this.vLong) * 3.6;
    t.rpm = rpm;
    t.gear = this.gear;
    t.gripUsage = THREE.MathUtils.clamp(Math.max(usedFront, usedRear), 0, 1.4);
    t.lateralG = latG;
    t.longitudinalG = lonG;
    t.offTrack = offTrack;
    t.contact = contact;
    t.impactSpeed = impactSpeed;
    t.slipAngle = Math.atan2(this.vLat, vxAbs);
    return t;
  }
}

/**
 * Force still available on the friction circle once `used` has been spent in the
 * perpendicular direction. Symmetric, so it serves both directions.
 */
function ellipseRemainder(capacity: number, used: number): number {
  const ratio = Math.min(1, Math.abs(used) / Math.max(capacity, 1));
  return capacity * Math.sqrt(Math.max(0, 1 - ratio * ratio));
}

function clampSym(value: number, limit: number): number {
  return THREE.MathUtils.clamp(value, -limit, limit);
}
