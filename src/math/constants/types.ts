/** Result of computing a mathematical constant to a given precision. */
export interface ConstantResult {
  /** Decimal representation, truncated (not rounded) to `precision` digits after the point. */
  value: string
  /** All digits of `value` without the decimal point, e.g. "314159…". */
  digits: string
  /** Number of digits after the decimal point. */
  precision: number
  /** How many leading entries of `digits` belong to the integer part (1 for π). */
  integerPartLength: number
  /** Human-readable algorithm name, e.g. "Chudnovsky (binary splitting, BigInt)". */
  algorithm: string
  /** Wall-clock computation time in milliseconds. */
  computeTimeMs: number
}

export interface MathematicalConstant {
  id: string
  name: string
  symbol: string
  calculate(precision: number): Promise<ConstantResult>
}
