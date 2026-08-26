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

interface Voucher {
  code: string;
  percent: number;
  /** True when this is a banked code from an earlier, better lap. */
  banked: boolean;
}

/**
 * Voucher codes are kept per car and only replaced when the driver earns a
 * better one, so nobody loses a reward by driving another lap. The code and
 * ITS percentage always travel together — showing an old (better) code next
 * to this lap's (worse) percentage would promise the wrong discount.
 */
function useVoucher(carId: string, percent: number): Voucher | null {
  return useMemo(() => {
    const key = `r4r.voucher.${carId}`;
    let saved: { code: string; percent: number } | null = null;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as { code?: string; percent?: number };
        if (typeof parsed.code === 'string' && typeof parsed.percent === 'number' && parsed.percent > 0) {
          saved = { code: parsed.code, percent: parsed.percent };
        }
      }
    } catch {
      /* corrupt entry — treat as absent */
    }

    if (saved && saved.percent >= percent) {
      // The banked code still stands, even after a 0% lap.
      return { ...saved, banked: saved.percent > percent };
    }
    if (percent <= 0) return null;

    const code = generateCode(carId, percent);
    try {
      localStorage.setItem(key, JSON.stringify({ code, percent }));
    } catch {
      /* storage unavailable — the code still works for this session */
    }
    return { code, percent, banked: false };
  }, [carId, percent]);
}

export default function Ceremony({ car, result, onContinue, onGarage }: Props) {
  const percent = result.discountPercent;
  const voucher = useVoucher(car.id, percent);
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
    if (!voucher) return;
    try {
      await navigator.clipboard.writeText(voucher.code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const delta = result.time - car.targetLapSec;
  const speech = pickSpeech(result, percent);

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
        <div className={`voucher ${voucher ? '' : 'voucher--empty'}`}>
          <div className="voucher__head">
            {voucher ? (voucher.banked ? 'Your best voucher so far' : 'Your discount') : 'No discount — this time'}
          </div>
          <div className="voucher__amount">{voucher ? voucher.percent : 0}% </div>

          <div className="ladder">
            <div className="ladder__bar">
              <div className="ladder__fill" style={{ width: `${((voucher?.percent ?? 0) / 10) * 100}%` }} />
            </div>
            <div className="ladder__scale">
              <span>0 %</span>
              <span>5 %</span>
              <span>10 %</span>
            </div>
          </div>

          {voucher ? (
            <>
              <button className="voucher__code" onClick={copy}>
                {voucher.code}
                <span className="voucher__copy">{copied ? 'Copied' : 'Copy'}</span>
              </button>
              <div className="voucher__note">
                Valid against your next Rent4Ring booking.{' '}
                {voucher.banked
                  ? `Banked from an earlier lap — this one earned ${percent}%, so the better code stands.`
                  : delta <= 0
                    ? `You were ${Math.abs(delta).toFixed(1)} s inside the ${formatLap(car.targetLapSec)} target.`
                    : `Target is ${formatLap(car.targetLapSec)}; you are ${delta.toFixed(1)} s off the full 10%.`}
                {!voucher.banked && result.damageCost > 0 && ' The bodywork bill did cost you a little, mind.'}
              </div>
            </>
          ) : (
            <div className="voucher__note">
              Get the {car.model} round inside {formatLap(car.targetLapSec * 1.5)} and the discount starts;
              inside {formatLap(car.targetLapSec)} and it is the full 10%.
              {delta > 0 && ` You are ${delta.toFixed(1)} s away.`}
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
