import Logo from './Logo';
import Gorilla from './Gorilla';
import trackData from '../data/nordschleife.json';
import approachData from '../data/approach.json';

interface Props {
  onGarage(): void;
  onQuickStart(): void;
  carLabel: string;
}

// Derived once from the survey data itself, so the copy can never drift from
// the tiles below it (which already read the same source).
const LAP_KM = (trackData.lapLength / 1000).toFixed(1);
const SECTION_COUNT = trackData.sections.length;
const ELEVATION_M = Math.round(
  Math.max(...trackData.points.map((p) => p.y)) - Math.min(...trackData.points.map((p) => p.y)),
);

export default function Menu({ onGarage, onQuickStart, carLabel }: Props) {
  return (
    <div className="screen menu">
      <div className="menu__glow" aria-hidden="true" />

      <div className="menu__inner">
        <Logo width={340} className="menu__logo" />
        <div className="menu__tagline">Racing Tools · Home Circuit Nordschleife</div>

        <p className="menu__lead">
          From Burgstrasse 1 in Nurburg up into the Green Hell. The circuit is rebuilt metre by metre from real
          survey data — {LAP_KM} km, {SECTION_COUNT} named sections, {ELEVATION_M} metres of elevation, the
          Karussell, and the Nurburg castle looking down on the lot of it.
        </p>

        <div className="menu__actions">
          <button className="btn-primary btn-primary--big" onClick={onGarage}>
            Garage
          </button>
          <button className="btn-ghost btn-ghost--big" onClick={onQuickStart}>
            Drive now · {carLabel}
          </button>
        </div>

        <div className="menu__facts">
          <div className="fact">
            <b>{(trackData.lapLength / 1000).toFixed(3)}</b>
            <span>km lap length</span>
          </div>
          <div className="fact">
            <b>{trackData.sections.length}</b>
            <span>named sections</span>
          </div>
          <div className="fact">
            <b>{ELEVATION_M}</b>
            <span>m elevation</span>
          </div>
          <div className="fact">
            <b>{(approachData.length / 1000).toFixed(2)}</b>
            <span>km road there</span>
          </div>
        </div>

        <div className="menu__mueller">
          <Gorilla mood="cheer" className="menu__mueller-fig" />
          <div className="speech speech--menu">
            <strong>Herr Müller</strong>
            Welcome to Rent4Ring! I&rsquo;ll be waiting at the finish with a trophy. Get round quickly enough and
            there&rsquo;s up to 10% off your next booking in it for you.
          </div>
        </div>
      </div>

      <div className="menu__legal">
        Circuit geometry derived from {trackData.source}. Road approach routed from the OSM street network.
        Unofficial fan project, not affiliated with Nürburgring 1927 GmbH &amp; Co. KG.
      </div>
    </div>
  );
}
