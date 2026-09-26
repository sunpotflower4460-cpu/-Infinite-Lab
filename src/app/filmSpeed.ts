/**
 * Film speed in steps per second after t seconds: exponential like the reference video, whose
 * drawing time grows from T ≈ 27 at 22 s to T ≈ 130 at 36 s (see docs/reference/ANALYSIS.md).
 * With dt = 0.05 this gives T(t) ≈ 2.25·(e^{t/9} − 1); capped at 5,000 steps/s.
 */
export function filmSpeed(t: number): number {
  return Math.min(5000, 5 * Math.exp(t / 9))
}
