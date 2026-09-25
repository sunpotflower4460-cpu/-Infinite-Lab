import { isqrt, pow10 } from '../precision/bigint'
import type { FixedDecimal } from '../precision/fixed'
import { computeCertain } from './certain'
import type { ConstantResult, MathematicalConstant } from './types'

/** √2 · 10^scale, floored — exact integer square root, error < 1 ulp. */
export function sqrt2Fixed(scale: number): FixedDecimal {
  return { raw: isqrt(2n * pow10(2 * scale)), scale }
}

export function computeSqrt2(precision: number): ConstantResult {
  return computeCertain(precision, 'Integer square root (Newton, BigInt)', sqrt2Fixed)
}

export const sqrt2: MathematicalConstant = {
  id: 'sqrt2',
  name: 'Square root of 2',
  symbol: '√2',
  calculate: async (precision) => computeSqrt2(precision),
}
