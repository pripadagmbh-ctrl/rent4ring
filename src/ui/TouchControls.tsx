import { useCallback, useEffect, useRef, useState } from 'react';
import type { InputManager } from '../game/input';

interface Props {
  input: InputManager;
  visible: boolean;
}

type Zone = 'left' | 'right' | 'brake' | 'throttle';
const ZONES: Zone[] = ['left', 'right', 'brake', 'throttle'];

/**
 * How far outside a pad's own circle still counts as grabbing it, in CSS
 * pixels. Thumbs on a moving car do not land accurately, and a miss used to
 * mean no input at all until you lifted off and tried again.
 */
const REACH_PADDING = 32;

/**
 * PS-style touch layout: a d-pad nub on the left for steering, cross and
 * square on the right for throttle and brake — hold square at a standstill
 * and the car backs up, just like holding the brake on a pad.
 *
 * Presses are resolved against the whole control strip rather than by each
 * pad listening for its own events. Per-pad listeners meant a thumb that
 * landed just beside a pad did nothing, and one that slid from throttle to
 * brake kept driving the pad it started on — with two thumbs working at
 * once, that is most of the "had to grab again" feel. Here every pointer is
 * matched to the nearest pad within reach, re-matched as it slides, and
 * tracked separately by pointerId so the two thumbs never interfere.
 */
export default function TouchControls({ input, visible }: Props) {
  const pads = useRef<Partial<Record<Zone, HTMLDivElement | null>>>({});
  /** pointerId -> the pad that pointer is currently working. */
  const held = useRef(new Map<number, Zone>());
  const [pressed, setPressed] = useState<Zone[]>([]);

  const flush = useCallback(() => {
    const active = new Set(held.current.values());
    input.touch.steer = (active.has('right') ? 1 : 0) - (active.has('left') ? 1 : 0);
    input.touch.throttle = active.has('throttle') ? 1 : 0;
    input.touch.brake = active.has('brake') ? 1 : 0;
    input.touchActive = active.size > 0;
    setPressed([...active]);
  }, [input]);

  const releaseAll = useCallback(() => {
    held.current.clear();
    flush();
  }, [flush]);

  // A press still down when the controls hide (pause, ceremony, unmount) must
  // not stay latched — that is how phones ended up driving off at full
  // throttle after "Resume".
  useEffect(() => {
    if (!visible) releaseAll();
  }, [visible, releaseAll]);
  useEffect(() => () => releaseAll(), [releaseAll]);

  const zoneAt = (x: number, y: number): Zone | null => {
    let best: Zone | null = null;
    let bestDist = Infinity;
    for (const zone of ZONES) {
      const el = pads.current[zone];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const dist = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2));
      if (dist <= r.width / 2 + REACH_PADDING && dist < bestDist) {
        bestDist = dist;
        best = zone;
      }
    }
    return best;
  };

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const zone = zoneAt(e.clientX, e.clientY);
    if (!zone) return;
    e.preventDefault();
    held.current.set(e.pointerId, zone);
    flush();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* capture is a nicety; the press already registered */
    }
  };

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const current = held.current.get(e.pointerId);
    if (current === undefined) return;
    const zone = zoneAt(e.clientX, e.clientY);
    // Sticky on drift: sliding off a pad keeps it held, since a thumb
    // wandering mid-corner should not drop the throttle. Only actually
    // reaching another pad hands the pointer over.
    if (zone && zone !== current) {
      held.current.set(e.pointerId, zone);
      flush();
    }
  };

  const onUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!held.current.delete(e.pointerId)) return;
    flush();
  };

  if (!visible) return null;

  const pad = (zone: Zone, className: string, label: string, glyph: React.ReactNode) => (
    <div
      className={`ps-pad ${className} ${pressed.includes(zone) ? 'ps-pad--down' : ''}`}
      ref={(el) => {
        pads.current[zone] = el;
      }}
      aria-label={label}
    >
      <svg viewBox="0 0 40 40">
        <circle cx="20" cy="20" r="17" className="ps-pad__ring" />
        {glyph}
      </svg>
    </div>
  );

  return (
    <div
      className="touch-controls touch-controls--on"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      {pad(
        'left',
        'ps-pad--left',
        'Steer left',
        <path d="M24 12 L14 20 L24 28" className="ps-pad__glyph" />,
      )}
      {pad(
        'right',
        'ps-pad--right',
        'Steer right',
        <path d="M16 12 L26 20 L16 28" className="ps-pad__glyph" />,
      )}
      {/* Square: brake, and reverse once stopped */}
      <div
        className={`ps-pad ps-pad--square ${pressed.includes('brake') ? 'ps-pad--down' : ''}`}
        ref={(el) => {
          pads.current.brake = el;
        }}
        aria-label="Brake / reverse"
      >
        <svg viewBox="0 0 40 40">
          <circle cx="20" cy="20" r="17" className="ps-pad__ring" />
          <rect x="12.5" y="12.5" width="15" height="15" rx="1.5" className="ps-pad__glyph ps-pad__glyph--square" />
        </svg>
        <span className="ps-pad__hint">R</span>
      </div>
      {pad(
        'throttle',
        'ps-pad--cross',
        'Throttle',
        <path d="M13 13 L27 27 M27 13 L13 27" className="ps-pad__glyph ps-pad__glyph--cross" />,
      )}
    </div>
  );
}
