import { isqrt, pow10 } from '../precision/bigint'
import type { FixedDecimal } from '../precision/fixed'
import { computeCertain } from './certain'
import type { ConstantResult, MathematicalConstant } from './types'

/** φ = (1 + √5) / 2, as floor((10^scale + isqrt(5·10^(2·scale))) / 2) — error < 1 ulp. */
export function phiFixed(scale: number): FixedDecimal {
  const one = pow10(scale)
  return { raw: (one + isqrt(5n * one * one)) >> 1n, scale }
}

export function computePhi(precision: number): ConstantResult {
  return computeCertain(precision, '(1 + √5) / 2 via integer square root (BigInt)', phiFixed)
}

export const phi: MathematicalConstant = {
  id: 'phi',
  name: 'Golden ratio',
  symbol: 'φ',
  calculate: async (precision) => computePhi(precision),
}
