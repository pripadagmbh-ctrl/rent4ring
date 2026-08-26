/** mm:ss.mmm — the way lap times are read out at the Ring. */
export function formatLap(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return '--:--.---';
  const total = Math.max(0, seconds);
  const m = Math.floor(total / 60);
  const s = Math.floor(total % 60);
  const ms = Math.floor((total % 1) * 1000);
  return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

/** Signed delta with a leading sign, e.g. -1.284 */
export function formatDelta(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—.———';
  const sign = seconds >= 0 ? '+' : '−';
  return `${sign}${Math.abs(seconds).toFixed(3)}`;
}

export function formatDistance(metres: number): string {
  return `${(metres / 1000).toFixed(2)} km`;
}
