import { computeE, e } from './e'
import { computePhi, phi } from './phi'
import { computePi, pi } from './pi'
import { computeSqrt2, sqrt2 } from './sqrt2'
import type { ConstantResult, MathematicalConstant } from './types'

/** Registry of available constants, in display order. */
export const CONSTANTS: Record<string, MathematicalConstant> = {
  [pi.id]: pi,
  [e.id]: e,
  [sqrt2.id]: sqrt2,
  [phi.id]: phi,
}

export type { ConstantResult, MathematicalConstant } from './types'

/** Synchronous computation by id (used inside workers, e.g. for the high-precision value of C). */
export const COMPUTE_SYNC: Record<string, (precision: number) => ConstantResult> = {
  pi: computePi,
  e: computeE,
  sqrt2: computeSqrt2,
  phi: computePhi,
}
