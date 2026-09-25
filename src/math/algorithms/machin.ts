import { pow10 } from '../precision/bigint'
import type { FixedDecimal } from '../precision/fixed'

/**
 * Machin's formula  π = 16·arctan(1/5) − 4·arctan(1/239),
 * evaluated with exact BigInt fixed-point arithmetic.
 *
 * Deliberately independent from the Chudnovsky implementation: it is used by the
 * verification tests to cross-check thousands of digits without hard-coding them.
 * It is much slower than Chudnovsky and is not used by the app.
 */
function arctanInv(x: bigint, one: bigint): bigint {
  const x2 = x * x
  let power = one / x // one / x^(2k+1)
  let sum = power
  let k = 1n
  let sign = -1n
  while (power !== 0n) {
    power /= x2
    sum += (sign * power) / (2n * k + 1n)
    sign = -sign
    k++
  }
  return sum
}

export function machinPi(scale: number): FixedDecimal {
  const guard = 10
  const one = pow10(scale + guard)
  const raw = 16n * arctanInv(5n, one) - 4n * arctanInv(239n, one)
  return { raw: raw / pow10(guard), scale }
}
