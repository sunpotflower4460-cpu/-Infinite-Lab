import { resolveExperiment } from '../experiments/registry'
import type { ExperimentDefinition } from '../experiments/core/types'
import { useLab } from '../state/labStore'

/** The experiment definition being run (for the Playground: built from the current formulas). */
export function useDefinition(): ExperimentDefinition {
  const experimentId = useLab((s) => s.experimentId)
  const formulas = useLab((s) => s.formulas)
  return resolveExperiment(experimentId, formulas)
}
