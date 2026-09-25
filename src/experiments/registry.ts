import type { ExperimentDefinition } from './core/types'
import { digitCircleWalk } from './digit-circle-walk'

/** Available experiments. Circle Chain and Pi Rotation follow in v0.2 (docs/ROADMAP.md). */
export const EXPERIMENTS: Record<string, ExperimentDefinition> = {
  [digitCircleWalk.id]: digitCircleWalk,
}

export function getExperiment(id: string): ExperimentDefinition {
  const def = EXPERIMENTS[id]
  if (!def) throw new Error(`Unknown experiment "${id}"`)
  return def
}
