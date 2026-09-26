import { computeE, e } from './e'
import { computePhi, phi } from './phi'
import { computePi, pi } from './pi'
import { computeSqrt2, sqrt2 } from './sqrt2'
import { dec3_14, frac22_7, frac355_113 } from './rational'
import type { ConstantResult, MathematicalConstant } from './types'

/** Registry of available constants, in display order. */
export const CONSTANTS: Record<string, MathematicalConstant> = {
  [pi.id]: pi,
  [e.id]: e,
  [sqrt2.id]: sqrt2,
  [phi.id]: phi,
  // rational numbers, for comparison: their curves close, the constants' never do
  [frac22_7.constant.id]: frac22_7.constant,
  [frac355_113.constant.id]: frac355_113.constant,
  [dec3_14.constant.id]: dec3_14.constant,
}

/** Whether a constant is one of the rational comparison values (not an irrational constant). */
export const isRational = (id: string): boolean =>
  id === frac22_7.constant.id || id === frac355_113.constant.id || id === dec3_14.constant.id

export type { ConstantResult, MathematicalConstant } from './types'

/** Synchronous computation by id (used inside workers, e.g. for the high-precision value of C). */
export const COMPUTE_SYNC: Record<string, (precision: number) => ConstantResult> = {
  pi: computePi,
  e: computeE,
  sqrt2: computeSqrt2,
  phi: computePhi,
  [frac22_7.constant.id]: frac22_7.compute,
  [frac355_113.constant.id]: frac355_113.compute,
  [dec3_14.constant.id]: dec3_14.compute,
}
