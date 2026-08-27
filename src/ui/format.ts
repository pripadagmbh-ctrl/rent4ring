/** mm:ss.mmm — the way lap times are read out at the Ring. */
export function formatLap(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return '--:--.---';
  // Round once in integer milliseconds; deriving each field from the float
  // truncated 6.5699999… to .569 instead of .570.
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const m = Math.floor(totalMs / 60000);
  const s = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;
  return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

/** Signed delta with a leading sign, e.g. -1.284 */
export function formatDelta(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—.———';
  // Dead level is neither ahead nor behind — no sign on a true zero.
  if (Math.abs(seconds) < 0.0005) return '0.000';
  const sign = seconds > 0 ? '+' : '−';
  return `${sign}${Math.abs(seconds).toFixed(3)}`;
}

export function formatDistance(metres: number): string {
  return `${(metres / 1000).toFixed(2)} km`;
}
