import { isqrt, pow10 } from '../precision/bigint'
import type { FixedDecimal } from '../precision/fixed'

/**
 * Chudnovsky series with binary splitting, on exact BigInt arithmetic.
 *
 *   1/π = 12 Σ_{k≥0} (-1)^k (6k)! (13591409 + 545140134 k) / ((3k)! (k!)^3 640320^(3k+3/2))
 *
 * which rearranges to  π = 426880 √10005 · Q(0,N) / T(0,N).
 * Each term contributes ~14.18 decimal digits.
 */

const A = 13591409n
const B = 545140134n
const C3_OVER_24 = 640320n ** 3n / 24n
export const DIGITS_PER_TERM = 14.181647462725477 // log10(640320^3 / 1728)

interface PQT {
  P: bigint
  Q: bigint
  T: bigint
}

function binarySplit(a: number, b: number): PQT {
  if (b - a === 1) {
    if (a === 0) return { P: 1n, Q: 1n, T: A }
    const k = BigInt(a)
    const P = (6n * k - 5n) * (2n * k - 1n) * (6n * k - 1n)
    const Q = k * k * k * C3_OVER_24
    let T = P * (A + B * k)
    if (a & 1) T = -T
    return { P, Q, T }
  }
  const m = (a + b) >> 1
  const left = binarySplit(a, m)
  const right = binarySplit(m, b)
  return {
    P: left.P * right.P,
    Q: left.Q * right.Q,
    T: right.Q * left.T + left.P * right.T,
  }
}

/** Number of series terms needed for `digits` decimal digits (with margin). */
export function chudnovskyTerms(digits: number): number {
  return Math.floor(digits / DIGITS_PER_TERM) + 2
}

/**
 * π as a fixed-point decimal with `scale` digits after the decimal point.
 * The last few digits of the raw result are not guaranteed; callers must
 * compute with guard digits and truncate (see ConstantEngine).
 */
export function chudnovskyPi(scale: number): FixedDecimal {
  if (!Number.isInteger(scale) || scale < 1) throw new RangeError(`invalid scale ${scale}`)
  const { Q, T } = binarySplit(0, chudnovskyTerms(scale))
  const one = pow10(scale)
  const sqrt10005 = isqrt(10005n * one * one) // √10005 · 10^scale (floor)
  const raw = (426880n * sqrt10005 * Q) / T
  return { raw, scale }
}
