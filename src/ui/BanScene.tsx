import { useEffect, useState } from 'react';
import type { Car } from '../data/fleet';
import Gorilla from './Gorilla';
import Barbet from './Barbet';

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
type Beat = {
  /** Milliseconds from the start of the scene. */
  at: number;
  caption: string;
  /** Drives the CSS stage class, one per movement. */
  stage: string;
};

const BEATS: Beat[] = [
  { at: 0, stage: 'arrive', caption: 'The truck backs into the yard.' },
  { at: 2000, stage: 'unload', caption: 'It tips the deck and puts what is left of it at his feet.' },
  { at: 4200, stage: 'rage', caption: '"THAT WAS A CAR. THIS MORNING. IT WAS A CAR."' },
  { at: 7000, stage: 'carry', caption: 'He picks the customer up. One hand. Barely looks.' },
  { at: 9200, stage: 'wind', caption: 'The dog sits up. The dog knows this part.' },
  { at: 10600, stage: 'kick', caption: 'And away you go, over the roofs, towards the castle.' },
  { at: 13200, stage: 'treat', caption: '"Good boy. You saw nothing."' },
  { at: 15400, stage: 'inside', caption: 'They go back in. There is paperwork.' },
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
      <div className="banscene__customer" />
      <div className="banscene__dog">
        <Barbet />
      </div>
      <div className="banscene__treat" aria-hidden="true" />

      <p className="banscene__caption" aria-live="polite">
        {current.caption}
      </p>

      <button className="banscene__skip" onClick={onDone}>
        Skip
      </button>
    </div>
  );
}
