import { CONSTANTS } from '../../src/math/constants'
import { computeE } from '../../src/math/constants/e'
import { computePhi } from '../../src/math/constants/phi'
import { computePi } from '../../src/math/constants/pi'
import { computeSqrt2 } from '../../src/math/constants/sqrt2'
import type { ConstantResult } from '../../src/math/constants/types'
import { ExperimentRunner, type DigitStart, type ParamValues } from '../../src/experiments/core'
import { defaultParams } from '../../src/experiments/core/types'
import { resolveExperiment } from '../../src/experiments/registry'
import type { PlaygroundSources } from '../../src/experiments/playground'

const COMPUTE: Record<string, (p: number) => ConstantResult> = {
  pi: computePi,
  e: computeE,
  sqrt2: computeSqrt2,
  phi: computePhi,
}

export function constantDigits(
  constantId: string,
  precision: number,
): { digits: Uint8Array; integerPartLength: number } {
  const r = COMPUTE[constantId]!(precision)
  return {
    digits: Uint8Array.from(r.digits, (c) => c.charCodeAt(0) - 48),
    integerPartLength: r.integerPartLength,
  }
}

export const piDigits = (precision: number) => constantDigits('pi', precision)

export function makeRunner(
  experimentId: string,
  precision = 1000,
  overrides: ParamValues = {},
  digitStart: DigitStart = 'integer',
  constantId = 'pi',
  formulas?: PlaygroundSources,
): ExperimentRunner {
  const def = resolveExperiment(experimentId, formulas)
  const { digits, integerPartLength } = constantDigits(constantId, precision)
  return new ExperimentRunner(def, {
    digits,
    integerPartLength,
    digitStart,
    params: { ...defaultParams(def.parameters), ...overrides },
    constant: { id: constantId, symbol: CONSTANTS[constantId]!.symbol },
  })
}
