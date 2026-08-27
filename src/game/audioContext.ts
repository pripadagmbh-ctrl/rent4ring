/**
 * One shared, gesture-unlocked AudioContext for the whole app.
 *
 * Mobile Safari only lets a page make sound if an AudioContext is created,
 * resumed AND fed a first source while the user's gesture is still the task
 * on the stack. The game used to build its context deep inside an async
 * chain — the garage's send-off alone defers the drive by 2.1 s, and then
 * `new Game()` spends seconds building the world before audio.start() ever
 * runs. By then the activation window is long gone and the context stays
 * suspended for the rest of the session.
 *
 * iPadOS defaults to "Desktop website" mode, where Safari's autoplay rules
 * are far laxer — which is exactly why the old code made sound on a tablet
 * but stayed silent on a phone.
 *
 * So the unlock happens here, on the very first pointer/key/touch event, and
 * `EngineAudio` borrows the context instead of making its own.
 */

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };
/** iOS 16.4+ exposes an audio session; not in the DOM lib types yet. */
type SessionNavigator = Navigator & { audioSession?: { type: string } };

let ctx: AudioContext | null = null;
let primed = false;
let listening = false;

/**
 * On iPhone the ring/silent switch mutes Web Audio outright — video and
 * `<audio>` keep playing, but anything synthesised goes silent, with the
 * context still reporting "running". Declaring the session as playback is
 * the only way to opt out of that, and it is why unlocking the context in
 * the gesture was not enough on a phone with the switch flipped.
 */
function claimAudioSession(): void {
  const session = (navigator as SessionNavigator).audioSession;
  if (!session) return;
  try {
    session.type = 'playback';
  } catch {
    /* older WebKit exposes it read-only */
  }
}

function create(): AudioContext | null {
  const Ctor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
  if (!Ctor) return null;
  try {
    return new Ctor();
  } catch {
    return null;
  }
}

/**
 * Create/resume the shared context. MUST be called synchronously from inside
 * a user gesture handler — anything deferred (setTimeout, await, a React
 * effect) is already too late on iOS.
 */
export function unlockAudio(): AudioContext | null {
  claimAudioSession();
  if (!ctx) ctx = create();
  if (!ctx) return null;

  // resume() returns a promise, but the call itself is what has to happen
  // inside the gesture; awaiting it here would defeat the point.
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);

  // Safari also wants a source to have actually run on the context before it
  // considers it unlocked; one silent sample is the cheapest way to do that.
  if (!primed) {
    try {
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
      primed = true;
    } catch {
      /* leave unprimed; the next gesture tries again */
    }
  }

  return ctx;
}

/**
 * Short human-readable state, so a silent phone can be diagnosed from the
 * pause screen instead of guessing.
 */
export function audioStatus(): string {
  if (!ctx) return 'not started';
  if (ctx.state !== 'running') return ctx.state;
  const session = (navigator as SessionNavigator).audioSession;
  return session ? `running (${session.type})` : 'running';
}

/** The shared context, or null before the first gesture. */
export function getAudioContext(): AudioContext | null {
  return ctx;
}

/**
 * Unlock on the first user interaction anywhere in the app. Listeners stay
 * attached until the context is genuinely running, because a first gesture
 * can still be refused (a tap that the browser does not count as
 * activation), and they are capture-phase so nothing can stop them first.
 */
export function listenForAudioUnlock(): () => void {
  if (listening) return () => undefined;
  listening = true;

  const events = ['pointerdown', 'touchend', 'keydown'] as const;
  const onGesture = () => {
    const c = unlockAudio();
    if (c && c.state === 'running') detach();
  };
  const detach = () => {
    for (const type of events) document.removeEventListener(type, onGesture, true);
    listening = false;
  };

  for (const type of events) document.addEventListener(type, onGesture, true);

  // Coming back from a phone call, a lock screen or another tab leaves the
  // context suspended; without this the drive resumes in silence.
  const onVisible = () => {
    if (document.visibilityState !== 'visible' || !ctx) return;
    claimAudioSession();
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  };
  document.addEventListener('visibilitychange', onVisible);

  return () => {
    detach();
    document.removeEventListener('visibilitychange', onVisible);
  };
}
