import { chudnovskyPi } from '../algorithms/chudnovsky'
import { toDecimalString } from '../precision/fixed'
import type { ConstantResult, MathematicalConstant } from './types'

/** Extra digits computed beyond the requested precision, then discarded by truncation. */
export const GUARD_DIGITS = 20

/** Synchronous core, shared by the worker and the tests. */
export function computePi(precision: number): ConstantResult {
  if (!Number.isInteger(precision) || precision < 1) throw new RangeError(`invalid precision ${precision}`)
  const t0 = performance.now()
  const fixed = chudnovskyPi(precision + GUARD_DIGITS)
  const value = toDecimalString(fixed, precision)
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
