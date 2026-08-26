import { useEffect, useRef, useState } from 'react';
import { FLEET, type Car } from '../data/fleet';
import { GarageScene } from '../game/GarageScene';
import { formatLap } from './format';
import Logo from './Logo';
import Gorilla from './Gorilla';
import trackData from '../data/nordschleife.json';
import approachData from '../data/approach.json';

interface Props {
  selected: Car;
  onSelect(car: Car): void;
  onStart(): void;
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

  useEffect(() => {
    const map: Record<string, number | null> = {};
    for (const car of FLEET) map[car.id] = readBest(car.id);
    setBests(map);
  }, []);

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

          {/* Herr Müller mans the showroom floor. */}
          <div className="showroom__mueller">
            <div className="showroom__mueller-speech">
              Kiss the Armco out there and you can leave the Amex behind on your way out&nbsp;😉 Beat the
              target and I&rsquo;ll knock ten percent off.
            </div>
            <Gorilla mood="happy" className="showroom__mueller-fig" />
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

          <button className="btn-primary btn-primary--block" onClick={onStart}>
            Head out
          </button>
        </div>
      </div>
    </div>
  );
}
