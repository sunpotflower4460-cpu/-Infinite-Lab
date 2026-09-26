import type { GeometryInstruction } from '../../geometry/types'
import type { BinaryConstant } from '../../math/exactReduce'
import type { Env, FormulaEvaluation, FormulaSet, SymbolTable } from './formula'

export type ParamValue = number | boolean
export type ParamValues = Record<string, ParamValue>

export type ParameterDef =
  | {
      key: string
      label: string
      type: 'number'
      default: number
      min: number
      max: number
      step: number
      description?: string
    }
  | { key: string; label: string; type: 'boolean'; default: boolean; description?: string }

/** Where in the digit sequence step 1 reads from. */
export type DigitStart = 'integer' | 'fractional'

export interface ExperimentConfig {
  params: ParamValues
}

/** Read-only view of the constant's digit sequence (no copies per step). */
export interface DigitView {
  readonly length: number
  at(index: number): number
}

export interface StepContext {
  /** 1-based step number. */
  index: number
  /** The digit consumed by this step. */
  digit: number
  /** Position of `digit` in the full digit sequence (0 = first integer digit). */
  digitPosition: number
  /** Every digit up to (and beyond) this one; experiments may look back via `previousDigits.at(i)`. */
  previousDigits: DigitView
  /** The constant: identity, e.g. { id: 'pi', symbol: 'π' }, plus its value in high precision. */
  constant: ConstantHandle
}

export interface ConstantHandle {
  id: string
  symbol: string
  /** First ~120 decimals as binary fixed point (for exact reductions such as `constMod`). */
  binary: BinaryConstant
  /** π in the same representation (for `modTau`, whatever the selected constant is). */
  pi: BinaryConstant
}

export interface StepResult {
  instructions: GeometryInstruction[]
  /** Transient helpers shown only with the current / inspected step (e.g. rotating arms); never stored. */
  overlay?: GeometryInstruction[]
  /** Values after this step (inputs, parameters and every formula target). */
  env: Env
}

/** Optional sink an experiment writes formula explanations into (only when inspecting). */
export type TraceSink = FormulaEvaluation[] | undefined

/**
 * A geometry experiment: a pure, deterministic rule "digit → geometry".
 * It knows nothing about rendering. It must not use Math.random, Date, or Math.sin/cos.
 */
export interface GeometryExperiment<S = unknown> {
  initialize(config: ExperimentConfig): void
  step(context: StepContext, trace?: TraceSink): StepResult
  /** Structured-clonable copy of the internal state (for checkpoints / replay). */
  snapshot(): S
  restore(state: S): void
  reset(): void
}

export interface ExperimentDefinition {
  id: string
  name: string
  /** Precise one-line description; "{C}" is replaced by the constant's symbol, e.g. "{C} digit driven circle walk". */
  description: string
  parameters: ParameterDef[]
  /** The executed rule (single source of truth for evaluation and display). */
  formulas: FormulaSet
  /** Display names for variables in formulas. */
  symbols: SymbolTable
  create(): GeometryExperiment
}

export interface StepTrace {
  step: number
  digit: number
  digitPosition: number
  /** 'integer' for the integer part, otherwise the 1-based decimal place. */
  digitPlace: 'integer' | number
  evaluations: FormulaEvaluation[]
  env: Env
  instructions: GeometryInstruction[]
  overlay?: GeometryInstruction[]
}

export function defaultParams(defs: ParameterDef[]): ParamValues {
  const out: ParamValues = {}
  for (const d of defs) out[d.key] = d.default
  return out
}
