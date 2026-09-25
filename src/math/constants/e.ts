import { eFixed } from '../algorithms/eSeries'
import { computeCertain } from './certain'
import type { ConstantResult, MathematicalConstant } from './types'

export function computeE(precision: number): ConstantResult {
  return computeCertain(precision, 'Σ 1/k! (binary splitting, BigInt)', eFixed)
}

export const e: MathematicalConstant = {
  id: 'e',
  name: "Euler's number",
  symbol: 'e',
  calculate: async (precision) => computeE(precision),
}
