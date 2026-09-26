import { defaultParams, type StepTrace } from '../experiments/core/types'
import { ExperimentRunner } from '../experiments/core/ExperimentRunner'
import { resolveExperiment } from '../experiments/registry'
import { GeometryBatchWriter, type GeometryBatch } from '../geometry/batch'
import type { SimulationInit } from '../workers/protocol'

/** Upper bound of steps per tick in MAX mode, so the renderer can keep up. */
export const MAX_STEPS_PER_TICK = 20_000
/** Time budget per tick in MAX mode (ms). */
export const MAX_TICK_BUDGET_MS = 10

export interface TickResult {
  batch: GeometryBatch
  executed: number
  trace: StepTrace | undefined
  computeMs: number
}

/**
 * Playback clock around an ExperimentRunner. Converts a speed (steps/second, or
 * Infinity for MAX) and elapsed wall time into a number of steps to execute.
 * Timing only decides *how many* steps run per frame — never *what* they compute.
 */
export class Simulation {
  readonly runner: ExperimentRunner
  private readonly writer = new GeometryBatchWriter(4096)
  private carry = 0
  stepsPerSecond = 10

  constructor(init: SimulationInit) {
    const def = resolveExperiment(init.experimentId, init.formulas)
    this.runner = new ExperimentRunner(def, {
      digits: init.digits,
      integerPartLength: init.integerPartLength,
      digitStart: init.digitStart,
      params: { ...defaultParams(def.parameters), ...init.params },
      constant: init.constant,
    })
  }

  /** Steps due after `dtMs` of playback. */
  stepsDue(dtMs: number): number {
    if (!Number.isFinite(this.stepsPerSecond)) return MAX_STEPS_PER_TICK
    // Avoid a burst after the tab was throttled: never owe more than 0.25 s of steps.
    const cap = Math.max(1, this.stepsPerSecond * 0.25)
    this.carry = Math.min(this.carry + (this.stepsPerSecond * dtMs) / 1000, cap)
    const due = Math.floor(this.carry)
    this.carry -= due
    return Math.min(due, MAX_STEPS_PER_TICK)
  }

  /**
   * Execute up to `steps` steps. With `budgeted` (MAX playback), stop early once the
   * per-tick time budget is used; otherwise always execute exactly min(steps, remaining).
   */
  run(steps: number, budgeted = false): TickResult {
    const t0 = performance.now()
    let executed = 0
    if (budgeted) {
      // MAX: run in slices until the time budget is used.
      while (executed < steps && !this.runner.finished && performance.now() - t0 < MAX_TICK_BUDGET_MS) {
        const slice = Math.min(1000, steps - executed)
        const last = executed + slice >= steps || this.runner.currentStep + slice >= this.runner.totalSteps
        executed += this.runner.advance(slice, this.writer, last)
      }
      if (this.runner.lastTrace?.step !== this.runner.currentStep && this.runner.currentStep > 0) {
        this.runner.lastTrace = this.runner.inspect(this.runner.currentStep)
      }
    } else {
      executed = this.runner.advance(steps, this.writer, true)
    }
    return {
      batch: this.writer.flush(),
      executed,
      trace: executed > 0 ? this.runner.lastTrace : undefined,
      computeMs: performance.now() - t0,
    }
  }

  reset(): void {
    this.runner.reset()
    this.writer.flush()
    this.carry = 0
  }
}
