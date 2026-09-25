import { chudnovskyPi } from '../algorithms/chudnovsky'
import { toDecimalString, type FixedDecimal } from '../precision/fixed'
import type { ConstantResult, MathematicalConstant } from './types'

/** Extra digits computed beyond the requested precision, then discarded by truncation. */
export const GUARD_DIGITS = 20

/**
 * Upper bound of |raw − π·10^scale| in units of the last place for chudnovskyPi.
 * Error sources: floor in isqrt (< 1), floor in the final division (< 1), series tail
 * (< 10^-28 relative with the chosen term count). 16 is a generous margin over < 3.
 */
export const RAW_ERROR_ULPS = 16n

/**
 * Truncate to `precision` digits only if the result is certain: every value within
 * the error bound of `fixed` must truncate to the same digits. Returns null when the
 * true value could lie on either side of a digit boundary (e.g. …4999999|… vs …5000000|…).
 */
export function certainTruncation(fixed: FixedDecimal, precision: number): string | null {
  const lo = toDecimalString({ raw: fixed.raw - RAW_ERROR_ULPS, scale: fixed.scale }, precision)
  const hi = toDecimalString({ raw: fixed.raw + RAW_ERROR_ULPS, scale: fixed.scale }, precision)
  return lo === hi ? lo : null
}

/** Synchronous core, shared by the worker and the tests. */
export function computePi(precision: number): ConstantResult {
  if (!Number.isInteger(precision) || precision < 1) throw new RangeError(`invalid precision ${precision}`)
  const t0 = performance.now()
  // Widen the guard until every reported digit is provably correct.
  let guard = GUARD_DIGITS
  let value = certainTruncation(chudnovskyPi(precision + guard), precision)
  while (value === null) {
    guard *= 2
    value = certainTruncation(chudnovskyPi(precision + guard), precision)
  }
  const computeTimeMs = performance.now() - t0
  const [intPart = '', fracPart = ''] = value.split('.')
  return {
    value,
    digits: intPart + fracPart,
    precision,
    integerPartLength: intPart.length,
    algorithm: 'Chudnovsky (binary splitting, BigInt)',
    computeTimeMs,
  }
}

export const pi: MathematicalConstant = {
  id: 'pi',
  name: 'Pi',
  symbol: 'π',
  calculate: async (precision) => computePi(precision),
}
