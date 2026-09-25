import { pow10 } from './bigint'

/**
 * Decimal fixed-point number: value = raw / 10^scale.
 * Used to hold high-precision constants without any floating point.
 */
export interface FixedDecimal {
  readonly raw: bigint
  readonly scale: number
}

/**
 * Truncate (never round) a fixed-point value to `digits` digits after the decimal point
 * and return it as a plain decimal string, e.g. "3.14159".
 * Truncation is used on purpose: rounding could turn a correct digit into an incorrect one.
 */
export function toDecimalString(value: FixedDecimal, digits: number): string {
  if (digits > value.scale)
    throw new RangeError(`requested ${digits} digits but only ${value.scale} available`)
  const negative = value.raw < 0n
  const abs = negative ? -value.raw : value.raw
  const truncated = abs / pow10(value.scale - digits)
  const s = truncated.toString().padStart(digits + 1, '0')
  const intPart = s.slice(0, s.length - digits)
  const fracPart = s.slice(s.length - digits)
  return (negative ? '-' : '') + (digits > 0 ? `${intPart}.${fracPart}` : intPart)
}
