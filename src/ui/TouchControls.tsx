import type { InputManager } from '../game/input';

interface Props {
  input: InputManager;
  visible: boolean;
}

/**
 * PS-style touch layout: a d-pad nub on the left for steering, cross and
 * square on the right for throttle and brake — hold square at a standstill
 * and the car backs up, just like holding the brake on a pad.
 */
export default function TouchControls({ input, visible }: Props) {
  if (!visible) return null;

  const bind = (apply: (down: boolean) => void) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      // Input first: setPointerCapture can throw (pointer already gone), and
      // an exception before apply() would eat the press entirely.
      input.touchActive = true;
      apply(true);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* capture is a nicety; the press already registered */
      }
    },
    onPointerUp: () => apply(false),
    onPointerCancel: () => apply(false),
    onPointerLeave: (e: React.PointerEvent) => {
      if (e.buttons === 0) apply(false);
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  return (
    <div className="touch-controls touch-controls--on">
      {/* Steering, styled as the left stick with arrow caps */}
      <div className="ps-pad ps-pad--left" {...bind((d) => (input.touch.steer = d ? -1 : 0))} aria-label="Steer left">
        <svg viewBox="0 0 40 40">
          <circle cx="20" cy="20" r="17" className="ps-pad__ring" />
          <path d="M24 12 L14 20 L24 28" className="ps-pad__glyph" />
        </svg>
      </div>
      <div className="ps-pad ps-pad--right" {...bind((d) => (input.touch.steer = d ? 1 : 0))} aria-label="Steer right">
        <svg viewBox="0 0 40 40">
          <circle cx="20" cy="20" r="17" className="ps-pad__ring" />
          <path d="M16 12 L26 20 L16 28" className="ps-pad__glyph" />
        </svg>
      </div>

      {/* Square: brake, and reverse once stopped */}
      <div className="ps-pad ps-pad--square" {...bind((d) => (input.touch.brake = d ? 1 : 0))} aria-label="Brake / reverse">
        <svg viewBox="0 0 40 40">
          <circle cx="20" cy="20" r="17" className="ps-pad__ring" />
          <rect x="12.5" y="12.5" width="15" height="15" rx="1.5" className="ps-pad__glyph ps-pad__glyph--square" />
        </svg>
        <span className="ps-pad__hint">R</span>
      </div>

      {/* Cross: throttle */}
      <div className="ps-pad ps-pad--cross" {...bind((d) => (input.touch.throttle = d ? 1 : 0))} aria-label="Throttle">
        <svg viewBox="0 0 40 40">
          <circle cx="20" cy="20" r="17" className="ps-pad__ring" />
          <path d="M13 13 L27 27 M27 13 L13 27" className="ps-pad__glyph ps-pad__glyph--cross" />
        </svg>
      </div>
    </div>
  );
}
