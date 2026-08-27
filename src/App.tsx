import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { FLEET, type Car } from './data/fleet';
import type { MuellerLine } from './data/muellerLines';
import { Game, type HudState, type LapResult } from './game/Game';
import { listenForAudioUnlock } from './game/audioContext';
import Menu from './ui/Menu';
import Garage from './ui/Garage';
import Hud from './ui/Hud';
import Ceremony from './ui/Ceremony';
import TouchControls from './ui/TouchControls';

type Phase = 'menu' | 'garage' | 'driving';

/**
 * WebGL setup can fail outright on old or locked-down devices. A crash there
 * used to leave a silent white screen; this catches both render-phase errors
 * (via the boundary) and Game-construction errors (via the fallback state),
 * and offers the one thing that sometimes helps: a reload.
 */
class ErrorBoundary extends Component<{ children: ReactNode }, { message: string | null }> {
  state = { message: null as string | null };

  static getDerivedStateFromError(err: unknown) {
    return { message: err instanceof Error ? err.message : String(err) };
  }

  render() {
    if (this.state.message !== null) return <FatalScreen message={this.state.message} />;
    return this.props.children;
  }
}

function FatalScreen({ message }: { message: string }) {
  return (
    <div className="screen fatal">
      <div className="dialog">
        <h2>Something broke</h2>
        <p>
          The game could not start on this device — usually a WebGL or graphics-driver limitation.
          <br />
          <span className="fatal__detail">{message}</span>
        </p>
        <div className="dialog__actions">
          <button className="btn-primary" onClick={() => location.reload()}>
            Reload
          </button>
        </div>
      </div>
    </div>
  );
}

const EMPTY_HUD: HudState = {
  phase: 'approach',
  speedKmh: 0,
  rpmRatio: 0,
  gear: 1,
  lapTime: 0,
  bestLap: null,
  lastLap: null,
  sectionName: 'Approach · Burgstrasse',
  distance: 0,
  lapLength: 0,
  offTrack: false,
  gripUsage: 0,
  lateralG: 0,
  countdown: 3.2,
  delta: null,
  sectors: [],
  contacts: 0,
  progress: 0,
  carPos: { x: 0, z: 0 },
  ghostPos: null,
  approachRemaining: 870,
  damage: 0,
  damageCost: 0,
  muellerMood: 'idle',
  muellerLine: 'Right then. Down the Burgstrasse and up to the Ring — mind the kerbs.',
  reversing: false,
};

export default function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}

function AppInner() {
  const [phase, setPhase] = useState<Phase>('menu');
  const [car, setCar] = useState<Car>(FLEET[5]);
  const [assists, setAssists] = useState(true);
  const [muted, setMuted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [hud, setHud] = useState<HudState>(EMPTY_HUD);
  const [lapResult, setLapResult] = useState<LapResult | null>(null);
  const [isTouch, setIsTouch] = useState(false);
  const [gameReady, setGameReady] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  /** The send-off Herr Müller gave in the garage, carried into the drive. */
  const [departureLine, setDepartureLine] = useState<MuellerLine | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  // The HUD updates every frame; batching through rAF keeps React out of the
  // hot loop instead of re-rendering 60 times a second.
  const hudFrame = useRef(0);

  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    setIsTouch(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsTouch(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Mobile Safari only unlocks audio from inside a user gesture, so claim the
  // very first one — long before a drive (and its EngineAudio) exists.
  useEffect(() => listenForAudioUnlock(), []);

  useEffect(() => {
    if (phase !== 'driving' || !canvasRef.current) return;

    const canvas = canvasRef.current;
    let pending: HudState | null = null;

    let game: Game;
    try {
      game = new Game(canvas, car, {
      departureLine,
      onHud(state) {
        // Copy, because Game reuses its telemetry object between frames.
        pending = { ...state, sectors: [...state.sectors] };
        if (!hudFrame.current) {
          hudFrame.current = requestAnimationFrame(() => {
            hudFrame.current = 0;
            if (pending) setHud(pending);
          });
        }
      },
      onLapComplete(result) {
        setLapResult(result);
        game.setPaused(true);
      },
    });
    } catch (err) {
      setFatal(err instanceof Error ? err.message : String(err));
      return;
    }

    gameRef.current = game;
    // Dev-only handle so the running simulation can be inspected from the console.
    if (import.meta.env.DEV) (window as unknown as { __game?: Game }).__game = game;
    game.setAssists(assists);
    game.setMuted(muted);
    game.start();
    setGameReady(true);

    const resize = () => game.resize(canvas.clientWidth, canvas.clientHeight);
    resize();
    window.addEventListener('resize', resize);
    game.input.onPause = () => setPaused((p) => !p);

    return () => {
      window.removeEventListener('resize', resize);
      if (hudFrame.current) cancelAnimationFrame(hudFrame.current);
      hudFrame.current = 0;
      game.dispose();
      gameRef.current = null;
      if (import.meta.env.DEV) delete (window as unknown as { __game?: Game }).__game;
      setGameReady(false);
    };
    // The game owns its own loop; only a car or phase change rebuilds it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, car]);

  useEffect(() => {
    gameRef.current?.setAssists(assists);
  }, [assists]);

  useEffect(() => {
    gameRef.current?.setMuted(muted);
  }, [muted]);

  useEffect(() => {
    // The ceremony pauses the game itself; do not fight it.
    if (lapResult) return;
    gameRef.current?.setPaused(paused);
  }, [paused, lapResult]);

  useEffect(() => {
    // While any dialog is up, drive keys stop capturing so Space/Enter can
    // operate the dialog buttons again.
    const g = gameRef.current;
    if (g) g.input.captureEnabled = !paused && !lapResult;
  }, [paused, lapResult, gameReady]);

  const startDriving = useCallback((farewell?: MuellerLine) => {
    // Straight from the menu there is no garage send-off; the game picks one.
    setDepartureLine(farewell ?? null);
    setHud(EMPTY_HUD);
    setLapResult(null);
    setPaused(false);
    setPhase('driving');
  }, []);

  const backToGarage = useCallback(() => {
    setLapResult(null);
    setPaused(false);
    setPhase('garage');
  }, []);

  const continueDriving = useCallback(() => {
    setLapResult(null);
    setPaused(false);
    gameRef.current?.setPaused(false);
  }, []);

  if (fatal !== null) {
    return (
      <div className="app">
        <FatalScreen message={fatal} />
      </div>
    );
  }

  if (phase === 'menu') {
    return (
      <div className="app">
        <Menu
          onGarage={() => setPhase('garage')}
          onQuickStart={() => startDriving()}
          carLabel={`${car.brand} ${car.model}`}
        />
      </div>
    );
  }

  if (phase === 'garage') {
    return (
      <div className="app">
        <Garage
          selected={car}
          onSelect={setCar}
          onStart={startDriving}
          onBack={() => setPhase('menu')}
          assists={assists}
          onAssistsChange={setAssists}
          muted={muted}
          onMutedChange={setMuted}
        />
      </div>
    );
  }

  return (
    <div className="app">
      <div className="screen drive">
        <canvas ref={canvasRef} className="drive__canvas" />
        <Hud
          hud={hud}
          onPause={() => setPaused(true)}
          onSkipApproach={() => gameRef.current?.skipApproach()}
        />
        {gameReady && gameRef.current && (
          <TouchControls input={gameRef.current.input} visible={isTouch && !paused && !lapResult} />
        )}

        {paused && !lapResult && (
          <div className="overlay">
            <div className="dialog">
              <h2>Paused</h2>
              <p>
                {car.brand} {car.model} · Home Circuit Nordschleife
              </p>
              <div className="dialog__actions">
                <button className="btn-primary" onClick={() => setPaused(false)}>
                  Resume
                </button>
                <button className="btn-ghost" onClick={() => setMuted((m) => !m)}>
                  {muted ? 'Sound on' : 'Sound off'}
                </button>
                <button className="btn-ghost" onClick={() => setAssists((a) => !a)}>
                  Driver aids {assists ? 'off' : 'on'}
                </button>
                <button className="btn-ghost" onClick={backToGarage}>
                  Garage
                </button>
              </div>
            </div>
          </div>
        )}

        {lapResult && (
          <Ceremony car={car} result={lapResult} onContinue={continueDriving} onGarage={backToGarage} />
        )}
      </div>
    </div>
  );
}
