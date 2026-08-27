import { useEffect, useState } from 'react';
import type { Car } from '../data/fleet';
import Gorilla from './Gorilla';
import Barbet from './Barbet';
import Customer from './Customer';

interface Props {
  car: Car;
  onDone(): void;
}

/**
 * What happens in the yard after the truck gets back.
 *
 * The wreck comes off the deck at his feet, he goes off like a firework, the
 * customer is carried out and punted clean over the village towards the
 * Nürburg, and the dog — who has been waiting for this all morning — gets a
 * treat on the way back inside.
 *
 * Staged in 2D rather than in the circuit scene: the yard is a kilometre and
 * a half from where the car actually stopped, and none of this needs to be
 * driveable. It only needs to be watched.
 */
/**
 * No captions. They described what you were already watching — the truck
 * tipping, him going off, the customer leaving over the roofs — and reading a
 * sentence about a thing is a poorer way of learning it than seeing it.
 */
type Beat = {
  /** Milliseconds from the start of the scene. */
  at: number;
  /** Drives the CSS stage class, one per movement. */
  stage: string;
};

const BEATS: Beat[] = [
  { at: 0, stage: 'arrive' },
  { at: 2000, stage: 'unload' },
  { at: 4200, stage: 'rage' },
  { at: 7000, stage: 'carry' },
  { at: 9200, stage: 'wind' },
  { at: 10600, stage: 'kick' },
  { at: 13200, stage: 'treat' },
  { at: 15400, stage: 'inside' },
];

const TOTAL_MS = 17600;

export default function BanScene({ car, onDone }: Props) {
  const [beat, setBeat] = useState(0);

  // Driven off one clock rather than a fan of setTimeouts. Nine independent
  // timers were landing early — and a timer that fires late (a busy frame, a
  // backgrounded tab) would desync the captions from the movement, whereas
  // elapsed time cannot.
  useEffect(() => {
    const started = performance.now();
    let raf = 0;
    const tick = () => {
      const elapsed = performance.now() - started;
      let i = 0;
      while (i + 1 < BEATS.length && BEATS[i + 1].at <= elapsed) i++;
      setBeat(i);
      if (elapsed >= TOTAL_MS) {
        onDone();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // One run per mount; re-arming would restart the scene mid-flight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = BEATS[beat];

  return (
    <div className={`banscene banscene--${current.stage}`}>
      <div className="banscene__sky" aria-hidden="true">
        {/* The Nürburg on its rock, which is where you are going. */}
        <div className="banscene__castle">
          <span className="banscene__keep" />
          <span className="banscene__rock" />
        </div>
        <div className="banscene__roofs" />
      </div>

      <div className="banscene__yard" aria-hidden="true" />

      {/* The shed they walk back into at the end. */}
      <div className="banscene__shed" aria-hidden="true">
        <span className="banscene__door" />
      </div>

      {/* The recovery truck, reversing in with the wreck on the deck. */}
      <div className="banscene__truck">
        <div className="banscene__deck" />
        <div className="banscene__cab" />
        <div className="banscene__beacon" />
      </div>

      {/* The wreck, once it is off the deck. */}
      <div className="banscene__wreck" title={`${car.brand} ${car.model}`} />

      {/* Him, the customer, and the dog. */}
      <div className="banscene__mueller">
        <Gorilla mood="angry" gesture={current.stage === 'treat' ? 'thumb' : 'point'} />
      </div>
      {/* The customer himself. Boxes could not carry it — you could not tell
          what was being punted, which is the one thing the shot has to sell. */}
      <div className="banscene__customer">
        <Customer />
      </div>
      {/* Sells the punt: a streak where he went. */}
      <div className="banscene__swoosh" aria-hidden="true" />
      <div className="banscene__dog">
        <Barbet />
      </div>
      <div className="banscene__treat" aria-hidden="true" />

      <button className="banscene__skip" onClick={onDone}>
        Skip
      </button>
    </div>
  );
}
