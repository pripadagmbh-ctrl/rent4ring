/**
 * The two of them, out loud, using the voices the browser already has.
 *
 * The joke writes itself: Herr Müller is German and speaks English, so he is
 * read by a **German** voice given English text. That is not a workaround —
 * a de-DE engine pronouncing "Nordschleife" correctly and "thoroughly" not at
 * all is exactly how he sounds. Dale gets en-GB, faster and a shade higher, so
 * you can tell in a corner which of them is talking without reading anything.
 *
 * No dependency, no files, no key: `speechSynthesis` ships with the browser.
 * The trade is quality — this is a stand-in until the real recordings exist,
 * and the whole thing is behind a toggle for anyone who would rather it were
 * not there at all.
 */

export type Speaker = 'mueller' | 'dale';

/**
 * `urgent` cuts off whatever is talking; `normal` is dropped if anyone is.
 * Dale calling a braking point matters more than Herr Müller finishing his
 * sentence about the paintwork, and two of them at once is worse than either.
 */
export type Urgency = 'normal' | 'urgent';

interface VoiceChoice {
  voice: SpeechSynthesisVoice | null;
  pitch: number;
  rate: number;
}

let enabled = false;
let primed = false;
let chosen: Record<Speaker, VoiceChoice> | null = null;
/**
 * Whether one of *our* lines is in flight. Deliberately not `synth.speaking`:
 * that is also true while the silent warm-up utterance from `primeSpeech` is
 * in the queue, and the first real line of the session was being dropped as a
 * result. Measured — the warm-up outlived the first `say`.
 */
let speaking: Speaker | null = null;
/**
 * `onend` is not guaranteed to fire on every engine, and a stuck flag would
 * mean silence for the rest of the session. This clears it regardless.
 */
let releaseTimer = 0;

const synth = (): SpeechSynthesis | null =>
  typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;

/**
 * Both characters are men, and the API has no field for that — the only thing
 * a voice exposes is its name. So: the names the common platforms ship for a
 * male voice, checked first, with the plain language match as the fallback.
 * Getting it wrong is not fatal, it just means Herr Müller sounds like Hedda.
 */
const MALE_DE = ['stefan', 'markus', 'yannick', 'conrad', 'killian'];
const MALE_EN = ['george', 'daniel', 'oliver', 'ryan', 'arthur', 'james'];

/**
 * First voice whose language matches one of `prefixes`, in order of
 * preference. Local voices are preferred over network ones: the remote ones
 * sound better but arrive late, and a call that lands after the corner is
 * worse than a call in a flat voice.
 */
function pickVoice(
  voices: SpeechSynthesisVoice[],
  prefixes: string[],
  preferNames: string[],
): SpeechSynthesisVoice | null {
  for (const prefix of prefixes) {
    const matches = voices.filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith(prefix));
    if (!matches.length) continue;
    const named = matches.find((v) =>
      preferNames.some((n) => v.name.toLowerCase().includes(n)),
    );
    return named ?? matches.find((v) => v.localService) ?? matches[0];
  }
  return null;
}

function chooseVoices(): void {
  const s = synth();
  if (!s) return;
  const voices = s.getVoices();
  if (!voices.length) return;

  const german = pickVoice(voices, ['de-de', 'de-at', 'de-ch', 'de'], MALE_DE);
  const british = pickVoice(voices, ['en-gb', 'en-ie', 'en-au', 'en'], MALE_EN);

  chosen = {
    // Slow and low. He is not in a hurry and he is not pleased.
    mueller: { voice: german, pitch: german ? 0.8 : 0.7, rate: 0.92 },
    // Quicker and brighter — he is talking against a corner arriving.
    dale: { voice: british, pitch: 1.12, rate: 1.06 },
  };
}

/**
 * Must be called from inside a user gesture, like `unlockAudio`. Safari will
 * not speak at all until one `speak()` has happened during an activation, and
 * on every engine the voice list can still be empty on the first ask.
 */
export function primeSpeech(): void {
  const s = synth();
  if (!s) return;
  chooseVoices();
  if (!chosen) {
    // Chrome and Firefox fill the list asynchronously.
    s.addEventListener('voiceschanged', chooseVoices, { once: true });
  }
  if (primed) return;
  try {
    const warmup = new SpeechSynthesisUtterance(' ');
    warmup.volume = 0;
    s.speak(warmup);
    primed = true;
  } catch {
    /* try again on the next gesture */
  }
}

export function setSpeechEnabled(on: boolean): void {
  enabled = on;
  if (!on) stopSpeech();
}

/**
 * `speechSynthesis` belongs to the browser, not to the page: an utterance
 * already queued carries on after the page navigates away or is closed, so a
 * half-finished sentence follows you out of the game. Nothing else in the app
 * has that problem, because everything else dies with the tab.
 */
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', stopSpeech);
  window.addEventListener('beforeunload', stopSpeech);
}

export function isSpeechEnabled(): boolean {
  return enabled;
}

/** Whether the browser can do this at all — used to hide the toggle if not. */
export function speechAvailable(): boolean {
  return synth() !== null;
}

export function stopSpeech(): void {
  const s = synth();
  if (!s) return;
  release();
  try {
    s.cancel();
  } catch {
    /* nothing was queued */
  }
}

function release(): void {
  speaking = null;
  if (releaseTimer) {
    clearTimeout(releaseTimer);
    releaseTimer = 0;
  }
}

/**
 * Say one line. Returns silently — and cheaply — when speech is off, which is
 * the common case, so call sites do not need to guard.
 */
export function say(who: Speaker, text: string, urgency: Urgency = 'normal'): void {
  const s = synth();
  if (!enabled || !s || !text) return;
  if (!chosen) chooseVoices();

  // Someone is already talking: only an urgent line may cut in.
  if (speaking !== null && urgency !== 'urgent') return;
  if (speaking !== null) {
    release();
    s.cancel();
  }

  const pick = chosen?.[who];
  const utterance = new SpeechSynthesisUtterance(stripForSpeech(text));
  if (pick?.voice) utterance.voice = pick.voice;
  // Set the language too: without it some engines read English text with the
  // page's language and lose the accent that is the entire point.
  utterance.lang = pick?.voice?.lang ?? (who === 'mueller' ? 'de-DE' : 'en-GB');
  utterance.pitch = pick?.pitch ?? 1;
  utterance.rate = pick?.rate ?? 1;
  utterance.volume = 1;
  const done = () => {
    if (speaking === who) release();
  };
  utterance.onend = done;
  utterance.onerror = done;

  speaking = who;
  // Roughly twelve characters a second, plus a couple of seconds of slack.
  releaseTimer = window.setTimeout(done, (utterance.text.length / 12) * 1000 + 2000);
  try {
    s.speak(utterance);
  } catch {
    release();
  }
}

/**
 * Em dashes and ellipses come out as pauses in some engines and as the words
 * "em dash" in others; the arrow in "Dale → Herr Müller" is worse. Replace
 * them with punctuation every engine agrees on.
 */
function stripForSpeech(text: string): string {
  return text
    .replace(/[—–]/g, ', ')
    .replace(/…/g, '.')
    .replace(/[→←]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
