import type { GeometryBatchWriter } from '../../geometry/batch'
import { COMPUTE_SYNC } from '../../math/constants'
import { binaryConstantFor } from '../../math/exactReduce'
import type { FormulaEvaluation } from './formula'
import type {
  ConstantHandle,
  DigitStart,
  DigitView,
  ExperimentDefinition,
  GeometryExperiment,
  ParamValues,
  StepContext,
  StepTrace,
} from './types'

export const CHECKPOINT_INTERVAL = 1000

export interface RunnerConfig {
  digits: Uint8Array
  integerPartLength: number
  digitStart: DigitStart
  params: ParamValues
  constant: { id: string; symbol: string }
}

/**
 * Drives one experiment over a digit sequence, deterministically.
 *
 * - Step n (1-based) consumes digit[startOffset + n − 1].
 * - A snapshot is stored every CHECKPOINT_INTERVAL steps, so any past step can be
 *   re-executed exactly (inspect / replay) without keeping per-step traces in memory.
 * - Pure TypeScript: runs in the simulation worker and in unit tests alike.
 */
export class ExperimentRunner {
  private readonly experiment: GeometryExperiment
  private readonly checkpoints = new Map<number, unknown>()
  private digits: Uint8Array
  private digitView: DigitView
  private readonly startOffset: number
  private readonly constant: ConstantHandle
  private step = 0
  /** Explanation of the most recent step, filled by `advance(…, traceLast = true)`. */
  lastTrace: StepTrace | undefined

  constructor(
    readonly definition: ExperimentDefinition,
    readonly config: RunnerConfig,
  ) {
    const { digits } = config
    this.digits = digits
    this.digitView = { length: digits.length, at: (i) => digits[i]! }
    this.startOffset = config.digitStart === 'fractional' ? config.integerPartLength : 0
    this.constant = {
      ...config.constant,
      binary: binaryConstantFor(config.constant.id, COMPUTE_SYNC[config.constant.id]!),
      pi: binaryConstantFor('pi', COMPUTE_SYNC.pi!),
    }
    this.experiment = definition.create()
    this.experiment.initialize({ params: config.params })
    this.checkpoints.set(0, this.experiment.snapshot())
  }

  /** Steps executed so far. */
  get currentStep(): number {
    return this.step
  }

  /** Total number of steps the available digits allow. */
  get totalSteps(): number {
    return Math.max(0, this.digits.length - this.startOffset)
  }

  get finished(): boolean {
    return this.step >= this.totalSteps
  }

  /** Digit-sequence position read by a given 1-based step. */
  digitPositionOf(step: number): number {
    return this.startOffset + step - 1
  }

  private context(step: number): StepContext {
    const digitPosition = this.digitPositionOf(step)
    return {
      index: step,
      digit: this.digits[digitPosition]!,
      digitPosition,
      previousDigits: this.digitView,
      constant: this.constant,
    }
  }

  /**
   * Execute up to `maxSteps` steps, appending geometry to `out`.
   * With `traceLast`, the final step is explained into `lastTrace` (at no extra re-execution cost).
   * Returns the number of steps executed.
   */
  advance(maxSteps: number, out?: GeometryBatchWriter, traceLast = false): number {
    const target = Math.min(this.totalSteps, this.step + maxSteps)
    const start = this.step
    while (this.step < target) {
      const n = this.step + 1
      const ctx = this.context(n)
      const evaluations: FormulaEvaluation[] | undefined = traceLast && n === target ? [] : undefined
      const { instructions, env, overlay } = this.experiment.step(ctx, evaluations)
      if (out) for (const g of instructions) out.push(n, g)
      if (evaluations) this.lastTrace = this.buildTrace(ctx, evaluations, env, instructions, overlay)
      this.step = n
      if (n % CHECKPOINT_INTERVAL === 0) this.checkpoints.set(n, this.experiment.snapshot())
    }
    return this.step - start
  }

  /**
   * Re-execute step `step` (1 ≤ step ≤ currentStep) from the nearest checkpoint on a
   * separate experiment instance and return its full explanation.
   */
  inspect(step: number): StepTrace {
    if (!Number.isInteger(step) || step < 1 || step > this.step) {
      throw new RangeError(`step ${step} has not been executed (current: ${this.step})`)
    }
    const shadow = this.definition.create()
    shadow.initialize({ params: this.config.params })
    const base = Math.floor((step - 1) / CHECKPOINT_INTERVAL) * CHECKPOINT_INTERVAL
    shadow.restore(structuredClone(this.checkpoints.get(base)))
    for (let n = base + 1; n < step; n++) shadow.step(this.context(n))
    const evaluations: FormulaEvaluation[] = []
    const ctx = this.context(step)
    const { instructions, env, overlay } = shadow.step(ctx, evaluations)
    return this.buildTrace(ctx, evaluations, env, instructions, overlay)
  }

  private buildTrace(
    ctx: StepContext,
    evaluations: FormulaEvaluation[],
    env: StepTrace['env'],
    instructions: StepTrace['instructions'],
    overlay?: StepTrace['overlay'],
  ): StepTrace {
    return {
      step: ctx.index,
      digit: ctx.digit,
      digitPosition: ctx.digitPosition,
      digitPlace:
        ctx.digitPosition < this.config.integerPartLength
          ? 'integer'
          : ctx.digitPosition - this.config.integerPartLength + 1,
      evaluations,
      env: { ...env },
      instructions,
      ...(overlay ? { overlay } : {}),
    }
  }

  /**
   * Continuous computation: replace the digits with a longer computation of the same constant.
   * Certified digits never change, so the new sequence must start with the old one — this is
   * checked, and a mismatch is an error rather than a silent change of the past.
   */
  extendDigits(digits: Uint8Array): void {
    const old = this.digits
    if (digits.length < old.length) throw new RangeError('extension is shorter than the current digits')
    for (let i = 0; i < old.length; i++) {
      if (digits[i] !== old[i])
        throw new Error(`digit ${i} differs in the extension (${old[i]} → ${digits[i]})`)
    }
    this.digits = digits
    this.digitView = { length: digits.length, at: (i) => digits[i]! }
  }

  reset(): void {
    this.experiment.reset()
    this.experiment.initialize({ params: this.config.params })
    this.checkpoints.clear()
    this.checkpoints.set(0, this.experiment.snapshot())
    this.step = 0
    this.lastTrace = undefined
  }

  /** Current experiment state (for replay tests). */
  snapshot(): unknown {
    return this.experiment.snapshot()
  }
}
