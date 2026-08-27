import { useState } from 'react';
import Logo from './Logo';
import Gorilla from './Gorilla';
import Barbet from './Barbet';
import trackData from '../data/nordschleife.json';
import approachData from '../data/approach.json';

interface Props {
  onGarage(): void;
  onQuickStart(): void;
  carLabel: string;
}

/**
 * He greets you before the sales pitch does. Cheeky, because he is the one
 * handing over keys to a car worth more than his van.
 */
const GREETINGS = [
  'Ah, a customer. Pick something with far too much power, frighten yourself through the Fuchsröhre, and bring it back in one piece. That last part is not negotiable.',
  'You look like a quick one. They all do, standing here. The Nordschleife has opinions about that and it shares them at Wehrseifen.',
  'Welcome. The excess is two and a half thousand, the coffee is free, and the Armco has never once lost an argument. Choose accordingly.',
  'Come in, come in. I have a yard full of cars, one circuit and a great deal of paperwork if you get this wrong. Shall we?',
  'Morning. Rain came through an hour ago, so Pflanzgarten is still thinking about it. Just so we understand each other later.',
  'Every one of these keys has been handed to someone who said they would take it easy. I keep the receipts.',
  'Twenty point eight kilometres, seventy-three corners, and precisely one of them will be the one you remember. Pick a car and let us find out which.',
  'The dog stays here. He has seen what happens at Bergwerk and he wants no part of it.',
  'Sign here, and here, and — yes — here. Wonderful. Now try not to make me read the rest of that form out loud.',
  'You are welcome to use all of the road. The bit past the white line is not road. That is the part people forget.',
  'A word before you go: the Karussell is concrete, not carpet. It will not meet you halfway.',
  'Right then. Warm it up down the Burgstrasse, take the first lap gently, and I shall pretend to believe you.',
];

// Derived once from the survey data itself, so the copy can never drift from
// the tiles below it (which already read the same source).
const LAP_KM = (trackData.lapLength / 1000).toFixed(1);
const SECTION_COUNT = trackData.sections.length;
const ELEVATION_M = Math.round(
  Math.max(...trackData.points.map((p) => p.y)) - Math.min(...trackData.points.map((p) => p.y)),
);

export default function Menu({ onGarage, onQuickStart, carLabel }: Props) {
  // Picked once per visit, not per render, or he would change his mind
  // every time React re-draws the screen.
  const [greeting] = useState(() => GREETINGS[Math.floor(Math.random() * GREETINGS.length)]);

  return (
    <div className="screen menu">
      <div className="menu__glow" aria-hidden="true" />

      <div className="menu__inner">
        <Logo width={340} className="menu__logo" />
        <div className="menu__tagline">Racing Tools · Home Circuit Nordschleife</div>

        {/* He does the welcoming, right at the top. The survey-data detail
            that used to sit here has moved to the footer — it is reference
            material, not a greeting. */}
        <div className="menu__mueller">
          {/* Man and dog share their own row. The block around them turns into
              a column on a narrow screen so the speech bubble can sit under
              them — without this pair the dog went with it and ended up
              standing below him instead of beside him. */}
          <div className="menu__pair">
            <Gorilla mood="cheer" className="menu__mueller-fig" />
            <Barbet className="menu__dog" />
          </div>
          <div className="speech speech--menu">
            <strong>Herr Müller</strong>
            {greeting}
          </div>
        </div>

        <p className="menu__lead">From Burgstrasse 1 in Nurburg up into the Green Hell.</p>

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

      </div>

      <div className="menu__footer">
        <p className="menu__about">
          The circuit is rebuilt metre by metre from real survey data — {LAP_KM} km, {SECTION_COUNT} named
          sections, {ELEVATION_M} metres of elevation, the Karussell, and the Nurburg castle looking down on
          the lot of it. Get round quickly enough and there is up to 10% off your next booking in it.
        </p>
        <p className="menu__legal">
          Circuit geometry derived from {trackData.source}. Road approach routed from the OSM street network.
          Unofficial fan project, not affiliated with Nürburgring 1927 GmbH &amp; Co. KG.
        </p>
      </div>
    </div>
  );
}
