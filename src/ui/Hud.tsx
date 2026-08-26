import type { HudState } from '../game/Game';
import { formatDelta, formatDistance, formatLap } from './format';
import Minimap from './Minimap';
import MuellerPanel from './MuellerPanel';

interface Props {
  hud: HudState;
  onPause(): void;
  onSkipApproach(): void;
}

export default function Hud({ hud, onPause, onSkipApproach }: Props) {
  const revPct = Math.min(1, Math.max(0, hud.rpmRatio)) * 100;
  const atLimit = hud.rpmRatio > 0.94;
  // The countdown starts at 3.2 s and the car is released at 0 — the 0.2 s
  // offset gives each digit a full second and keeps "GO" out of the hold phase.
  const countdownLabel =
    hud.countdown === null ? null : hud.countdown > 2.2 ? '3' : hud.countdown > 1.2 ? '2' : hud.countdown > 0.2 ? '1' : 'GO';
  const onApproach = hud.phase === 'approach';

  return (
    <div className="hud">
      {/* ------------------------------------------------- timing (top left) */}
      <div className="hud__topleft">
        {onApproach ? (
          <div className="timebox timebox--approach">
            <div className="timebox__label">Road to the Ring</div>
            <div className="timebox__value">{(hud.approachRemaining / 1000).toFixed(2)} km</div>
            <button className="timebox__skip" onClick={onSkipApproach}>
              Skip
            </button>
          </div>
        ) : (
          <>
            <div className="timebox">
              <div className="timebox__label">
                {hud.phase === 'outlap' ? 'Out lap' : 'Current lap'}
              </div>
              <div className="timebox__value">
                {hud.phase === 'outlap' ? '—:—.———' : formatLap(hud.lapTime)}
              </div>
            </div>
            <div className="timebox timebox--small">
              <div className="timebox__label">Best lap</div>
              <div className="timebox__value">{formatLap(hud.bestLap)}</div>
            </div>
            {hud.delta !== null && (
              <div className={`delta ${hud.delta <= 0 ? 'delta--up' : 'delta--down'}`}>
                {formatDelta(hud.delta)}
              </div>
            )}
          </>
        )}
      </div>

      {/* ------------------------------------------------- section (top mid) */}
      <div className="hud__section">
        <div className="hud__section-name">{hud.sectionName}</div>
        {!onApproach && (
          <>
            <div className="hud__section-dist">
              {formatDistance(hud.distance)} / {formatDistance(hud.lapLength)}
            </div>
            <div className="progressbar">
              <div className="progressbar__fill" style={{ width: `${hud.progress * 100}%` }} />
            </div>
          </>
        )}
      </div>

      {/* The pause control lives outside the keyboard-hint block, which is
          hidden on phones — pausing must always be reachable. */}
      <button className="hud__pause" onClick={onPause} aria-label="Pause">
        <svg viewBox="0 0 24 24" width="16" height="16">
          <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
          <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
        </svg>
      </button>

      <div className="hud__hint">
        <div>Esc — Pause</div>
        <div>C — Camera</div>
        <div>R — Back on track</div>
      </div>

      {hud.offTrack && hud.countdown === null && <div className="hud__warn">Off track</div>}

      <div className={`revbar ${atLimit ? 'revbar--limit' : ''}`}>
        <div className="revbar__fill" style={{ width: `${revPct}%` }} />
      </div>

      <div className="hud__bottomright">
        <div className="speedo">
          <div className="speedo__value">{Math.round(hud.speedKmh)}</div>
          <div className="speedo__unit">km/h</div>
        </div>
        <div className="gear">
          {hud.reversing ? 'R' : hud.gear}
          <div className="gear__label">Gear</div>
        </div>
      </div>

      {/* -------------------------------------------- Herr Müller, always on */}
      <MuellerPanel
        mood={hud.muellerMood}
        line={hud.muellerLine}
        damageCost={hud.damageCost}
        damage={hud.damage}
      />

      {!onApproach && <Minimap carPos={hud.carPos} ghostPos={hud.ghostPos} />}

      {countdownLabel && (
        <div className={`countdown ${countdownLabel === 'GO' ? 'countdown--go' : ''}`}>{countdownLabel}</div>
      )}
    </div>
  );
}
