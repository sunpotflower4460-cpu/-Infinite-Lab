import { toDecimalString, type FixedDecimal } from '../precision/fixed'
import type { ConstantResult } from './types'

/** Extra digits computed beyond the requested precision, then discarded by truncation. */
export const GUARD_DIGITS = 20

/** Default error bound (units in the last place) assumed for a raw fixed-point result. */
export const RAW_ERROR_ULPS = 16n

/**
 * Truncate to `precision` digits only if the result is certain: every value within
 * ±errorUlps of `fixed` must truncate to the same digits. Returns null when the
 * true value could lie on either side of a digit boundary (e.g. …4999999|… vs …5000000|…).
 */
export function certainTruncation(
  fixed: FixedDecimal,
  precision: number,
  errorUlps = RAW_ERROR_ULPS,
): string | null {
  const lo = toDecimalString({ raw: fixed.raw - errorUlps, scale: fixed.scale }, precision)
  const hi = toDecimalString({ raw: fixed.raw + errorUlps, scale: fixed.scale }, precision)
  return lo === hi ? lo : null
}

/**
 * Compute a constant to `precision` decimals with every reported digit guaranteed:
 * evaluate at precision + guard, accept only a certain truncation, otherwise widen the guard.
 *
 * @param raw  returns the constant as fixed point with `scale` decimals, within `errorUlps` of the truth
 */
export function computeCertain(
  precision: number,
  algorithm: string,
  raw: (scale: number) => FixedDecimal,
  errorUlps = RAW_ERROR_ULPS,
): ConstantResult {
  if (!Number.isInteger(precision) || precision < 1) throw new RangeError(`invalid precision ${precision}`)
  const t0 = performance.now()
  let guard = GUARD_DIGITS
  let value = certainTruncation(raw(precision + guard), precision, errorUlps)
  while (value === null) {
    guard *= 2
    value = certainTruncation(raw(precision + guard), precision, errorUlps)
  }
  const computeTimeMs = performance.now() - t0
  const [intPart = '', fracPart = ''] = value.split('.')
  return {
    value,
    digits: intPart + fracPart,
    precision,
    integerPartLength: intPart.length,
    algorithm,
    computeTimeMs,
  }
}
