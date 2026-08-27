import type { DriveInput } from './physics';

export type CameraMode = 'chase' | 'bonnet' | 'cockpit';

/**
 * Keyboard + gamepad + touch input, smoothed into analogue values so the
 * car is drivable without a wheel.
 */
export class InputManager {
  readonly state: DriveInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };

  private capture = true;

  /**
   * While a dialog (pause, ceremony) owns the screen this is false: drive
   * keys are ignored and — crucially — not preventDefault-ed, so Space and
   * Enter reach the dialog's buttons again. Escape stays live to unpause.
   *
   * Both transitions drop everything held. A key whose `keyup` the browser
   * never delivered — swallowed by an OS shortcut, a context menu, a
   * permission prompt — otherwise stays in the set for the rest of the drive
   * and steers the car by itself, and there is no event left that would ever
   * clear it. That is why pausing and unpausing "fixed" the steering: the
   * dialog was the only thing that touched this flag. Now it is the flag that
   * does the clearing, so the fix is the rule rather than a lucky side effect.
   */
  get captureEnabled(): boolean {
    return this.capture;
  }

  set captureEnabled(on: boolean) {
    if (on === this.capture) return;
    this.capture = on;
    this.handleBlur();
    this.reset();
  }

  private keys = new Set<string>();
  /** When each held key last produced a `keydown`, for the stuck-key watchdog. */
  private lastSeen = new Map<string, number>();
  /**
   * Whether this machine sends auto-repeat at all. The watchdog below leans on
   * it, and switching it on blind would be far worse than the bug: on a setup
   * without repeat — some remote desktops, some VMs — it would drop the
   * throttle a second and a half into every straight.
   */
  private sawRepeat = false;
  private steerSmooth = 0;
  private throttleSmooth = 0;
  private brakeSmooth = 0;

  /** Touch/virtual controls, 0–1 and -1..1. */
  touch = { throttle: 0, brake: 0, steer: 0 };
  touchActive = false;

  onCameraToggle?: () => void;
  onReset?: () => void;
  onPause?: () => void;
  /** Double-tap X. Only the bike does anything with it. */
  onWheelie?: () => void;

  private readonly handleDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (!this.capture) {
      if (k === 'escape') this.onPause?.();
      return;
    }
    if (CONSUMED.has(k) || CONSUMED.has(e.code)) e.preventDefault();
    // Before the repeat guard below: a held key keeps arriving as `repeat`
    // events, and those are what tell the watchdog the key is still down.
    if (e.repeat) this.sawRepeat = true;
    this.lastSeen.set(k, performance.now());
    if (this.keys.has(k)) return;
    this.keys.add(k);
    if (k === 'c') this.onCameraToggle?.();
    if (k === 'r') this.onReset?.();
    if (k === 'escape' || k === 'p') this.onPause?.();
    if (k === 'x') {
      const now = performance.now();
      // Second tap inside the window, and the window then closes — three taps
      // in a row are one wheelie, not two.
      if (now - this.lastX < DOUBLE_TAP_MS) {
        this.lastX = 0;
        this.onWheelie?.();
      } else {
        this.lastX = now;
      }
    }
  };

  private readonly handleUp = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    this.keys.delete(k);
    this.lastSeen.delete(k);
  };

  /**
   * Losing focus must drop every held control. Without this a key- or
   * pointer-down that never sees its matching up leaves the car driving itself.
   */
  private readonly handleBlur = () => {
    this.keys.clear();
    this.lastSeen.clear();
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

  /**
   * Releases keys the browser stopped talking about.
   *
   * A `keyup` can go missing — swallowed by an OS shortcut, a context menu, a
   * permission prompt that steals the key without blurring the window — and
   * the key then stays down for the rest of the drive with no event left that
   * would ever clear it. That is the car steering itself.
   *
   * A key that is genuinely held keeps sending auto-repeat, so silence for
   * this long means it is not held any more. Only armed once repeat has
   * actually been observed, so a machine that does not send it is untouched.
   */
  private dropStuckKeys(): void {
    if (!this.sawRepeat || !this.keys.size) return;
    const now = performance.now();
    for (const k of this.keys) {
      if (now - (this.lastSeen.get(k) ?? now) > STUCK_MS) {
        this.keys.delete(k);
        this.lastSeen.delete(k);
      }
    }
  }

  private padPauseHeld = false;
  /** When X was last tapped, for the double-tap that pulls a wheelie. */
  private lastX = 0;

  update(dt: number): DriveInput {
    const pad = readGamepad();

    // Start/Options on the pad toggles pause, edge-triggered.
    if (pad?.pausePressed && !this.padPauseHeld) this.onPause?.();
    this.padPauseHeld = pad?.pausePressed ?? false;

    this.dropStuckKeys();

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

  /**
   * One line describing what the game currently believes is being pressed.
   * Shown on the pause screen, for the same reason the audio state is: a car
   * that steers itself is invisible from the driver's seat, and the three
   * things that cause it — a key the browser never reported as released, a
   * controller nobody is holding, capture left switched off — all look
   * identical from outside and are all obvious from here.
   */
  diagnostic(): string {
    const parts: string[] = [];
    parts.push(this.captureEnabled ? 'keys live' : 'keys OFF (dialog)');
    parts.push(this.keys.size ? `held: ${[...this.keys].join('+')}` : 'held: none');
    if (this.touchActive) {
      parts.push(`touch ${this.touch.steer.toFixed(1)}/${this.touch.throttle.toFixed(1)}`);
    }
    const pad = padDiagnostic();
    if (pad) {
      parts.push(
        `pad "${pad.id.slice(0, 28)}" ${pad.mapping || 'non-standard'}` +
          (pad.mapping === 'standard'
            ? ` ${pad.engaged ? 'engaged' : 'idle'} axis ${pad.rawSteer.toFixed(2)}→${pad.steer.toFixed(2)}`
            : ' — ignored'),
      );
    }
    parts.push(`steer ${this.state.steer.toFixed(2)}`);
    return parts.join(' · ');
  }
}

/**
 * How long a key may go without an auto-repeat before it counts as released.
 * Windows and macOS both repeat every 30-60 ms once the initial delay is past,
 * so a second is many missed repeats — long enough never to fire on a real
 * hold, short enough that a stuck key is a blip rather than the drive.
 */
const STUCK_MS = 1000;

/**
 * How long the second tap of a double-tap may take. 320 ms is comfortably
 * inside what reads as "twice" and comfortably outside an accidental repeat.
 */
const DOUBLE_TAP_MS = 320;

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

export interface PadReading {
  throttle: number;
  brake: number;
  steer: number;
  handbrake: boolean;
  pausePressed: boolean;
}

/** Live pad state, for the diagnostic on the pause screen. */
export interface PadDiagnostic {
  id: string;
  mapping: string;
  /** False while the pad is connected but not yet trusted to drive. */
  engaged: boolean;
  /** The resting value that is subtracted from the steering axis. */
  zero: number;
  rawSteer: number;
  steer: number;
  throttle: number;
  brake: number;
}

/**
 * The resting offset of the steering axis, learned once. Sticks drift, and a
 * drifting axis used to steer the car all by itself: `update()` lets the pad
 * override the keyboard whenever its magnitude is the larger of the two, and
 * with no key pressed the keyboard's is zero.
 */
let padZero: number | null = null;
/**
 * A pad contributes nothing until it has been moved deliberately once. Same
 * idea as `touchActive`: a controller sitting on the sofa must not be able to
 * drive, and neither must a device the browser merely *reports* as a pad.
 */
let padEngaged = false;
let padId = '';

/** Movement that counts as "somebody is actually using this". */
const PAD_WAKE = 0.35;
const PAD_DEADZONE = 0.15;

function livePad(): Gamepad | null {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
  // Standard mapping only. The old code fell back to the first connected
  // device on the grounds that an odd mapping beats no controller — it does
  // not: on a non-standard device the indices below are arbitrary, so
  // buttons[7] can sit at "pressed" and pin the throttle open, buttons[0] can
  // hold the handbrake on, and axes[0] can be some unrelated axis parked off
  // centre. That is a car that steers itself and will not respond, which is
  // very much worse than a controller that does nothing.
  for (const p of navigator.getGamepads()) {
    if (p && p.connected && p.mapping === 'standard') return p;
  }
  return null;
}

function readGamepad(): PadReading | null {
  const pad = livePad();
  if (!pad) {
    padZero = null;
    padEngaged = false;
    padId = '';
    return null;
  }
  if (pad.id !== padId) {
    padId = pad.id;
    padZero = null;
    padEngaged = false;
  }

  const raw = pad.axes[0] ?? 0;
  // Learn the resting value, but never from a stick that is being held: if the
  // first sample is already deflected, wait for one that is not.
  if (padZero === null && Math.abs(raw) < 0.5) padZero = raw;
  const centred = raw - (padZero ?? 0);

  const throttle = pad.buttons[7]?.value ?? 0;
  const brake = pad.buttons[6]?.value ?? 0;
  if (Math.abs(centred) > PAD_WAKE || throttle > 0.5 || brake > 0.5) padEngaged = true;
  if (!padEngaged) return null;

  return {
    throttle,
    brake,
    steer: Math.abs(centred) < PAD_DEADZONE ? 0 : centred,
    handbrake: pad.buttons[0]?.pressed ?? false,
    pausePressed: pad.buttons[9]?.pressed ?? false,
  };
}

/**
 * What the pad is doing right now, or null if there is none. Read by the pause
 * screen: a controller misbehaving is invisible from the driver's seat, and
 * this turns "the steering went funny" into something reportable.
 */
export function padDiagnostic(): PadDiagnostic | null {
  const pad = livePad();
  if (!pad) return null;
  const raw = pad.axes[0] ?? 0;
  const centred = raw - (padZero ?? 0);
  return {
    id: pad.id,
    mapping: pad.mapping,
    engaged: padEngaged,
    zero: padZero ?? 0,
    rawSteer: raw,
    steer: Math.abs(centred) < PAD_DEADZONE ? 0 : centred,
    throttle: pad.buttons[7]?.value ?? 0,
    brake: pad.buttons[6]?.value ?? 0,
  };
}
