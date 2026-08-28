import Gorilla, { type Mood } from './Gorilla';

interface Props {
  mood: Mood;
  /** Short line of commentary shown under him. */
  line: string;
  /** Accumulated repair bill in euros. */
  damageCost: number;
  /** 0–1, how battered the car is. */
  damage: number;
  /** The bar is measuring Herr Müller, not the vehicle. */
  damageIsRider: boolean;
}

const MOOD_TINT: Record<Mood, string> = {
  idle: 'rgba(255,255,255,0.09)',
  happy: 'rgba(53,208,127,0.45)',
  angry: 'rgba(229,20,43,0.75)',
  scared: 'rgba(245,197,66,0.65)',
  cheer: 'rgba(57,192,255,0.6)',
  trophy: 'rgba(245,197,66,0.8)',
};

/** The always-on Herr Müller window, bottom-left of the HUD. */
export default function MuellerPanel({ mood, line, damageCost, damage, damageIsRider }: Props) {
  return (
    <div className={`mueller mueller--${mood}`} style={{ borderColor: MOOD_TINT[mood] }}>
      <div className="mueller__stage">
        <Gorilla mood={mood} />
      </div>

      <div className="mueller__name">Herr Müller</div>
      <div className="mueller__line">{line}</div>

      <div className="mueller__damage">
        <div className="mueller__damage-head">
          {/* On his own bike the bar is him, and a repair bill he sends
              himself is not news — so the money gives way to the man. */}
          <span>{damageIsRider ? 'Herr Müller' : 'Damage'}</span>
          <b className={!damageIsRider && damageCost > 0 ? 'is-billing' : ''}>
            {damageIsRider
              ? hurtLabel(damage)
              : damageCost.toLocaleString('en-GB', {
                  style: 'currency',
                  currency: 'EUR',
                  maximumFractionDigits: 0,
                })}
          </b>
        </div>
        <div className="mueller__damage-bar">
          <div
            className={`mueller__damage-fill ${damageIsRider ? 'is-rider' : ''}`}
            style={{ width: `${Math.min(1, damage) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * How he is doing, in his own terms. He would not say "68 per cent injured",
 * and a percentage is the wrong unit for a man anyway.
 */
function hurtLabel(damage: number): string {
  if (damage < 0.02) return 'Fine';
  if (damage < 0.25) return 'Bruised';
  if (damage < 0.5) return 'Limping';
  if (damage < 0.75) return 'Bleeding';
  if (damage < 1) return 'Not good';
  return 'Ambulance';
}
