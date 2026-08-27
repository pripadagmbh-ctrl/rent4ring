import { useEffect, useState } from 'react';
import Gorilla, { type Mood } from './Gorilla';

export type CardMode = 'auth' | 'settle' | 'kept';

interface Props {
  mode: CardMode;
  /** Fired once the little performance is over. */
  onDone?(): void;
}

interface Step {
  at: number;
  screen: string;
  note?: string;
  mood: Mood;
}

/** Screen copy, his face, and timing for each stage of a swipe. */
const SCRIPT: Record<CardMode, { steps: Step[]; total: number }> = {
  // Before the drive: the deposit goes on hold.
  auth: {
    steps: [
      { at: 0, screen: 'INSERT CARD', mood: 'idle' },
      { at: 900, screen: 'READING…', mood: 'idle' },
      { at: 1900, screen: 'HOLD €2,500', note: 'Deposit authorised', mood: 'happy' },
      { at: 2900, screen: 'APPROVED', note: 'Deposit authorised', mood: 'cheer' },
    ],
    total: 3900,
  },
  // After the drive: whatever you owe comes off.
  settle: {
    steps: [
      { at: 0, screen: 'INSERT CARD', mood: 'idle' },
      { at: 900, screen: 'READING…', mood: 'idle' },
      { at: 1900, screen: 'SETTLING', mood: 'idle' },
      { at: 2900, screen: 'APPROVED', note: 'Hold released', mood: 'happy' },
    ],
    total: 3900,
  },
  // Full damage: it does not come back out.
  kept: {
    steps: [
      { at: 0, screen: 'INSERT CARD', mood: 'angry' },
      { at: 900, screen: 'READING…', mood: 'angry' },
      { at: 2000, screen: 'DECLINED', note: 'Card retained', mood: 'angry' },
      { at: 3000, screen: 'RETAINED', note: 'Into his pocket', mood: 'angry' },
    ],
    total: 4600,
  },
};

/**
 * Herr Müller behind the counter, running your card through the terminal —
 * once on the way out for the deposit, once on the way back to settle up. If
 * the car came home on the truck, the card does not come back out of his hand.
 *
 * He stands behind the counter and the counter is drawn over him, so only his
 * top half shows: exactly what you see across a shop desk, and it saves
 * animating legs nobody can see.
 *
 * Driven by one clock rather than a fan of timers — the little screen has to
 * change its wording in step with the card, and a timer that fires late would
 * put the two out of sync.
 */
export default function CardReader({ mode, onDone }: Props) {
  const script = SCRIPT[mode];
  const [step, setStep] = useState(0);

  useEffect(() => {
    const started = performance.now();
    let raf = 0;
    const tick = () => {
      const elapsed = performance.now() - started;
      let i = 0;
      while (i + 1 < script.steps.length && script.steps[i + 1].at <= elapsed) i++;
      setStep(i);
      if (elapsed >= script.total) {
        onDone?.();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // The script is keyed by mode and never changes under a mounted reader.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const current = script.steps[step];
  const pocketed = mode === 'kept' && step >= 2;

  return (
    <div className={`cardreader cardreader--${mode}`} role="status" aria-live="polite">
      <div className="cardreader__scene">
        {/* Him, behind the desk. The counter below crops him at the waist. */}
        <div className="cardreader__mueller">
          <Gorilla mood={current.mood} gesture="point" talking={step < 2} />
        </div>

        <div className="cardreader__counter">
          <div className="cardreader__counter-top" />

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

          <div className={`cardreader__card ${pocketed ? 'is-pocketed' : 'is-swiping'}`}>
            <span className="cardreader__brand">AMEX</span>
            <span className="cardreader__chip" aria-hidden="true" />
            <span className="cardreader__number">•••• 4711</span>
          </div>

          {pocketed && <div className="cardreader__pocket" aria-hidden="true" />}
        </div>
      </div>

      {current.note && <div className="cardreader__note">{current.note}</div>}
    </div>
  );
}
