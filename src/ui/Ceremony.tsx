import { useEffect, useMemo, useState } from 'react';
import type { Car } from '../data/fleet';
import type { LapResult } from '../game/Game';
import { formatLap } from './format';
import Gorilla from './Gorilla';
import Logo from './Logo';

interface Props {
  car: Car;
  result: LapResult;
  onContinue(): void;
  onGarage(): void;
}

const CONFETTI_COLORS = ['#e5142b', '#f5c542', '#39c0ff', '#35d07f', '#ffffff'];
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateCode(carId: string, percent: number): string {
  let block = '';
  for (let i = 0; i < 4; i++) block += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  const prefix = carId.replace(/[^a-z0-9]/gi, '').slice(0, 3).toUpperCase();
  const pct = String(percent).replace('.', '');
  return `NORD${pct}-${prefix}-${block}`;
}

/**
 * Voucher codes are kept per car and only replaced when the driver earns a
 * better one, so nobody loses a reward by driving another lap.
 */
function useVoucher(carId: string, percent: number): { code: string; percent: number } | null {
  return useMemo(() => {
    if (percent <= 0) return null;
    const key = `r4r.voucher.${carId}`;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const saved = JSON.parse(raw) as { code: string; percent: number };
        // Return the whole voucher, not just its code — the UI must show the
        // percentage the code is actually worth, not this lap's.
        if (saved.percent >= percent) return saved;
      }
      const code = generateCode(carId, percent);
      localStorage.setItem(key, JSON.stringify({ code, percent }));
      return { code, percent };
    } catch {
      return { code: generateCode(carId, percent), percent };
    }
  }, [carId, percent]);
}

export default function Ceremony({ car, result, onContinue, onGarage }: Props) {
  const lapPercent = result.discountPercent;
  const voucher = useVoucher(car.id, lapPercent);
  // The saved code can be worth more than this lap earned — amount, ladder and
  // code must all describe the same voucher.
  const percent = voucher ? voucher.percent : lapPercent;
  const code = voucher ? voucher.code : null;
  const [copied, setCopied] = useState(false);

  const confetti = useMemo(
    () =>
      Array.from({ length: 46 }, (_, i) => ({
        left: `${(i * 97) % 100}%`,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        delay: `${(i % 14) * 0.19}s`,
        duration: `${2.6 + ((i * 7) % 20) / 10}s`,
      })),
    [],
  );

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const delta = result.time - car.targetLapSec;
  // Herr Müller comments on the lap that was just driven, not the saved code.
  const speech = pickSpeech(result, lapPercent);

  return (
    <div className="ceremony">
      <div className="ceremony__card">
        <div className="confetti" aria-hidden="true">
          {confetti.map((c, i) => (
            <i
              key={i}
              style={{
                left: c.left,
                background: c.color,
                animationDelay: c.delay,
                animationDuration: c.duration,
              }}
            />
          ))}
        </div>

        <Logo width={150} className="ceremony__logo" />
        <div className="ceremony__eyebrow">Lap complete · Home Circuit</div>
        <div className="ceremony__time">{formatLap(result.time)}</div>
        <div className="ceremony__sub">
          {car.brand} {car.model}
          {result.personalBest && ' · New personal best'}
          {result.previousBest !== null && !result.personalBest && ` · Best ${formatLap(result.previousBest)}`}
        </div>

        <div className="gorilla-stage">
          <Gorilla mood="trophy" trophy />
          <div className="speech">
            <strong>Herr Müller</strong>
            {speech}
          </div>
        </div>

        <div className="sector-table">
          {result.sectors.map((s, i) => {
            const prev = i === 0 ? 0 : result.sectors[i - 1].time;
            return (
              <div className="sector-row" key={s.name}>
                <span>
                  S{i + 1} · {s.name}
                </span>
                <b>{formatLap(s.time - prev)}</b>
              </div>
            );
          })}
        </div>

        <div className="stat-row">
          <div className="stat">
            <div className="stat__value">{Math.round(result.topSpeedKmh)}</div>
            <div className="stat__label">km/h top</div>
          </div>
          <div className="stat">
            <div className="stat__value">{result.contacts}</div>
            <div className="stat__label">Armco hits</div>
          </div>
          <div className="stat">
            <div className="stat__value" style={{ color: result.damageCost > 0 ? '#ff6a5a' : 'var(--green)' }}>
              {result.damageCost.toLocaleString('en-GB', {
                style: 'currency',
                currency: 'EUR',
                maximumFractionDigits: 0,
              })}
            </div>
            <div className="stat__label">Damage bill</div>
          </div>
        </div>

        {/* --------------------------------------------------- discount ladder */}
        <div className={`voucher ${percent > 0 ? '' : 'voucher--empty'}`}>
          <div className="voucher__head">
            {percent > 0 ? (percent > lapPercent ? 'Your best voucher' : 'Your discount') : 'No discount — this time'}
          </div>
          <div className="voucher__amount">{percent}% </div>

          <div className="ladder">
            <div className="ladder__bar">
              <div className="ladder__fill" style={{ width: `${(percent / 10) * 100}%` }} />
            </div>
            <div className="ladder__scale">
              <span>0 %</span>
              <span>5 %</span>
              <span>10 %</span>
            </div>
          </div>

          {percent > 0 && code ? (
            <>
              <button className="voucher__code" onClick={copy}>
                {code}
                <span className="voucher__copy">{copied ? 'Copied' : 'Copy'}</span>
              </button>
              <div className="voucher__note">
                Valid against your next Rent4Ring booking.{' '}
                {delta <= 0
                  ? `You were ${Math.abs(delta).toFixed(1)} s inside the ${formatLap(car.targetLapSec)} target — full marks.`
                  : `Target is ${formatLap(car.targetLapSec)}; you are ${delta.toFixed(1)} s off the full 10%.`}
                {result.damageCost > 0 && ' The bodywork bill did cost you a little, mind.'}
                {percent > lapPercent &&
                  ` This lap was worth ${lapPercent}%, but your earlier ${percent}% code stands.`}
              </div>
            </>
          ) : (
            <div className="voucher__note">
              Get the {car.model} round inside {formatLap(car.targetLapSec * 1.5)} and the discount starts;
              inside {formatLap(car.targetLapSec)} and it is the full 10%. You are {delta.toFixed(1)} s away.
            </div>
          )}
        </div>

        <div className="dialog__actions" style={{ marginTop: 22 }}>
          <button className="btn-primary" onClick={onContinue}>
            Another lap
          </button>
          <button className="btn-ghost" onClick={onGarage}>
            Back to the garage
          </button>
        </div>
      </div>
    </div>
  );
}

function pickSpeech(result: LapResult, percent: number): string {
  if (percent >= 10) {
    return result.personalBest
      ? 'Outstanding! Personal best and the target demolished. Full ten percent — the trophy is yours.'
      : 'Target time beaten! Full ten percent. Take the trophy, you have earned it.';
  }
  if (percent > 0 && result.damageCost > 1500) {
    return `Quick, I will give you that — but ${Math.round(result.damageCost)} euros of panels! That is why it is only ${percent} percent.`;
  }
  if (percent > 0) {
    return `Tidy driving! ${percent} percent it is. A bit more nerve and that would have been ten.`;
  }
  if (result.clean) {
    return 'Round without a single scratch — respect. For the discount, though, you will need to be a good deal quicker.';
  }
  return 'Made it back, and that counts for something. The trophy is yours; the discount, sadly, is not.';
}
