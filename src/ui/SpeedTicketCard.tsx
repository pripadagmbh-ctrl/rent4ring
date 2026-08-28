import type { SpeedTicket } from '../game/Game';
import Gorilla from './Gorilla';
import Customer from './Customer';

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
          <span className="ticket__kind">
            {ticket.self ? 'Anhörung · Betroffener: der Halter' : 'Anhörung im Ordnungswidrigkeitenverfahren'}
          </span>
        </div>

        {/* The photograph. A German notice always encloses one, and it is
            always the same picture: washed out by the flash, the plate
            readable and the driver just about. Drawn rather than rendered —
            the game's camera is behind the car, and the one view a speed
            camera never has is the one from behind. */}
        <figure className="ticket__photo">
          <div className="ticket__photo-frame">
            <div className="ticket__photo-scene">
              <span className="ticket__photo-road" />
              <span className="ticket__photo-car">
                {/* The camera photographs whoever was actually riding. */}
                {ticket.self ? (
                  <Gorilla mood="scared" className="ticket__photo-face" />
                ) : (
                  <Customer className="ticket__photo-face" />
                )}
                <span className="ticket__photo-plate">NÜR · MR 1</span>
              </span>
              <span className="ticket__photo-glare" />
            </div>
            <div className="ticket__photo-stamp">
              <span>{ticket.measuredKmh} km/h</span>
              <span>zul. {ticket.limitKmh}</span>
            </div>
          </div>
          <figcaption>
            Messfoto · Burgstraße, Nürburg · {ticket.vehicle}
          </figcaption>
        </figure>

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
          <Gorilla
            mood={ticket.self ? 'scared' : 'angry'}
            gesture={ticket.self ? 'none' : 'point'}
            className="ticket__fig"
          />
          <div className="ticket__speech">
            <strong>Herr Müller</strong>
            {ticket.self
              ? `That is my bike, my licence and my face in the photograph. There is nobody to send this to. Forty years I have handed these to other people and read them the speech, and now I get to read it to myself. Fifty means fifty. The circuit is the bit where you may use all of it.`
              : `The car is registered to me, so this comes to my door with my name on it — and it goes on the Amex with everything else. Fifty means fifty. The circuit is the bit where you may use all of it.`}
          </div>
        </div>

        <div className="dialog__actions">
          <button className="btn-primary" onClick={onClose}>
            {ticket.self ? 'Say nothing · carry on' : 'Understood · carry on'}
          </button>
        </div>
      </div>
    </div>
  );
}
