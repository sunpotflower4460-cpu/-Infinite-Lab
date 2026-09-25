import { circleChain } from './circle-chain'
import type { ExperimentDefinition } from './core/types'
import { digitCircleWalk } from './digit-circle-walk'
import { piRotation } from './pi-rotation'

/** Available experiments, in display order. */
export const EXPERIMENTS: Record<string, ExperimentDefinition> = {
  [digitCircleWalk.id]: digitCircleWalk,
  [circleChain.id]: circleChain,
  [piRotation.id]: piRotation,
}

export function getExperiment(id: string): ExperimentDefinition {
  const def = EXPERIMENTS[id]
  if (!def) throw new Error(`Unknown experiment "${id}"`)
  return def
}

/** Description with the constant's symbol substituted for "{C}". */
export function describe(def: ExperimentDefinition, symbol: string): string {
  return def.description.replaceAll('{C}', symbol)
}
