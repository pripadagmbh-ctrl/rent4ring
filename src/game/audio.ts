import type { Car } from '../data/fleet';

/**
 * Synthesised engine note. ICE cars get a stack of sawtooth harmonics tied to
 * engine speed; the Taycan gets the whine of a single-speed EV drive unit.
 */
export class EngineAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private oscillators: { osc: OscillatorNode; gain: GainNode; mult: number }[] = [];
  private noise: AudioBufferSourceNode | null = null;
  private noiseGain: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private started = false;
  private disposed = false;
  /** Engine damp — set for pause AND user mute. */
  private muted = false;
  /**
   * The user's own sound toggle, tracked separately: pausing the game damps
   * the engine but must not swallow one-shot SFX like the podium fanfare.
   */
  userMuted = false;
  private sfx: GainNode | null = null;

  constructor(private car: Car) {}

  async start(): Promise<void> {
    if (this.started || this.disposed) return;
    this.started = true;

    try {
      await this.boot();
    } catch {
      // Autoplay policies and flaky devices land here. Clearing the flag
      // lets the next user gesture try again instead of staying silent for
      // the rest of the session.
      this.started = false;
    }
  }

  private async boot(): Promise<void> {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;
    if (ctx.state === 'suspended') await ctx.resume();
    // dispose() may have run while resume() was pending (StrictMode's
    // double-mount does exactly this) — abandon the half-built graph.
    if (this.disposed) {
      void ctx.close().catch(() => undefined);
      this.ctx = null;
      return;
    }

    const master = ctx.createGain();
    master.gain.value = 0.0001;
    master.connect(ctx.destination);
    this.master = master;

    // One-shot effects bypass the master so a paused (damped) engine cannot
    // silence them; the user's mute still gates them at the call sites.
    const sfx = ctx.createGain();
    sfx.gain.value = 0.9;
    sfx.connect(ctx.destination);
    this.sfx = sfx;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1800;
    filter.Q.value = 0.6;
    filter.connect(master);
    this.filter = filter;

    // Harmonic stack — an EV is dominated by a high whine, an engine by low
    // orders. Gains come from baseGainFor, the same single source update()
    // uses, so the two can never drift apart again.
    const harmonics: { mult: number; type: OscillatorType }[] = this.car.electric
      ? [
          { mult: 1, type: 'sine' },
          { mult: 6, type: 'sawtooth' },
          { mult: 12, type: 'sine' },
        ]
      : [
          { mult: 0.5, type: 'sawtooth' },
          { mult: 1, type: 'sawtooth' },
          { mult: 1.5, type: 'square' },
          { mult: 2, type: 'sawtooth' },
          { mult: 3, type: 'sine' },
        ];

    for (const h of harmonics) {
      const osc = ctx.createOscillator();
      osc.type = h.type;
      osc.frequency.value = 60;
      const gain = ctx.createGain();
      gain.gain.value = baseGainFor(h.mult, this.car.electric);
      osc.connect(gain).connect(filter);
      osc.start();
      this.oscillators.push({ osc, gain, mult: h.mult });
    }

    // Tyre/wind noise bed.
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 900;
    noise.connect(noiseFilter).connect(noiseGain).connect(master);
    noise.start();
    this.noise = noise;
    this.noiseGain = noiseGain;

    // A drive started while muted must stay muted (H7).
    master.gain.linearRampToValueAtTime(this.muted ? 0.0001 : 0.35, ctx.currentTime + 0.4);
  }

  /**
   * @param rpmRatio engine speed as a fraction of redline
   * @param load     throttle 0–1
   * @param speedKmh road speed for the wind/tyre bed
   * @param slip     0–1, how much the tyres are sliding
   */
  update(rpmRatio: number, load: number, speedKmh: number, slip: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const now = ctx.currentTime;

    const base = this.car.electric ? 55 + rpmRatio * 420 : 32 + rpmRatio * this.car.redlineRpm * 0.021;

    for (const { osc, gain, mult } of this.oscillators) {
      osc.frequency.setTargetAtTime(base * mult, now, 0.045);
      // Load opens up the higher orders — that is most of the "on throttle" character.
      const loadBoost = mult > 1 ? 0.55 + load * 0.75 : 1;
      gain.gain.setTargetAtTime(baseGainFor(mult, this.car.electric) * loadBoost, now, 0.08);
    }

    if (this.filter) {
      this.filter.frequency.setTargetAtTime(700 + rpmRatio * 4200 + load * 1400, now, 0.07);
    }
    if (this.noiseGain) {
      const wind = Math.min(speedKmh / 320, 1) * 0.1;
      const scrub = slip * 0.3;
      this.noiseGain.gain.setTargetAtTime(wind + scrub, now, 0.06);
    }
  }

  /** Short blip layered over the harmonic stack on an upshift. */
  shift(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.09);
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    osc.connect(gain).connect(this.master);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
    osc.start(now);
    osc.stop(now + 0.14);
  }

  /** Impact thud when the car finds the Armco. */
  impact(strength: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.25);
    gain.gain.setValueAtTime(Math.min(0.4, strength * 0.4), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    osc.connect(gain).connect(this.master);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
    osc.start(now);
    osc.stop(now + 0.32);
  }

  /**
   * Celebratory fanfare for the podium. Runs on the SFX bus: the ceremony
   * pauses the game the moment the lap completes, and the pause damp on the
   * master used to swallow the fanfare before its first note landed.
   */
  fanfare(): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfx || this.userMuted) return;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const t = ctx.currentTime + i * 0.16;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.22, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
      osc.connect(gain).connect(this.sfx!);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
      osc.start(t);
      osc.stop(t + 0.45);
    });
  }

  /** The user's mute toggle alone — pause must never silence the SFX bus. */
  setUserMuted(muted: boolean): void {
    this.userMuted = muted;
    if (this.sfx && this.ctx) {
      this.sfx.gain.setTargetAtTime(muted ? 0.0001 : 0.9, this.ctx.currentTime, 0.05);
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0.0001 : 0.35, this.ctx.currentTime, 0.1);
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const { osc } of this.oscillators) {
      try {
        osc.stop();
      } catch {
        /* already stopped */
      }
    }
    this.oscillators = [];
    try {
      this.noise?.stop();
    } catch {
      /* already stopped */
    }
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.started = false;
  }
}

function baseGainFor(mult: number, electric: boolean): number {
  if (electric) return mult === 1 ? 0.1 : mult === 6 ? 0.28 : 0.14;
  if (mult === 0.5) return 0.34;
  if (mult === 1) return 0.3;
  if (mult === 1.5) return 0.16;
  if (mult === 2) return 0.12;
  return 0.07;
}
