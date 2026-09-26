import { pow10 } from '../precision/bigint'
import type { ConstantResult, MathematicalConstant } from './types'

/**
 * p / q to `precision` decimals by exact long division (every digit certain).
 * Rational "constants" are for comparison: with a speed ratio p/q the Two-Arm curves close
 * after q turns, where π, e, √2 and φ never do.
 */
export function computeRational(p: bigint, q: bigint, precision: number): ConstantResult {
  if (!Number.isInteger(precision) || precision < 1) throw new RangeError(`invalid precision ${precision}`)
  const t0 = performance.now()
  const scaled = (p * pow10(precision)) / q // floor (p, q > 0)
  const intPart = (p / q).toString()
  const all = scaled.toString().padStart(intPart.length + precision, '0')
  return {
    value: `${intPart}.${all.slice(intPart.length)}`,
    digits: all,
    precision,
    integerPartLength: intPart.length,
    algorithm: `exact rational ${p}/${q} (long division, BigInt)`,
    computeTimeMs: performance.now() - t0,
  }
}

function rational(id: string, p: bigint, q: bigint, symbol: string, name: string) {
  const compute = (precision: number) => computeRational(p, q, precision)
  const constant: MathematicalConstant = {
    id,
    name,
    symbol,
    calculate: async (precision) => compute(precision),
  }
  return { constant, compute }
}

export const frac22_7 = rational('frac-22-7', 22n, 7n, '22/7', 'rational, for comparison (π ≈ 22/7)')
export const frac355_113 = rational(
  'frac-355-113',
  355n,
  113n,
  '355/113',
  'rational, for comparison (π ≈ 355/113)',
)
export const dec3_14 = rational('dec-3-14', 157n, 50n, '3.14', 'rational 157/50, for comparison')
