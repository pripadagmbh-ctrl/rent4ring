import type { Car } from '../data/fleet';
import { getAudioContext, unlockAudio } from './audioContext';

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
  /** Tyre squeal: its own noise source, resonant filter and two modulators. */
  private squeal: {
    source: AudioBufferSourceNode;
    band: BiquadFilterNode;
    gain: GainNode;
    warble: OscillatorNode;
    warbleDepth: GainNode;
    chatter: OscillatorNode;
    chatterDepth: GainNode;
  } | null = null;
  /** Armco scrape: noise through a moving band, held open while in contact. */
  private scraping: {
    source: AudioBufferSourceNode;
    band: BiquadFilterNode;
    gain: GainNode;
    flutter: OscillatorNode;
    flutterDepth: GainNode;
  } | null = null;
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
    // Borrow the app-wide context that the first user gesture unlocked
    // (see audioContext.ts). Building one here instead would be too late for
    // mobile Safari: by the time a drive starts, the gesture that allowed
    // audio is several async hops in the past.
    const ctx = getAudioContext() ?? unlockAudio();
    if (!ctx) return;
    this.ctx = ctx;
    if (ctx.state === 'suspended') await ctx.resume();
    // dispose() may have run while resume() was pending (StrictMode's
    // double-mount does exactly this) — abandon the half-built graph. The
    // context is shared, so it is never closed here, only let go of.
    if (this.disposed) {
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

    // Two seconds of white noise, looped. Shared shape, two consumers: the
    // wind bed below and the tyre squeal after it.
    const makeNoise = (): AudioBufferSourceNode => {
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      return src;
    };

    // Wind bed. Only wind now — what the tyres do has its own chain, and
    // pushing both through one fixed 900 Hz band made a slide sound like
    // somebody turning up the wind.
    const noise = makeNoise();
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 900;
    noise.connect(noiseFilter).connect(noiseGain).connect(master);
    noise.start();
    this.noise = noise;
    this.noiseGain = noiseGain;

    // ------------------------------------------------------- tyre squeal
    // A tyre howls because the tread blocks stick and let go, over and over,
    // which is a narrow band of noise rather than a tone or a hiss. So: white
    // noise through a resonant bandpass, with the Q — how tonal it is — under
    // the same control as everything else. Two modulators keep it alive:
    // `warble` slides the centre a few percent at walking pace, `chatter`
    // pulses the level fast enough to read as stick-slip rather than tremolo.
    const squealSource = makeNoise();
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = SQUEAL_BASE_HZ;
    band.Q.value = SQUEAL_Q_TONAL;
    const squealGain = ctx.createGain();
    squealGain.gain.value = 0;
    squealSource.connect(band).connect(squealGain).connect(master);
    squealSource.start();

    const warble = ctx.createOscillator();
    warble.type = 'sine';
    warble.frequency.value = 6.3;
    const warbleDepth = ctx.createGain();
    warbleDepth.gain.value = 0;
    warble.connect(warbleDepth).connect(band.frequency);
    warble.start();

    const chatter = ctx.createOscillator();
    chatter.type = 'sine';
    chatter.frequency.value = 21;
    const chatterDepth = ctx.createGain();
    chatterDepth.gain.value = 0;
    chatter.connect(chatterDepth).connect(squealGain.gain);
    chatter.start();

    this.squeal = {
      source: squealSource,
      band,
      gain: squealGain,
      warble,
      warbleDepth,
      chatter,
      chatterDepth,
    };

    // ------------------------------------------------------ Armco scrape
    // Steel on steel is broad and bright, not a resonant howl, so this runs a
    // much wider band than the tyres and sits higher. `flutter` breaks it up:
    // a barrier is bolted together in sections and the car catches on each one.
    const scrapeSource = makeNoise();
    const scrapeBand = ctx.createBiquadFilter();
    scrapeBand.type = 'bandpass';
    scrapeBand.frequency.value = 1500;
    scrapeBand.Q.value = 0.9;
    const scrapeGain = ctx.createGain();
    scrapeGain.gain.value = 0;
    scrapeSource.connect(scrapeBand).connect(scrapeGain).connect(master);
    scrapeSource.start();

    const flutter = ctx.createOscillator();
    flutter.type = 'sawtooth';
    flutter.frequency.value = 34;
    const flutterDepth = ctx.createGain();
    flutterDepth.gain.value = 0;
    flutter.connect(flutterDepth).connect(scrapeGain.gain);
    flutter.start();

    this.scraping = {
      source: scrapeSource,
      band: scrapeBand,
      gain: scrapeGain,
      flutter,
      flutterDepth,
    };

    // A drive started while muted must stay muted (H7).
    master.gain.linearRampToValueAtTime(this.muted ? 0.0001 : 0.35, ctx.currentTime + 0.4);
  }

  /**
   * @param rpmRatio engine speed as a fraction of redline
   * @param load     throttle 0–1
   * @param speedKmh road speed for the wind bed
   * @param grip     tyre grip usage: 1 is the limit, above 1 the car is sliding
   */
  update(rpmRatio: number, load: number, speedKmh: number, grip: number): void {
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
      this.noiseGain.gain.setTargetAtTime(Math.min(speedKmh / 320, 1) * 0.1, now, 0.06);
    }
    this.updateSqueal(speedKmh, grip, now);
  }

  /**
   * How hard the tyres are working, turned into how they sound.
   *
   * Three things move together, and they are not the same thing:
   *
   *  · `work` — how far into the last of the grip the tyre is. Nothing below
   *    SQUEAL_START: a tyre at three quarters of its limit is silent, and a
   *    car that chirps through every gentle bend sounds like a toy.
   *  · `sliding` — how far *past* the limit. A tyre only howls while it is
   *    still gripping and letting go in turn; once it is properly sliding the
   *    howl broadens into a scrub, so past the limit the Q falls away and the
   *    level keeps climbing. That is the difference between a car on the edge
   *    and a car that has gone.
   *  · `rolling` — a stationary tyre cannot squeal however hard it is pushed,
   *    and the pitch climbs with road speed because the tread blocks are
   *    passing through the contact patch faster.
   */
  private updateSqueal(speedKmh: number, grip: number, now: number): void {
    const s = this.squeal;
    if (!s) return;

    const work = clamp01((grip - SQUEAL_START) / (1 - SQUEAL_START));
    const sliding = clamp01((grip - 1) * 2.8); // full scrub at 1.35, just inside the 1.4 cap
    const rolling = clamp01((speedKmh - 6) / 26);

    // Squared, so the last few percent of grip are where almost all of the
    // noise appears — that is what makes it usable as a signal to the driver
    // rather than background texture.
    //
    // The two constants look enormous next to the engine's gains (0.34 for its
    // loudest harmonic) and are not comparable to them: a Q=9 bandpass passes
    // roughly a 120 Hz slice of a 22 kHz noise floor, so about eleven twelfths
    // of the signal never reaches the mix. Rendered offline and measured, the
    // engine stack sits at 0.264 RMS and these put the tyres at 0.054 on the
    // limit and 0.095 in a full slide — a fifth to a third of the engine, and
    // 0.007 for the first chirp at 90% grip. Present without drowning the car.
    const level = work * work * rolling * (SQUEAL_AT_LIMIT + sliding * SQUEAL_SLIDE_EXTRA);

    const centre = SQUEAL_BASE_HZ + rolling * 250 + work * 300;
    const q = SQUEAL_Q_TONAL - sliding * (SQUEAL_Q_TONAL - SQUEAL_Q_SCRUB);

    // A bandpass passes a slice of white noise f0/Q wide, so dropping Q from 9
    // to 2.2 for the scrub doubles the amplitude on its own. Divide that back
    // out and `level` above means what it says — otherwise the slide would get
    // loud twice over, once because it should and once by accident.
    s.gain.gain.setTargetAtTime(level * Math.sqrt(q / SQUEAL_Q_TONAL), now, 0.05);
    s.band.frequency.setTargetAtTime(centre, now, 0.07);
    s.band.Q.setTargetAtTime(q, now, 0.09);

    // Both modulators are scaled by what they are modulating, not fixed: at a
    // whisper a fixed depth would be the loudest part of the sound.
    s.warbleDepth.gain.setTargetAtTime(centre * 0.025 + work * 20, now, 0.1);
    s.chatterDepth.gain.setTargetAtTime(level * 0.3, now, 0.06);
    s.chatter.frequency.setTargetAtTime(17 + work * 14, now, 0.1);
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

  /**
   * The car finding the Armco. Three layers, because a crash is three things
   * arriving at once and a single swept tone is none of them:
   *
   *  · the **thud** — the mass of the car stopping. Low, short, and the only
   *    part a gentle brush against the barrier produces.
   *  · the **crunch** — sheet metal folding. A burst of noise through a band
   *    that sweeps downwards, which is what gives the hit its weight.
   *  · the **debris** — glass and plastic leaving the car, as a scatter of
   *    short high blips at random pitches. Only above half strength: a light
   *    tap that sprays glass sounds absurd, and hearing it is the cue that
   *    this one was expensive.
   *
   * @param strength 0–1, closing speed into the barrier over 18 m/s
   */
  impact(strength: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted) return;
    const now = ctx.currentTime;
    const hit = clamp01(strength);
    const master = this.master;

    /** Frees a one-shot's nodes once it has finished sounding. */
    const retire = (node: AudioScheduledSourceNode, ...rest: AudioNode[]) => {
      node.onended = () => {
        node.disconnect();
        for (const n of rest) n.disconnect();
      };
    };

    // --- the thud -------------------------------------------------------
    const thud = ctx.createOscillator();
    const thudGain = ctx.createGain();
    thud.type = 'triangle';
    thud.frequency.setValueAtTime(150, now);
    thud.frequency.exponentialRampToValueAtTime(32, now + 0.22);
    thudGain.gain.setValueAtTime(0.02 + hit * 0.5, now);
    thudGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    thud.connect(thudGain).connect(master);
    retire(thud, thudGain);
    thud.start(now);
    thud.stop(now + 0.32);

    // --- the crunch -----------------------------------------------------
    // Short enough to read as one event: past about 250 ms a noise burst stops
    // sounding like an impact and starts sounding like a passing lorry.
    const crunchLen = 0.16 + hit * 0.12;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * crunchLen), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.6;
    const crunch = ctx.createBufferSource();
    crunch.buffer = buffer;
    const crunchBand = ctx.createBiquadFilter();
    crunchBand.type = 'bandpass';
    crunchBand.Q.value = 1.1;
    crunchBand.frequency.setValueAtTime(900 + hit * 1500, now);
    crunchBand.frequency.exponentialRampToValueAtTime(260, now + crunchLen);
    const crunchGain = ctx.createGain();
    // Near-instant attack. Ramping in over even 20 ms turns a hit into a whoosh.
    crunchGain.gain.setValueAtTime(0.0001, now);
    crunchGain.gain.exponentialRampToValueAtTime(0.03 + hit * 0.6, now + 0.006);
    crunchGain.gain.exponentialRampToValueAtTime(0.0001, now + crunchLen);
    crunch.connect(crunchBand).connect(crunchGain).connect(master);
    retire(crunch, crunchBand, crunchGain);
    crunch.start(now);

    // --- the debris -----------------------------------------------------
    if (hit > 0.5) {
      const shards = Math.round(4 + hit * 8);
      for (let i = 0; i < shards; i++) {
        const t = now + 0.02 + Math.random() * (0.1 + hit * 0.28);
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = 2200 + Math.random() * 3600;
        const peak = (0.02 + hit * 0.05) * (0.4 + Math.random() * 0.6);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(peak, t + 0.004);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05 + Math.random() * 0.07);
        osc.connect(gain).connect(master);
        retire(osc, gain);
        osc.start(t);
        osc.stop(t + 0.14);
      }
    }
  }

  /**
   * The car grinding along the barrier, fed every frame for as long as it is
   * touching. Separate from `impact` on purpose: the hit is one event, but
   * sliding down forty metres of Armco is a sound that has to last as long as
   * the slide does, and before this the whole slide after the first thud was
   * silent.
   *
   * @param intensity 0 when the car is clear of the barrier, otherwise how
   *                  fast it is dragging along it
   */
  scrape(intensity: number): void {
    const s = this.scraping;
    if (!this.ctx || !s) return;
    const now = this.ctx.currentTime;
    const k = clamp01(intensity);
    // Fast up, slower down: contact starts abruptly and the sound should too,
    // but cutting it dead the instant the car comes off the barrier clicks.
    s.gain.gain.setTargetAtTime(k * 0.34, now, k > 0.01 ? 0.02 : 0.08);
    s.band.frequency.setTargetAtTime(1500 + k * 2200, now, 0.05);
    s.flutterDepth.gain.setTargetAtTime(k * 0.2, now, 0.05);
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
    for (const { osc, gain } of this.oscillators) {
      try {
        osc.stop();
      } catch {
        /* already stopped */
      }
      osc.disconnect();
      gain.disconnect();
    }
    this.oscillators = [];
    try {
      this.noise?.stop();
    } catch {
      /* already stopped */
    }
    if (this.squeal) {
      const { source, band, gain, warble, warbleDepth, chatter, chatterDepth } = this.squeal;
      for (const node of [source, warble, chatter]) {
        try {
          node.stop();
        } catch {
          /* already stopped */
        }
      }
      for (const node of [source, band, gain, warble, warbleDepth, chatter, chatterDepth]) {
        node.disconnect();
      }
      this.squeal = null;
    }
    if (this.scraping) {
      const { source, band, gain, flutter, flutterDepth } = this.scraping;
      for (const node of [source, flutter]) {
        try {
          node.stop();
        } catch {
          /* already stopped */
        }
      }
      for (const node of [source, band, gain, flutter, flutterDepth]) {
        node.disconnect();
      }
      this.scraping = null;
    }
    // The context is shared across drives and must survive this one: closing
    // it would silence every later drive, and on iOS it cannot be unlocked
    // again without a fresh user gesture. So tear down only what this
    // instance added, and hand the context back intact.
    this.noise?.disconnect();
    this.noiseGain?.disconnect();
    this.filter?.disconnect();
    this.master?.disconnect();
    this.sfx?.disconnect();
    this.noise = null;
    this.noiseGain = null;
    this.filter = null;
    this.master = null;
    this.sfx = null;
    this.ctx = null;
    this.started = false;
  }
}

/** Grip usage at which the tyres first make themselves heard. */
const SQUEAL_START = 0.84;
/** Centre of the squeal band at a crawl; road speed and load lift it. */
const SQUEAL_BASE_HZ = 540;
/** Resonance while the tyre is still gripping and letting go — a howl. */
const SQUEAL_Q_TONAL = 9;
/** Resonance once it is properly sliding — a scrub, much wider. */
const SQUEAL_Q_SCRUB = 2.2;
/** Gain into the squeal band with the tyre exactly on its limit. */
const SQUEAL_AT_LIMIT = 2.0;
/** How much more it gains once the tyre is properly sliding. */
const SQUEAL_SLIDE_EXTRA = 1.35;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

function baseGainFor(mult: number, electric: boolean): number {
  if (electric) return mult === 1 ? 0.1 : mult === 6 ? 0.28 : 0.14;
  if (mult === 0.5) return 0.34;
  if (mult === 1) return 0.3;
  if (mult === 1.5) return 0.16;
  if (mult === 2) return 0.12;
  return 0.07;
}
