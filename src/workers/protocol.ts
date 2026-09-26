import type { DigitStart, ParamValues, StepTrace } from '../experiments/core/types'
import type { PlaygroundSources } from '../experiments/playground'

// ---- math.worker -----------------------------------------------------------

export type MathRequest = { type: 'compute'; requestId: number; constantId: string; precision: number }

export type MathResponse =
  | {
      type: 'result'
      requestId: number
      constantId: string
      value: string
      digits: Uint8Array
      precision: number
      integerPartLength: number
      algorithm: string
      computeTimeMs: number
    }
  | { type: 'error'; requestId: number; message: string }

// ---- simulation.worker -----------------------------------------------------

export interface SimulationInit {
  experimentId: string
  params: ParamValues
  /** Formula Playground: the formulas to parse and run (the worker builds the definition). */
  formulas?: PlaygroundSources
  digitStart: DigitStart
  digits: Uint8Array
  integerPartLength: number
  constant: { id: string; symbol: string }
}

export type SimRequest =
  /** `initId` is echoed in `ready`, so the main thread can ignore readies of superseded inits. */
  | ({ type: 'init'; initId: number } & SimulationInit)
  | { type: 'play'; stepsPerSecond: number } // Infinity = MAX
  | { type: 'setSpeed'; stepsPerSecond: number }
  | { type: 'pause' }
  | { type: 'step'; count: number }
  /** Continuous computation: wait for more digits instead of stopping at the end. */
  | { type: 'setContinuous'; on: boolean }
  /** Longer digits of the same constant (prefix-checked). */
  | { type: 'extend'; digits: Uint8Array }
  /** Stop and compute exactly up to `step` (no-op if already there or beyond). */
  | { type: 'seekTo'; step: number }
  | { type: 'reset' }
  | { type: 'inspect'; requestId: number; step: number }
  /** Main thread finished rendering a batch of the given generation (flow control). */
  | { type: 'ack'; generation: number }

export type SimResponse =
  | { type: 'ready'; initId: number; totalSteps: number }
  | {
      type: 'batch'
      /** Incremented on every init / reset; acks for older generations are ignored. */
      generation: number
      data: Float64Array
      count: number
      currentStep: number
      totalSteps: number
      trace: StepTrace | undefined
      finished: boolean
      /** Steps executed per second, measured in the worker. */
      stepsPerSecond: number
      computeMs: number
    }
  | {
      type: 'status'
      playing: boolean
      currentStep: number
      finished: boolean
      /** Playing, but paused at the end of the digits until more arrive (continuous mode). */
      waiting?: boolean
    }
  | { type: 'extended'; totalSteps: number }
  | { type: 'reset'; currentStep: 0 }
  | { type: 'inspect'; requestId: number; trace: StepTrace | null; error?: string }
  | { type: 'error'; message: string }
