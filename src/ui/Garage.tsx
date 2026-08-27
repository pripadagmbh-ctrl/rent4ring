import { useCallback, useEffect, useRef, useState } from 'react';
import { FLEET, type Car } from '../data/fleet';
import { GarageScene } from '../game/GarageScene';
import { farewellLine, garageLines, type MuellerLine } from '../data/muellerLines';
import { DALE_GARAGE } from '../data/daleTips';
import { formatLap } from './format';
import Logo from './Logo';
import Gorilla from './Gorilla';
import Barbet from './Barbet';
import CardReader from './CardReader';
import Dale from './Dale';
import TrackGuide from './TrackGuide';
import trackData from '../data/nordschleife.json';
import approachData from '../data/approach.json';

/** How long one of his garage lines stays up before the next one. */
const LINE_DWELL_MS = 6200;
/** How long one of Dale's floor lines stays up. Deliberately not a multiple
    of Herr Müller's dwell, so they do not fall into step. */
const DALE_DWELL_MS = 7900;
/** Beat between his send-off and the car actually rolling out. */
const FAREWELL_MS = 2100;

interface Props {
  selected: Car;
  onSelect(car: Car): void;
  /** The send-off he gave is handed on, so the drive opens on the same line. */
  onStart(farewell: MuellerLine): void;
  onBack(): void;
  assists: boolean;
  onAssistsChange(value: boolean): void;
  muted: boolean;
  onMutedChange(value: boolean): void;
}

function readBest(carId: string): number | null {
  try {
    const raw = localStorage.getItem(`r4r.best.${carId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { time?: number };
    return typeof parsed.time === 'number' ? parsed.time : null;
  } catch {
    return null;
  }
}

export default function Garage({
  selected,
  onSelect,
  onStart,
  onBack,
  assists,
  onAssistsChange,
  muted,
  onMutedChange,
}: Props) {
  const [bests, setBests] = useState<Record<string, number | null>>({});
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<GarageScene | null>(null);
  const dragging = useRef<number | null>(null);

  // Herr Müller works the floor: he cycles through what he has to say about the
  // car on the turntable, then sees the driver off.
  const [lineIndex, setLineIndex] = useState(0);
  const [farewell, setFarewell] = useState<MuellerLine | null>(null);
  /** The deposit swipe, shown over the garage on the way out. */
  const [swiping, setSwiping] = useState(false);
  /** Dale works the floor too, so he cycles his lines the way Müller does. */
  const [daleIndex, setDaleIndex] = useState(() => Math.floor(Math.random() * DALE_GARAGE.length));
  const daleLine = DALE_GARAGE[daleIndex % DALE_GARAGE.length];
  const leaveTimer = useRef<number | null>(null);

  /** Which of the two pages is showing: 0 the fleet, 1 the track guide. */
  const [page, setPage] = useState(0);
  const pagesRef = useRef<HTMLDivElement>(null);

  /**
   * The pager is a native horizontal scroller with snap points rather than a
   * hand-rolled gesture: that way a phone swipe, a trackpad flick and a
   * shift-wheel all reach the guide, and none of it has to be reimplemented.
   * The buttons below drive the same scroller so the two can never disagree.
   *
   * The slide is animated by the compositor, which means a page that is not
   * painting frames — a background tab, a hidden preview pane — drops the
   * request on the floor and leaves the pager looking stuck. If it has not
   * moved shortly after, jump it there instead.
   */
  const goTo = useCallback((next: number) => {
    const el = pagesRef.current;
    if (!el) return;
    const left = next * el.clientWidth;
    // Mark it straight away rather than waiting for the scroll to settle, so
    // the tab you pressed lights up on the press.
    setPage(next);
    el.scrollTo({ left, behavior: 'smooth' });
    window.setTimeout(() => {
      if (el.isConnected && Math.abs(el.scrollLeft - left) > 4) el.scrollLeft = left;
    }, 320);
  }, []);

  const lines = garageLines(selected.id);
  const spoken = farewell ?? lines[lineIndex % lines.length];

  useEffect(() => {
    const map: Record<string, number | null> = {};
    for (const car of FLEET) map[car.id] = readBest(car.id);
    setBests(map);
  }, []);

  // A new car gets his opening line, not whatever point he had reached on the last one.
  useEffect(() => {
    setLineIndex(0);
  }, [selected.id]);

  useEffect(() => {
    // Once he is saying goodbye he stays on that line until the car pulls away.
    if (farewell || lines.length < 2) return;
    const timer = window.setInterval(() => setLineIndex((i) => i + 1), LINE_DWELL_MS);
    return () => window.clearInterval(timer);
  }, [farewell, lines.length, selected.id]);

  useEffect(() => {
    return () => {
      if (leaveTimer.current !== null) window.clearTimeout(leaveTimer.current);
    };
  }, []);

  // Offset from Herr Müller's rhythm so the two are never mid-sentence at the
  // same moment — the floor would read as two people talking over each other.
  useEffect(() => {
    if (farewell) return;
    const timer = window.setInterval(() => setDaleIndex((i) => i + 1), DALE_DWELL_MS);
    return () => window.clearInterval(timer);
  }, [farewell]);

  const headOut = useCallback(() => {
    // Guard the double tap: the send-off must not restart, and the drive must
    // not be queued twice.
    if (leaveTimer.current !== null || swiping) return;
    // Nobody leaves this yard before the deposit is on the card.
    setSwiping(true);
  }, [swiping]);

  /** Deposit authorised — now he says his piece and the car rolls out. */
  const depositTaken = useCallback(() => {
    setSwiping(false);
    if (leaveTimer.current !== null) return;
    const line = farewellLine(selected.id);
    setFarewell(line);
    leaveTimer.current = window.setTimeout(() => {
      leaveTimer.current = null;
      onStart(line);
    }, FAREWELL_MS);
  }, [onStart, selected.id]);

  // The showroom renders the selected car on its turntable.
  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const scene = new GarageScene(canvas, selected);
    sceneRef.current = scene;
    scene.start();

    const resize = () => scene.resize(canvas.clientWidth, canvas.clientHeight);
    resize();
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      scene.dispose();
      sceneRef.current = null;
    };
    // Rebuilding the whole room per car would be wasteful; setCar handles swaps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    sceneRef.current?.setCar(selected);
  }, [selected]);

  return (
    <div className="screen garage">
      {/* Deposit first. He is very clear about this. */}
      {swiping && (
        <div className="overlay">
          <div className="dialog swipe-dialog">
            <h2>Card, please</h2>
            <p>
              Two and a half thousand on hold against the {selected.brand} {selected.model}. Herr
              Müller does this bit himself, and he does it slowly, while looking at you.
            </p>
            <CardReader mode="auth" onDone={depositTaken} />
          </div>
        </div>
      )}

      <header className="garage__head">
        <button className="brand brand--button" onClick={onBack} aria-label="Back to the main menu">
          <Logo width={190} />
          <span className="brand__tag">Garage · Burgstrasse 1, Nurburg</span>
        </button>

        <div className="circuit-badge">
          <div>
            <div className="circuit-badge__label">Home Circuit</div>
            <div className="circuit-badge__name">Nordschleife</div>
            <div className="circuit-badge__stats">
              {(trackData.lapLength / 1000).toFixed(3)} km · {trackData.sections.length} sections · 297 m elevation
              <br />
              {(approachData.length / 1000).toFixed(2)} km road up from Burgstrasse 1
            </div>
          </div>
        </div>
      </header>

      {/* Two pages, side by side: the fleet, and the circuit you are about to
          drive. Scroll or swipe right for the guide, again to come back. */}
      <div className="garage__pager" role="tablist" aria-label="Garage pages">
        <button
          className={`garage__tab ${page === 0 ? 'garage__tab--on' : ''}`}
          role="tab"
          aria-selected={page === 0}
          onClick={() => goTo(0)}
        >
          The fleet
        </button>
        <button
          className={`garage__tab ${page === 1 ? 'garage__tab--on' : ''}`}
          role="tab"
          aria-selected={page === 1}
          onClick={() => goTo(1)}
        >
          Track guide
        </button>
        <span className="garage__pager-hint">
          {page === 0 ? 'Swipe right for the Nordschleife →' : '← Swipe back for the fleet'}
        </span>
      </div>

      <div
        className="garage__pages"
        ref={pagesRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          const next = el.clientWidth > 0 ? Math.round(el.scrollLeft / el.clientWidth) : 0;
          setPage((p) => (p === next ? p : next));
        }}
      >
        <div className="garage__page">
          <div className="garage__layout">
            {/* ------------------------------------------------- 3D showroom */}
            <div className="showroom">
              <canvas
                ref={canvasRef}
                className="showroom__canvas"
                onPointerDown={(e) => {
                  dragging.current = e.clientX;
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                  if (dragging.current === null) return;
                  sceneRef.current?.nudge(e.clientX - dragging.current);
                  dragging.current = e.clientX;
                }}
                onPointerUp={() => {
                  dragging.current = null;
                  sceneRef.current?.releaseDrag();
                }}
                onPointerCancel={() => {
                  dragging.current = null;
                  sceneRef.current?.releaseDrag();
                }}
              />
              {/* Name plate sits top-left so it never covers the car itself. */}
              <div className="showroom__nameplate">
                <div className="showroom__brand">{selected.brand}</div>
                <div className="showroom__model">{selected.model}</div>
              </div>

              <div className="showroom__plate">
                <div className="showroom__blurb">{selected.blurb}</div>
                <div className="showroom__specs">
                  <div>
                    <b>{selected.ps}</b>
                    <span>PS</span>
                  </div>
                  <div>
                    <b>{selected.massKg}</b>
                    <span>kg</span>
                  </div>
                  <div>
                    <b>{selected.drivetrain}</b>
                    <span>Drive</span>
                  </div>
                  <div>
                    <b>{selected.zeroToHundred.toFixed(1)} s</b>
                    <span>0–100</span>
                  </div>
                  <div>
                    <b>{selected.topSpeedKmh}</b>
                    <span>km/h</span>
                  </div>
                  <div>
                    <b>{formatLap(selected.targetLapSec)}</b>
                    <span>Target lap</span>
                  </div>
                </div>
              </div>
              <div className="showroom__hint">Drag to rotate</div>

              {/* Dale is on the floor too — he is riding with you, so he
                  introduces himself before you pick anything. */}
              <div className="showroom__dale">
                <Dale className="showroom__dale-fig" talking />
                <div className="showroom__dale-speech">
                  <span className="showroom__dale-who">Dale · Instructor</span>
                  <span key={daleLine} className="showroom__dale-text">
                    {daleLine}
                  </span>
                </div>
              </div>

              {/* Herr Müller mans the showroom floor and talks you through the car. */}
              <div className={`showroom__mueller ${farewell ? 'showroom__mueller--leaving' : ''}`}>
                <div className="showroom__mueller-speech" aria-live="polite">
                  <span className="showroom__mueller-who">Herr Müller</span>
                  {/* Keyed on the text so a new line re-runs the entry animation. */}
                  <span key={spoken.text} className="showroom__mueller-text">
                    {spoken.text}
                  </span>
                </div>
                <Gorilla
                  mood={spoken.mood}
                  gesture={spoken.gesture ?? 'none'}
                  talking
                  className="showroom__mueller-fig"
                />
                {/* His barbet, sitting at heel. Bottom-aligned with him by the
                    flex row, so they share a floor line. */}
                <div className="showroom__dog-wrap">
                  <span className="showroom__dog-bark" aria-hidden="true">
                    Wuff! Wuff!
                  </span>
                  <Barbet className="showroom__dog" />
                </div>
              </div>
            </div>

            {/* ------------------------------------------------------ sidebar */}
            <div className="garage__side">
              <div className="section-title">The fleet</div>
              <div className="fleet-list">
                {FLEET.map((car) => {
                  const best = bests[car.id];
                  return (
                    <button
                      key={car.id}
                      className={`fleet-row ${car.id === selected.id ? 'fleet-row--active' : ''}`}
                      onClick={() => onSelect(car)}
                      aria-pressed={car.id === selected.id}
                    >
                      <span
                        className="fleet-row__chip"
                        style={{ background: `#${car.color.toString(16).padStart(6, '0')}` }}
                      />
                      <span className="fleet-row__name">
                        <b>{car.model}</b>
                        <em>{car.brand}</em>
                      </span>
                      <span className="fleet-row__ps">{car.ps} PS</span>
                      {best != null && <span className="fleet-row__best">{formatLap(best)}</span>}
                    </button>
                  );
                })}
              </div>

              <div className="section-title">Setup</div>
              <div className="setup">
                <button
                  className={`toggle ${assists ? 'toggle--on' : ''}`}
                  onClick={() => onAssistsChange(!assists)}
                  aria-pressed={assists}
                >
                  <span className="toggle__dot" />
                  Driver aids (TC + ESC)
                </button>
                <button
                  className={`toggle ${!muted ? 'toggle--on' : ''}`}
                  onClick={() => onMutedChange(!muted)}
                  aria-pressed={!muted}
                >
                  <span className="toggle__dot" />
                  Engine sound
                </button>
              </div>

              <button
                className="btn-primary btn-primary--block"
                onClick={headOut}
                disabled={farewell !== null || swiping}
              >
                {swiping ? 'Taking the deposit…' : farewell ? 'Rolling out…' : 'Head out'}
              </button>
            </div>
          </div>
        </div>

        <div className="garage__page">
          <TrackGuide onBack={() => goTo(0)} />
        </div>
      </div>
    </div>
  );
}
