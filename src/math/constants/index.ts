import { e } from './e'
import { phi } from './phi'
import { pi } from './pi'
import { sqrt2 } from './sqrt2'
import type { MathematicalConstant } from './types'

/** Registry of available constants, in display order. */
export const CONSTANTS: Record<string, MathematicalConstant> = {
  [pi.id]: pi,
  [e.id]: e,
  [sqrt2.id]: sqrt2,
  [phi.id]: phi,
}

export type { ConstantResult, MathematicalConstant } from './types'
