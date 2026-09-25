import type { DigitStart, ParamValues, StepTrace } from '../experiments/core/types'

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
  digitStart: DigitStart
  digits: Uint8Array
  integerPartLength: number
  constant: { id: string; symbol: string }
}

export type SimRequest =
  | ({ type: 'init' } & SimulationInit)
  | { type: 'play'; stepsPerSecond: number } // Infinity = MAX
  | { type: 'setSpeed'; stepsPerSecond: number }
  | { type: 'pause' }
  | { type: 'step'; count: number }
  | { type: 'reset' }
  | { type: 'inspect'; requestId: number; step: number }
  /** Main thread finished rendering a batch of the given generation (flow control). */
  | { type: 'ack'; generation: number }

export type SimResponse =
  | { type: 'ready'; totalSteps: number }
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
  | { type: 'status'; playing: boolean; currentStep: number; finished: boolean }
  | { type: 'reset'; currentStep: 0 }
  | { type: 'inspect'; requestId: number; trace: StepTrace | null; error?: string }
  | { type: 'error'; message: string }
