import { create } from 'zustand'
import { defaultParams, type DigitStart, type ParamValues, type StepTrace } from '../experiments/core/types'
import { digitCircleWalk } from '../experiments/digit-circle-walk'
import type { HistoryEntry } from '../lab/history'

export { PRECISIONS } from '../lab/config'

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

/** Result of re-running an imported / restored experiment and comparing its geometry digest. */
export type VerifyState =
  | { status: 'idle' }
  | { status: 'running'; expected: string }
  | { status: 'verified' | 'mismatch'; expected: string; actual: string }
  | { status: 'error'; message: string }

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
  /** Timeline position when looking at the past (null = following the computed head). */
  viewStep: number | null
  history: HistoryEntry[]
  verify: VerifyState
  scientific: boolean
  /** GPU geometry layer: instanced SDF (default) or tessellated Graphics. */
  layerMode: 'instanced' | 'graphics'
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
  viewStep: null,
  history: [],
  verify: { status: 'idle' },
  scientific: false,
  layerMode: 'instanced',
  follow: true,
  fps: 0,
  renderMs: 0,
  stepsPerSecond: 0,
  lastBatchMs: 0,
}))
