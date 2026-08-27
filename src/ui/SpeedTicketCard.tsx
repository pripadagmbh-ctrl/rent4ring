import type { SpeedTicket } from '../game/Game';
import Gorilla from './Gorilla';

interface Props {
  ticket: SpeedTicket;
  onClose(): void;
}

const EUR = (n: number) =>
  n.toLocaleString('en-GB', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

/**
 * The notice from the village camera, held up by Herr Müller — who receives
 * these at his own address, since the car is registered to him.
 *
 * The numbers are the real German table for a car inside a built-up area:
 * the statutory tolerance comes off the measured speed first, and the fine,
 * points and any driving ban follow from what is left.
 */
export default function SpeedTicketCard({ ticket, onClose }: Props) {
  return (
    <div className="overlay">
      <div className="ticket">
        <div className="ticket__head">
          <span className="ticket__authority">Kreis Ahrweiler · Bußgeldstelle</span>
          <span className="ticket__kind">Anhörung im Ordnungswidrigkeitenverfahren</span>
        </div>

        <div className="ticket__flash" aria-hidden="true">
          <span className="ticket__frame" />
        </div>

        <div className="ticket__rows">
          <div>
            <span>Zulässig</span>
            <b>{ticket.limitKmh} km/h</b>
          </div>
          <div>
            <span>Gemessen</span>
            <b>{ticket.measuredKmh} km/h</b>
          </div>
          <div>
            <span>Nach Toleranz</span>
            <b>{ticket.chargedKmh} km/h</b>
          </div>
          <div className="is-bad">
            <span>Überschreitung</span>
            <b>+{ticket.overBy} km/h</b>
          </div>
        </div>

        <div className="ticket__penalty">
          <div>
            <b>{EUR(ticket.fineEuro)}</b>
            <span>Geldbuße</span>
          </div>
          <div>
            <b>{ticket.points}</b>
            <span>{ticket.points === 1 ? 'Punkt' : 'Punkte'}</span>
          </div>
          <div>
            <b>{ticket.banMonths > 0 ? `${ticket.banMonths} Mon.` : '—'}</b>
            <span>Fahrverbot</span>
          </div>
        </div>

        <div className="ticket__mueller">
          <Gorilla mood="angry" gesture="point" className="ticket__fig" />
          <div className="ticket__speech">
            <strong>Herr Müller</strong>
            The car is registered to me, so this comes to my door with my name on
            it — and it goes on the Amex with everything else. Fifty means fifty.
            The circuit is the bit where you may use all of it.
          </div>
        </div>

        <div className="dialog__actions">
          <button className="btn-primary" onClick={onClose}>
            Understood · carry on
          </button>
        </div>
      </div>
    </div>
  );
}
