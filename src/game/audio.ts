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
  private muted = false;

  constructor(private car: Car) {}

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;
    if (ctx.state === 'suspended') await ctx.resume();

    const master = ctx.createGain();
    master.gain.value = 0.0001;
    master.connect(ctx.destination);
    this.master = master;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1800;
    filter.Q.value = 0.6;
    filter.connect(master);
    this.filter = filter;

    // Harmonic stack — an EV is dominated by a high whine, an engine by low orders.
    const harmonics = this.car.electric
      ? [
          { mult: 1, gain: 0.1, type: 'sine' as OscillatorType },
          { mult: 6, gain: 0.28, type: 'sawtooth' as OscillatorType },
          { mult: 12, gain: 0.14, type: 'sine' as OscillatorType },
        ]
      : [
          { mult: 0.5, gain: 0.34, type: 'sawtooth' as OscillatorType },
          { mult: 1, gain: 0.3, type: 'sawtooth' as OscillatorType },
          { mult: 1.5, gain: 0.16, type: 'square' as OscillatorType },
          { mult: 2, gain: 0.12, type: 'sawtooth' as OscillatorType },
          { mult: 3, gain: 0.07, type: 'sine' as OscillatorType },
        ];

    for (const h of harmonics) {
      const osc = ctx.createOscillator();
      osc.type = h.type;
      osc.frequency.value = 60;
      const gain = ctx.createGain();
      gain.gain.value = h.gain;
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

    master.gain.linearRampToValueAtTime(0.35, ctx.currentTime + 0.4);
  }

  /**
   * @param rpmRatio engine speed as a fraction of redline
   * @param load     throttle 0–1
   * @param speedKmh road speed for the wind/tyre bed
   * @param slip     0–1, how much the tyres are sliding
   */
  update(rpmRatio: number, load: number, speedKmh: number, slip: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted) return;
    const now = ctx.currentTime;

    const base = this.car.electric ? 55 + rpmRatio * 420 : 32 + rpmRatio * this.car.redlineRpm * 0.021;

    for (const { osc, gain, mult } of this.oscillators) {
      osc.frequency.setTargetAtTime(base * mult, now, 0.045);
      // Load opens up the higher orders — that is most of the "on throttle" character.
      const loadBoost = mult > 1 ? 0.55 + load * 0.75 : 1;
      gain.gain.setTargetAtTime(gain.gain.value * 0 + baseGainFor(mult, this.car.electric) * loadBoost, now, 0.08);
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
    osc.start(now);
    osc.stop(now + 0.32);
  }

  /** Celebratory fanfare for the podium. */
  fanfare(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted) return;
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
      osc.connect(gain).connect(this.master!);
      osc.start(t);
      osc.stop(t + 0.45);
    });
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0.0001 : 0.35, this.ctx.currentTime, 0.1);
    }
  }

  dispose(): void {
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
    this.ctx?.close();
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
