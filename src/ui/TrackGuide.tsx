import { useMemo, useState } from 'react';
import trackData from '../data/nordschleife.json';
import { TRACK_FACTS, TRACK_NOTES } from '../data/trackNotes';
import Dale from './Dale';

interface Props {
  /** Called by the "back to the fleet" control at the top of the page. */
  onBack(): void;
}

const PLAN_W = 620;
const PROFILE_W = 620;
const PROFILE_H = 96;
/** Every nth point of the 3461 in the lap. 3 still draws every corner. */
const PLAN_STRIDE = 3;

const POINTS = trackData.points as { x: number; y: number; z: number }[];

interface Section {
  name: string;
  /** Index into the track points. */
  index: number;
  /** Metres from the start line. */
  metres: number;
  /** Metres above the track datum. */
  elevation: number;
  /** Where the section sits on the map, in viewBox units. */
  mark: { x: number; y: number };
}

/**
 * The Nordschleife, laid out flat: the plan drawn from the same points the car
 * drives on, the climb drawn from the same heights, and a note per corner.
 *
 * Everything here is derived from `nordschleife.json` at render time rather
 * than traced by hand, so the map cannot quietly disagree with the circuit.
 */
export default function TrackGuide({ onBack }: Props) {
  const [selected, setSelected] = useState(0);

  const { plan, planH, profile, sections, climb, project } = useMemo(() => {
    const n = POINTS.length;

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of POINTS) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    // One scale for both axes, or the long tail down the Döttinger Höhe gets
    // squashed into something that is not the shape of the place. The box then
    // takes the lap's own proportions rather than being forced square, which
    // would leave a third of the panel as empty margin above and below it.
    const pad = 18;
    const scale = (PLAN_W - pad * 2) / (maxX - minX);
    const height = (maxZ - minZ) * scale + pad * 2;
    const offX = pad - minX * scale;
    const offY = pad - minZ * scale;
    const proj = (p: { x: number; z: number }) => ({
      x: offX + p.x * scale,
      y: offY + p.z * scale,
    });

    let d = '';
    for (let i = 0; i < n; i += PLAN_STRIDE) {
      const q = proj(POINTS[i]);
      d += `${i === 0 ? 'M' : 'L'}${q.x.toFixed(1)} ${q.y.toFixed(1)}`;
    }
    d += 'Z';

    // Height against distance. The lap climbs and falls ~300 m; drawn to the
    // full box that reads like the profile on the trackside boards rather than
    // like a flat line.
    const span = Math.max(1, maxY - minY);
    let prof = '';
    for (let i = 0; i < n; i += PLAN_STRIDE) {
      const x = (i / (n - 1)) * PROFILE_W;
      const y = PROFILE_H - 4 - ((POINTS[i].y - minY) / span) * (PROFILE_H - 8);
      prof += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    }

    const secs: Section[] = trackData.sections.map((s) => {
      const index = Math.min(n - 1, Math.round(s.t * (n - 1)));
      return {
        name: s.name,
        index,
        metres: s.t * trackData.lapLength,
        elevation: POINTS[index].y,
        mark: proj(POINTS[index]),
      };
    });

    return {
      plan: d,
      planH: Math.round(height),
      profile: prof,
      sections: secs,
      climb: { min: minY, max: maxY },
      project: proj,
    };
  }, []);

  const active = sections[selected] ?? sections[0];

  // The stretch from the selected section to the next one, redrawn on top of
  // the plan so you can see where the corner you are reading about actually is.
  const run = useMemo(() => {
    const to = sections[selected + 1]?.index ?? POINTS.length - 1;
    let out = '';
    for (let i = active.index; i <= to; i++) {
      const q = project(POINTS[i]);
      out += `${i === active.index ? 'M' : 'L'}${q.x.toFixed(1)} ${q.y.toFixed(1)}`;
    }
    return out;
  }, [active.index, project, sections, selected]);

  const markX = (active.index / (POINTS.length - 1)) * PROFILE_W;

  return (
    <section className="guide" aria-label="Nordschleife track guide">
      <header className="guide__head">
        <button className="guide__back" onClick={onBack}>
          ← The fleet
        </button>
        <div className="guide__titles">
          <div className="guide__eyebrow">Home Circuit · track guide</div>
          <h2 className="guide__title">Nordschleife</h2>
        </div>
        <div className="guide__stats">
          <div>
            <b>{(trackData.lapLength / 1000).toFixed(3)}</b>
            <span>km</span>
          </div>
          <div>
            <b>{trackData.sections.length}</b>
            <span>sections</span>
          </div>
          <div>
            <b>{Math.round(climb.max - climb.min)}</b>
            <span>m climb</span>
          </div>
        </div>
      </header>

      <div className="guide__body">
        {/* ------------------------------------------------------- the map */}
        <div className="guide__mapwrap">
          <svg
            className="guide__map"
            viewBox={`0 0 ${PLAN_W} ${planH}`}
            role="img"
            aria-label="Plan of the Nordschleife"
          >
            <path className="guide__ribbon" d={plan} />
            <path className="guide__centre" d={plan} />
            <path className="guide__run" d={run} />

            {sections.map((s, i) => (
              <circle
                key={s.name + s.index}
                className={`guide__dot ${i === selected ? 'is-active' : ''}`}
                cx={s.mark.x}
                cy={s.mark.y}
                r={i === selected ? 8 : 4.2}
                onClick={() => setSelected(i)}
              >
                <title>{s.name}</title>
              </circle>
            ))}

            {/* Start line, where every lap in this game is timed from. */}
            <circle className="guide__start" cx={sections[0].mark.x} cy={sections[0].mark.y} r={6.5} />
          </svg>

          <svg
            className="guide__profile"
            viewBox={`0 0 ${PROFILE_W} ${PROFILE_H}`}
            preserveAspectRatio="none"
            role="img"
            aria-label="Elevation profile of the lap"
          >
            <path className="guide__profile-line" d={profile} />
            <line className="guide__profile-mark" x1={markX} x2={markX} y1={0} y2={PROFILE_H} />
          </svg>
          <div className="guide__profile-legend">
            <span>Start</span>
            <span>{Math.round(climb.max - climb.min)} m from the lowest point to the highest</span>
            <span>Finish</span>
          </div>
        </div>

        {/* --------------------------------------------------- the sections */}
        <div className="guide__panel">
          <div className="guide__note">
            <Dale className="guide__note-fig" />
            <div className="guide__note-body">
              <div className="guide__note-head">
                <b>{active.name}</b>
                <span>
                  km {(active.metres / 1000).toFixed(1)} · {Math.round(active.elevation)} m
                </span>
              </div>
              <p key={active.name}>{TRACK_NOTES[active.name] ?? 'Drive it and find out.'}</p>
            </div>
          </div>

          <div className="section-title">Every section, in order</div>
          <ol className="guide__list">
            {sections.map((s, i) => (
              <li key={s.name + s.index}>
                <button
                  className={`guide__row ${i === selected ? 'guide__row--active' : ''}`}
                  onClick={() => setSelected(i)}
                  aria-pressed={i === selected}
                >
                  <span className="guide__row-no">{String(i + 1).padStart(2, '0')}</span>
                  <span className="guide__row-name">{s.name}</span>
                  <span className="guide__row-km">{(s.metres / 1000).toFixed(1)} km</span>
                </button>
              </li>
            ))}
          </ol>

          <div className="section-title">Worth knowing</div>
          <div className="guide__facts">
            {TRACK_FACTS.map((f) => (
              <div key={f.label} className="guide__fact">
                <span className="guide__fact-label">{f.label}</span>
                <b>{f.value}</b>
                <span className="guide__fact-note">{f.note}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
