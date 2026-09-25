import { computePi } from '../../src/math/constants/pi'
import { ExperimentRunner, type DigitStart, type ParamValues } from '../../src/experiments/core'
import { defaultParams } from '../../src/experiments/core/types'
import { getExperiment } from '../../src/experiments/registry'

export function piDigits(precision: number): { digits: Uint8Array; integerPartLength: number } {
  const r = computePi(precision)
  return {
    digits: Uint8Array.from(r.digits, (c) => c.charCodeAt(0) - 48),
    integerPartLength: r.integerPartLength,
  }
}

export function makeRunner(
  experimentId: string,
  precision = 1000,
  overrides: ParamValues = {},
  digitStart: DigitStart = 'integer',
): ExperimentRunner {
  const def = getExperiment(experimentId)
  const { digits, integerPartLength } = piDigits(precision)
  return new ExperimentRunner(def, {
    digits,
    integerPartLength,
    digitStart,
    params: { ...defaultParams(def.parameters), ...overrides },
    constant: { id: 'pi', symbol: 'π' },
  })
}
