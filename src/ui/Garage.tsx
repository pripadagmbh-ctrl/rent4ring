import { useCallback, useEffect, useRef, useState } from 'react';
import { FLEET, type Car } from '../data/fleet';
import { GarageScene } from '../game/GarageScene';
import { farewellLine, garageLines, type MuellerLine } from '../data/muellerLines';
import { formatLap } from './format';
import Logo from './Logo';
import Gorilla from './Gorilla';
import Barbet from './Barbet';
import trackData from '../data/nordschleife.json';
import approachData from '../data/approach.json';

/** How long one of his garage lines stays up before the next one. */
const LINE_DWELL_MS = 6200;
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
  const leaveTimer = useRef<number | null>(null);

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

  const headOut = useCallback(() => {
    // Guard the double tap: the send-off must not restart, and the drive must
    // not be queued twice.
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
            disabled={farewell !== null}
          >
            {farewell ? 'Rolling out…' : 'Head out'}
          </button>
        </div>
      </div>
    </div>
  );
}
