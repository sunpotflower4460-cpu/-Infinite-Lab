import { pi } from './pi'
import type { MathematicalConstant } from './types'

/**
 * Registry of available constants. e, √2 and φ plug in here through the same
 * MathematicalConstant interface (see docs/ROADMAP.md).
 */
export const CONSTANTS: Record<string, MathematicalConstant> = {
  [pi.id]: pi,
}

export type { ConstantResult, MathematicalConstant } from './types'
