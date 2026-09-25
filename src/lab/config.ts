import type { DigitStart, ParamValues } from '../experiments/core/types'
import { EXPERIMENTS } from '../experiments/registry'
import { CONSTANTS } from '../math/constants'

export const PRECISIONS = [100, 1_000, 10_000, 100_000] as const

/** Everything that determines the geometry (together with a step count). */
export interface LabConfig {
  constant: string
  precision: number
  experiment: string
  digitStart: DigitStart
  parameters: ParamValues
}

/**
 * Validate an untrusted config (JSON import, localStorage) against the registries and
 * parameter schemas. Unknown parameters are rejected; missing ones take their defaults.
 */
export function parseConfig(input: unknown): LabConfig {
  if (typeof input !== 'object' || input === null) throw new Error('config must be an object')
  const o = input as Record<string, unknown>
  // Own-property checks: inherited keys such as "toString" or "__proto__" are not ids.
  const constant = o.constant === undefined ? 'pi' : o.constant
  if (typeof constant !== 'string' || !Object.hasOwn(CONSTANTS, constant)) {
    throw new Error(`unknown constant "${String(o.constant)}"`)
  }
  const experiment = o.experiment
  if (typeof experiment !== 'string' || !Object.hasOwn(EXPERIMENTS, experiment)) {
    throw new Error(`unknown experiment "${String(experiment)}"`)
  }
  const precision = o.precision === undefined ? 1_000 : o.precision
  if (!PRECISIONS.includes(precision as (typeof PRECISIONS)[number]))
    throw new Error(`unsupported precision ${String(precision)}`)
  const digitStart = o.digitStart === undefined ? 'integer' : o.digitStart
  if (digitStart !== 'integer' && digitStart !== 'fractional')
    throw new Error(`invalid digitStart ${String(digitStart)}`)

  const def = EXPERIMENTS[experiment]!
  const given = (o.parameters ?? {}) as Record<string, unknown>
  if (typeof given !== 'object' || given === null || Array.isArray(given)) {
    throw new Error('parameters must be an object')
  }
  const parameters: ParamValues = {}
  for (const key of Object.keys(given)) {
    if (!def.parameters.some((p) => p.key === key))
      throw new Error(`unknown parameter "${key}" for ${experiment}`)
  }
  for (const p of def.parameters) {
    const value = given[p.key]
    if (value === undefined) parameters[p.key] = p.default
    else if (p.type === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < p.min || value > p.max) {
        throw new Error(`parameter ${p.key} must be a number in [${p.min}, ${p.max}]`)
      }
      parameters[p.key] = value
    } else {
      if (typeof value !== 'boolean') throw new Error(`parameter ${p.key} must be a boolean`)
      parameters[p.key] = value
    }
  }
  return { constant, precision: precision as number, experiment, digitStart, parameters }
}
