/**
 * Playback clock. Spotify only tells us the position at poll time, so we
 * anchor it to performance.now() and extrapolate between polls.
 */
export interface Anchor {
  progressMs: number;
  /** performance.now() when progressMs was true */
  at: number;
  isPlaying: boolean;
  durationMs: number;
}

export function positionAt(a: Anchor | null, now: number, offsetMs = 0): number {
  if (!a) return 0;
  const p = a.isPlaying ? a.progressMs + (now - a.at) : a.progressMs;
  return Math.min(Math.max(0, p + offsetMs), a.durationMs || Number.POSITIVE_INFINITY);
}

/**
 * Keep the existing anchor when a fresh poll agrees with our extrapolation
 * within `toleranceMs`. Network jitter would otherwise make the clock — and
 * the highlighted line — jump back and forth by a few hundred ms.
 */
export function reconcileAnchor(prev: Anchor | null, next: Anchor, sameTrack: boolean, toleranceMs = 350): Anchor {
  if (!prev || !sameTrack || prev.isPlaying !== next.isPlaying || !next.isPlaying) return next;
  const predicted = positionAt(prev, next.at);
  return Math.abs(predicted - next.progressMs) <= toleranceMs ? { ...prev, durationMs: next.durationMs } : next;
}

/** Largest offset calibration may set (a different LRC version can be several seconds off). */
export const MAX_OFFSET_MS = 15000;

/**
 * Offset that makes `lineTimeMs` start right now — used when the user taps a
 * line the moment it starts being sung ("calibrate"). `reactionMs` accounts
 * for the human delay between hearing the line and tapping it, so the line
 * actually began that much earlier.
 */
export function calibrateOffset(a: Anchor | null, now: number, lineTimeMs: number, reactionMs = 150): number {
  const raw = lineTimeMs - positionAt(a, now, 0) + reactionMs;
  const rounded = Math.round(raw / 10) * 10;
  return Math.max(-MAX_OFFSET_MS, Math.min(MAX_OFFSET_MS, rounded));
}
