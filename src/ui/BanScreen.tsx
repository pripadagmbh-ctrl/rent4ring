import { useState } from 'react';
import type { Car } from '../data/fleet';
import type { Retirement } from '../game/Game';
import Gorilla from './Gorilla';
import Barbet from './Barbet';
import CardReader from './CardReader';
import BanScene from './BanScene';

interface Props {
  car: Car;
  result: Retirement;
  onGarage(): void;
}

/**
 * The end of the hire. Herr Müller has taken the car back, and you are
 * banned for life — which, this being his yard and his sense of humour,
 * lasts exactly until you press the button.
 */
export default function BanScreen({ car, result, onGarage }: Props) {
  // The yard scene plays first; the paperwork comes after.
  const [scenePlayed, setScenePlayed] = useState(false);
  const euros = result.damageCost.toLocaleString('en-GB', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  });

  if (!scenePlayed) {
    return (
      <div className="overlay ban">
        <BanScene car={car} onDone={() => setScenePlayed(true)} />
      </div>
    );
  }

  return (
    <div className="overlay ban">
      <div className="ban__card">
        <div className="ban__flag" aria-hidden="true" />
        <div className="ban__kicker">Black flag</div>
        <h2 className="ban__title">Banned for life</h2>

        <p className="ban__body">
          The {car.brand} {car.model} came home on the back of the truck. Herr Müller has torn up
          your paperwork, photographed you for the wall behind the counter, and asked the dog to
          remember your face.
        </p>

        <div className="ban__figures">
          <div>
            <b>{euros}</b>
            <span>Repair bill</span>
          </div>
          <div>
            <b>{result.contacts}</b>
            <span>Contacts</span>
          </div>
          <div>
            <b>
              {result.banCount}
              {result.banCount > 1 ? '×' : ''}
            </b>
            <span>{result.banCount > 1 ? 'Banned before' : 'First ban'}</span>
          </div>
        </div>

        {/* The deposit does not come back. Neither does the card. */}
        <CardReader mode="kept" />

        <div className="ban__pair">
          <Gorilla mood="angry" gesture="point" className="ban__fig" />
          <Barbet className="ban__dog" />
          <div className="ban__speech">
            <strong>Herr Müller</strong>
            {result.banCount > 1
              ? `That is ban number ${result.banCount}. I am running out of wall — and I am keeping this one too. Go on then: one more, and bring it back with the corners still on it.`
              : 'The Amex stays with me. Consider it a deposit on your character. Banned for life, by the way. …Right, that is out of my system. Same time tomorrow?'}
          </div>
        </div>

        <div className="dialog__actions">
          <button className="btn-primary" onClick={onGarage}>
            Back to the garage
          </button>
        </div>
      </div>
    </div>
  );
}
