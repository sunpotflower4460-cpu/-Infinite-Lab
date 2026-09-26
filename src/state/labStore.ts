import { create } from 'zustand'
import { defaultParams, type DigitStart, type ParamValues, type StepTrace } from '../experiments/core/types'
import { digitCircleWalk } from '../experiments/digit-circle-walk'
import { DEFAULT_SOURCES, type PlaygroundSources } from '../experiments/playground'
import type { HistoryEntry } from '../lab/history'
import type { PatternFacts } from '../analysis/patterns'
import type { ObserverAnswer } from '../ai/deepseek'

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
  | { status: 'verified' | 'mismatch'; expected: string; actual: string; note?: string }
  | { status: 'error'; message: string }

export interface LabState {
  phase: Phase
  error: string | null
  constantId: string
  precision: number
  /** The precision the user picked (Infinite Mode may extend `precision` beyond it). */
  chosenPrecision: number
  constant: ConstantInfo | null
  experimentId: string
  params: ParamValues
  /** Formula Playground: the formulas in use (always valid; drafts live in the panel). */
  formulas: PlaygroundSources
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
  /** Pattern Detection results (measured) and the step they describe. */
  patterns: { facts: PatternFacts; step: number } | null
  /** AI Observer state; answers are conjectures, never facts. */
  ai: { status: 'idle' | 'asking' | 'done' | 'error'; answer?: ObserverAnswer; error?: string }
  /** Narrow screens: which bottom sheet is open. */
  sheet: 'setup' | 'inspector' | null
  /** Compare Mode: constant of the second lane (null = off). Main lab only. */
  compareConstant: string | null
  /** Compare Mode playback (both lanes advanced in lockstep by the main thread). */
  lockstepPlaying: boolean
  /** Infinite Mode: keep computing more digits instead of stopping at the end. */
  continuous: boolean
  /** A longer computation of the constant is in progress (continuous mode). */
  extending: { from: number; to: number } | null
  /** Playing but paused at the end of the digits until the extension arrives. */
  waiting: boolean
  /** GPU geometry layer: instanced SDF (default) or tessellated Graphics. */
  layerMode: 'instanced' | 'graphics'
  /** Pixi backend actually in use ('webgl' | 'webgpu' | 'canvas'). */
  backend: string | null
  follow: boolean
  fps: number
  renderMs: number
  stepsPerSecond: number
  lastBatchMs: number
}

function initialState(): LabState {
  return {
    phase: 'idle',
    error: null,
    constantId: 'pi',
    precision: 1_000,
    chosenPrecision: 1_000,
    constant: null,
    experimentId: digitCircleWalk.id,
    formulas: DEFAULT_SOURCES,
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
    patterns: null,
    ai: { status: 'idle' },
    sheet: null,
    compareConstant: null,
    lockstepPlaying: false,
    continuous: false,
    extending: null,
    waiting: false,
    layerMode: 'instanced',
    backend: null,
    follow: true,
    fps: 0,
    renderMs: 0,
    stepsPerSecond: 0,
    lastBatchMs: 0,
  }
}

/** A lab store (one per lane: the main lab, and the second lane of Compare Mode). */
export function createLabStore() {
  return create<LabState>(() => initialState())
}
export type LabStore = ReturnType<typeof createLabStore>

/** The main lab's store. */
export const useLab = createLabStore()
