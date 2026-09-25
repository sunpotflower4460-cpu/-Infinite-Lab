import { chudnovskyPi } from '../algorithms/chudnovsky'
import { computeCertain } from './certain'
import type { ConstantResult, MathematicalConstant } from './types'

export { certainTruncation, GUARD_DIGITS, RAW_ERROR_ULPS } from './certain'

/**
 * π via the Chudnovsky series. Raw error: floor in isqrt (< 1 ulp), floor in the final
 * division (< 1 ulp), series tail (< 10^-28 relative) — within the default 16-ulp bound.
 */
export function computePi(precision: number): ConstantResult {
  return computeCertain(precision, 'Chudnovsky (binary splitting, BigInt)', chudnovskyPi)
}

export const pi: MathematicalConstant = {
  id: 'pi',
  name: 'Pi',
  symbol: 'π',
  calculate: async (precision) => computePi(precision),
}
