import { useEffect, useState } from 'react';

export type CardMode = 'auth' | 'settle' | 'kept';

interface Props {
  mode: CardMode;
  /** Fired once the little performance is over. */
  onDone?(): void;
}

/** Screen copy and timing for each stage of a swipe. */
const SCRIPT: Record<CardMode, { steps: { at: number; screen: string; note?: string }[]; total: number }> = {
  // Before the drive: the deposit goes on hold.
  auth: {
    steps: [
      { at: 0, screen: 'INSERT CARD' },
      { at: 700, screen: 'READING…' },
      { at: 1600, screen: 'HOLD €2,500', note: 'Deposit authorised' },
      { at: 2500, screen: 'APPROVED', note: 'Deposit authorised' },
    ],
    total: 3400,
  },
  // After the drive: whatever you owe comes off.
  settle: {
    steps: [
      { at: 0, screen: 'INSERT CARD' },
      { at: 700, screen: 'READING…' },
      { at: 1600, screen: 'SETTLING' },
      { at: 2500, screen: 'APPROVED', note: 'Hold released' },
    ],
    total: 3400,
  },
  // Full damage: it does not come back out.
  kept: {
    steps: [
      { at: 0, screen: 'INSERT CARD' },
      { at: 700, screen: 'READING…' },
      { at: 1700, screen: 'DECLINED', note: 'Card retained' },
      { at: 2600, screen: 'RETAINED', note: 'Card retained' },
    ],
    total: 4200,
  },
};

/**
 * Herr Müller running a card through the terminal — once on the way out for
 * the deposit, once on the way back to settle up. If the car came home on the
 * truck, the card does not come back out of his hand at all.
 *
 * Driven by timers rather than pure CSS keyframes because the little screen
 * has to change its wording as it goes, and the pocketing at the end is a
 * different motion from the swipe.
 */
export default function CardReader({ mode, onDone }: Props) {
  const script = SCRIPT[mode];
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timers = script.steps.map((s, i) =>
      window.setTimeout(() => setStep(i), s.at),
    );
    if (onDone) timers.push(window.setTimeout(onDone, script.total));
    return () => timers.forEach(window.clearTimeout);
    // The script is keyed by mode and never changes underneath a mounted
    // reader; re-running on every render would restart the animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const current = script.steps[step];
  const pocketed = mode === 'kept' && step >= 2;

  return (
    <div className={`cardreader cardreader--${mode}`} role="status" aria-live="polite">
      <div className="cardreader__stage">
        <div className={`cardreader__card ${pocketed ? 'is-pocketed' : 'is-swiping'}`}>
          <span className="cardreader__brand">AMEX</span>
          <span className="cardreader__chip" aria-hidden="true" />
          <span className="cardreader__number">•••• 4711</span>
        </div>

        <div className="cardreader__terminal">
          <div className="cardreader__slot" aria-hidden="true" />
          <div className={`cardreader__screen ${mode === 'kept' && step >= 2 ? 'is-bad' : ''}`}>
            {current.screen}
          </div>
          <div className="cardreader__keys" aria-hidden="true">
            {Array.from({ length: 9 }, (_, i) => (
              <span key={i} />
            ))}
          </div>
        </div>

        {pocketed && <div className="cardreader__pocket" aria-hidden="true" />}
      </div>

      {current.note && <div className="cardreader__note">{current.note}</div>}
    </div>
  );
}
