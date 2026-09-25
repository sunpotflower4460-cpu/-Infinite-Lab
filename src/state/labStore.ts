import { create } from 'zustand'
import { defaultParams, type DigitStart, type ParamValues, type StepTrace } from '../experiments/core/types'
import { digitCircleWalk } from '../experiments/digit-circle-walk'

export const PRECISIONS = [100, 1_000, 10_000, 100_000] as const

/** Playback speeds. 1x = 10 steps per second. */
export const SPEEDS = [
  { label: '1x', stepsPerSecond: 10 },
  { label: '10x', stepsPerSecond: 100 },
  { label: '100x', stepsPerSecond: 1_000 },
  { label: '1,000x', stepsPerSecond: 10_000 },
  { label: 'MAX', stepsPerSecond: Infinity },
] as const

export interface ConstantInfo {
  id: string
  symbol: string
  name: string
  value: string
  digits: string
  precision: number
  integerPartLength: number
  algorithm: string
  computeTimeMs: number
}

export type Phase = 'idle' | 'computing' | 'ready' | 'error'

export interface LabState {
  phase: Phase
  error: string | null
  constantId: string
  precision: number
  constant: ConstantInfo | null
  experimentId: string
  params: ParamValues
  digitStart: DigitStart
  playing: boolean
  finished: boolean
  currentStep: number
  totalSteps: number
  objects: number
  speedIndex: number
  /** Explanation of the current (most recent) step. */
  currentTrace: StepTrace | null
  /** Explanation of a step the user asked about; overrides currentTrace in the Inspector. */
  inspected: StepTrace | null
  scientific: boolean
  follow: boolean
  fps: number
  renderMs: number
  stepsPerSecond: number
  lastBatchMs: number
}

export const useLab = create<LabState>(() => ({
  phase: 'idle',
  error: null,
  constantId: 'pi',
  precision: 1_000,
  constant: null,
  experimentId: digitCircleWalk.id,
  params: defaultParams(digitCircleWalk.parameters),
  digitStart: 'integer',
  playing: false,
  finished: false,
  currentStep: 0,
  totalSteps: 0,
  objects: 0,
  speedIndex: 1,
  currentTrace: null,
  inspected: null,
  scientific: false,
  follow: true,
  fps: 0,
  renderMs: 0,
  stepsPerSecond: 0,
  lastBatchMs: 0,
}))
