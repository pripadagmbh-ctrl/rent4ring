import type { DriveInput } from './physics';

export type CameraMode = 'chase' | 'bonnet' | 'cockpit';

/**
 * Keyboard + gamepad + touch input, smoothed into analogue values so the
 * car is drivable without a wheel.
 */
export class InputManager {
  readonly state: DriveInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };

  /**
   * While a dialog (pause, ceremony) owns the screen this is false: drive
   * keys are ignored and — crucially — not preventDefault-ed, so Space and
   * Enter reach the dialog's buttons again. Escape stays live to unpause.
   */
  captureEnabled = true;

  private keys = new Set<string>();
  private steerSmooth = 0;
  private throttleSmooth = 0;
  private brakeSmooth = 0;

  /** Touch/virtual controls, 0–1 and -1..1. */
  touch = { throttle: 0, brake: 0, steer: 0 };
  touchActive = false;

  onCameraToggle?: () => void;
  onReset?: () => void;
  onPause?: () => void;

  private readonly handleDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (!this.captureEnabled) {
      if (k === 'escape') this.onPause?.();
      return;
    }
    if (CONSUMED.has(k) || CONSUMED.has(e.code)) e.preventDefault();
    if (this.keys.has(k)) return;
    this.keys.add(k);
    if (k === 'c') this.onCameraToggle?.();
    if (k === 'r') this.onReset?.();
    if (k === 'escape' || k === 'p') this.onPause?.();
  };

  private readonly handleUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
  };

  /**
   * Losing focus must drop every held control. Without this a key- or
   * pointer-down that never sees its matching up leaves the car driving itself.
   */
  private readonly handleBlur = () => {
    this.keys.clear();
    this.touch.throttle = 0;
    this.touch.brake = 0;
    this.touch.steer = 0;
    this.touchActive = false;
  };

  private readonly handleVisibility = () => {
    if (document.hidden) this.handleBlur();
  };

  attach(): void {
    window.addEventListener('keydown', this.handleDown);
    window.addEventListener('keyup', this.handleUp);
    window.addEventListener('blur', this.handleBlur);
    window.addEventListener('pointercancel', this.handleBlur);
    document.addEventListener('visibilitychange', this.handleVisibility);
  }

  detach(): void {
    window.removeEventListener('keydown', this.handleDown);
    window.removeEventListener('keyup', this.handleUp);
    window.removeEventListener('blur', this.handleBlur);
    window.removeEventListener('pointercancel', this.handleBlur);
    document.removeEventListener('visibilitychange', this.handleVisibility);
    this.handleBlur();
  }

  private held(...names: string[]): boolean {
    return names.some((n) => this.keys.has(n));
  }

  private padPauseHeld = false;

  update(dt: number): DriveInput {
    const pad = readGamepad();

    // Start/Options on the pad toggles pause, edge-triggered.
    if (pad?.pausePressed && !this.padPauseHeld) this.onPause?.();
    this.padPauseHeld = pad?.pausePressed ?? false;

    let throttleRaw = this.held('w', 'arrowup') ? 1 : 0;
    let brakeRaw = this.held('s', 'arrowdown') ? 1 : 0;
    let steerRaw = (this.held('a', 'arrowleft') ? -1 : 0) + (this.held('d', 'arrowright') ? 1 : 0);
    let handbrake = this.held(' ', 'shift');

    if (pad) {
      throttleRaw = Math.max(throttleRaw, pad.throttle);
      brakeRaw = Math.max(brakeRaw, pad.brake);
      if (Math.abs(pad.steer) > Math.abs(steerRaw)) steerRaw = pad.steer;
      handbrake = handbrake || pad.handbrake;
    }

    // Touch stays "active" only while something is actually being pressed, so a
    // lost pointerup cannot pin the throttle open.
    if (this.touch.throttle === 0 && this.touch.brake === 0 && this.touch.steer === 0) {
      this.touchActive = false;
    }
    if (this.touchActive) {
      throttleRaw = Math.max(throttleRaw, this.touch.throttle);
      brakeRaw = Math.max(brakeRaw, this.touch.brake);
      if (Math.abs(this.touch.steer) > Math.abs(steerRaw)) steerRaw = this.touch.steer;
    }

    // Analogue ramps: fast to apply, faster to release.
    const rate = (target: number, current: number, up: number, down: number) => {
      const speed = Math.abs(target) > Math.abs(current) ? up : down;
      const delta = target - current;
      const max = speed * dt;
      return current + Math.max(-max, Math.min(max, delta));
    };

    this.throttleSmooth = rate(throttleRaw, this.throttleSmooth, 4.5, 8);
    this.brakeSmooth = rate(brakeRaw, this.brakeSmooth, 6, 9);
    // Steering returns to centre quickly so the car self-settles.
    this.steerSmooth = rate(steerRaw, this.steerSmooth, 3.4, 6.5);

    this.state.throttle = clamp01(this.throttleSmooth);
    this.state.brake = clamp01(this.brakeSmooth);
    this.state.steer = Math.max(-1, Math.min(1, this.steerSmooth));
    this.state.handbrake = handbrake;
    return this.state;
  }

  reset(): void {
    this.steerSmooth = 0;
    this.throttleSmooth = 0;
    this.brakeSmooth = 0;
    this.touch.throttle = 0;
    this.touch.brake = 0;
    this.touch.steer = 0;
  }
}

const CONSUMED = new Set([
  'arrowup',
  'arrowdown',
  'arrowleft',
  'arrowright',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  ' ',
  'Space',
]);

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function readGamepad(): {
  throttle: number;
  brake: number;
  steer: number;
  handbrake: boolean;
  pausePressed: boolean;
} | null {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
  const pads = navigator.getGamepads();
  // Prefer a pad the browser has normalised to the standard layout — the
  // button numbers below are only meaningful there. Fall back to the first
  // connected pad rather than none: better a slightly odd mapping than a
  // controller that does nothing at all.
  const pad =
    [...pads].find((p) => p && p.mapping === 'standard') ?? [...pads].find((p) => p != null) ?? null;
  if (!pad) return null;
  const deadzone = (v: number) => (Math.abs(v) < 0.12 ? 0 : v);
  return {
    throttle: pad.buttons[7]?.value ?? 0,
    brake: pad.buttons[6]?.value ?? 0,
    steer: deadzone(pad.axes[0] ?? 0),
    handbrake: pad.buttons[0]?.pressed ?? false,
    pausePressed: pad.buttons[9]?.pressed ?? false,
  };
}
