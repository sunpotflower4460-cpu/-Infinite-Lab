import { pow10 } from '../precision/bigint'
import type { FixedDecimal } from '../precision/fixed'

/**
 * e = Σ_{k≥0} 1/k!  with binary splitting on exact BigInt arithmetic.
 *
 * For a < b:  Σ_{k=a+1}^{b} 1/((a+1)(a+2)…k) = P(a,b) / Q(a,b),  Q(a,b) = (a+1)(a+2)…b
 *   leaf (b = a+1):  P = 1, Q = b
 *   merge at m:      P = P(a,m)·Q(m,b) + P(m,b),  Q = Q(a,m)·Q(m,b)
 * so  e = 1 + P(0,N)/Q(0,N) + tail,  with tail < 2/(N+1)!.
 */
function split(a: number, b: number): { P: bigint; Q: bigint } {
  if (b - a === 1) return { P: 1n, Q: BigInt(b) }
  const m = (a + b) >> 1
  const l = split(a, m)
  const r = split(m, b)
  return { P: l.P * r.Q + r.P, Q: l.Q * r.Q }
}

/** Smallest N with N! > 10^(digits + 5), so the series tail is far below one ulp. */
export function eTerms(digits: number): number {
  let log = 0
  let n = 1
  while (log <= digits + 5) {
    n++
    log += Math.log10(n)
  }
  return n
}

/** e as fixed point with `scale` decimals; |error| < 2 ulp (floor division + tail). */
export function eFixed(scale: number): FixedDecimal {
  if (!Number.isInteger(scale) || scale < 1) throw new RangeError(`invalid scale ${scale}`)
  const one = pow10(scale)
  const { P, Q } = split(0, eTerms(scale))
  return { raw: one + (P * one) / Q, scale }
}
