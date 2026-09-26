import { circle, line, type GeometryInstruction } from '../../geometry/types'
import { paramsToEnv, runFormulas, traceSymbols } from '../core/Experiment'
import {
  add,
  assign,
  cos,
  FormulaSyntaxError,
  mul,
  parseExpr,
  sin,
  v,
  type Formula,
  type FormulaSet,
} from '../core/formula'
import type {
  ExperimentDefinition,
  GeometryExperiment,
  ParamValues,
  StepContext,
  TraceSink,
} from '../core/types'

/**
 * Experiment 05 — Formula Playground (spec §10).
 *
 * The user writes ANGLE, RADIUS and DISTANCE; a walker turns to ANGLE, moves DISTANCE and
 * draws a circle of RADIUS where it lands. The typed text is parsed into the same formula
 * trees the built-in experiments use, so what the Inspector shows is what was executed.
 */
export const PLAYGROUND_ID = 'playground'

export type PlaygroundKey = 'angle' | 'radius' | 'distance'
export type PlaygroundSources = Record<PlaygroundKey, string>

export const PLAYGROUND_KEYS: readonly PlaygroundKey[] = ['angle', 'radius', 'distance']
export const PLAYGROUND_LABELS: Record<PlaygroundKey, string> = {
  angle: 'ANGLE',
  radius: 'RADIUS',
  distance: 'DISTANCE',
}

/** The spec's example (§10). */
export const DEFAULT_SOURCES: PlaygroundSources = {
  angle: 'digit × π / 5',
  radius: 'digit × 2',
  distance: '5',
}

/** What a formula may read: step number, digit and the walker's previous state. */
export const PLAYGROUND_VARIABLES = ['n', 'digit', 'angle_prev', 'x_prev', 'y_prev'] as const

const symbols = {
  angle_prev: 'angle[n−1]',
  x_prev: 'x[n−1]',
  y_prev: 'y[n−1]',
  x: 'x[n]',
  y: 'y[n]',
}

const NOTES: Record<PlaygroundKey, string> = {
  angle: 'your ANGLE (radians)',
  radius: 'your RADIUS',
  distance: 'your DISTANCE',
}

/** The fixed part: move by DISTANCE in direction ANGLE. */
const WALK: Formula[] = [
  assign('x', add(v('x_prev'), mul(cos(v('angle')), v('distance'))), 'move'),
  assign('y', add(v('y_prev'), mul(sin(v('angle')), v('distance'))), 'move'),
]

/** Parse one playground formula (throws FormulaSyntaxError). */
export function parsePlaygroundFormula(source: string) {
  return parseExpr(source, { variables: PLAYGROUND_VARIABLES, allowConstant: true })
}

export type PlaygroundErrors = Partial<Record<PlaygroundKey, FormulaSyntaxError>>

/** Parse all three sources; errors are reported per field instead of thrown. */
export function checkSources(sources: PlaygroundSources): PlaygroundErrors {
  const errors: PlaygroundErrors = {}
  for (const key of PLAYGROUND_KEYS) {
    try {
      parsePlaygroundFormula(sources[key])
    } catch (err) {
      if (!(err instanceof FormulaSyntaxError)) throw err
      errors[key] = err
    }
  }
  return errors
}

/** Validate untrusted sources (config import, history); throws with the first problem. */
export function parseSources(input: unknown): PlaygroundSources {
  if (typeof input !== 'object' || input === null || Array.isArray(input))
    throw new Error('formulas must be an object')
  const o = input as Record<string, unknown>
  for (const key of Object.keys(o)) {
    if (!(PLAYGROUND_KEYS as readonly string[]).includes(key)) throw new Error(`unknown formula "${key}"`)
  }
  const out = { ...DEFAULT_SOURCES }
  for (const key of PLAYGROUND_KEYS) {
    const value = o[key]
    if (value === undefined) continue
    if (typeof value !== 'string') throw new Error(`formula ${key} must be a string`)
    out[key] = value
  }
  const errors = checkSources(out)
  for (const key of PLAYGROUND_KEYS) {
    const err = errors[key]
    if (err) throw new Error(`formula ${PLAYGROUND_LABELS[key]}: ${err.message}`)
  }
  return out
}

function compile(sources: PlaygroundSources): FormulaSet {
  return [
    ...PLAYGROUND_KEYS.map((key) => assign(key, parsePlaygroundFormula(sources[key]), NOTES[key])),
    ...WALK,
  ]
}

interface WalkState {
  x: number
  y: number
  angle: number
}

class Playground implements GeometryExperiment<WalkState> {
  private params: ParamValues = {}
  private paramEnv: Record<string, number> = {}
  private state: WalkState = { x: 0, y: 0, angle: 0 }

  constructor(private readonly formulas: FormulaSet) {}

  initialize(config: { params: ParamValues }): void {
    this.params = { ...config.params }
    this.paramEnv = paramsToEnv(this.params)
    this.reset()
  }

  step(ctx: StepContext, trace?: TraceSink) {
    const env = runFormulas(
      this.formulas,
      {
        ...this.paramEnv,
        n: ctx.index,
        digit: ctx.digit,
        angle_prev: this.state.angle,
        x_prev: this.state.x,
        y_prev: this.state.y,
      },
      trace ? traceSymbols(symbols, ctx) : symbols,
      trace,
      { constant: ctx.constant.binary, pi: ctx.constant.pi },
    )
    // Stop with a precise message rather than drawing something undefined.
    for (const key of ['angle', 'distance', 'radius', 'x', 'y'] as const) {
      if (!Number.isFinite(env[key]))
        throw new Error(`step ${ctx.index}: ${key} = ${env[key]} (not a finite number; division by zero?)`)
    }
    if (env.radius! < 0) throw new Error(`step ${ctx.index}: radius = ${env.radius} (must be ≥ 0)`)
    const x = env.x!
    const y = env.y!
    const instructions: GeometryInstruction[] = []
    if (this.params.drawPath) instructions.push(line(this.state.x, this.state.y, x, y))
    instructions.push(circle(x, y, env.radius!))
    this.state = { x, y, angle: env.angle! }
    return { instructions, env }
  }

  snapshot(): WalkState {
    return { ...this.state }
  }

  restore(state: WalkState): void {
    this.state = { ...state }
  }

  reset(): void {
    this.state = { x: 0, y: 0, angle: 0 }
  }
}

/** The experiment for the given sources (throws if any does not parse). */
export function makePlaygroundDefinition(sources: PlaygroundSources): ExperimentDefinition {
  const formulas = compile(sources)
  return {
    id: PLAYGROUND_ID,
    name: 'Formula Playground',
    description: '{C} digits through your own ANGLE / RADIUS / DISTANCE formulas (walk + circle)',
    parameters: [
      {
        key: 'drawPath',
        label: 'DRAW PATH',
        type: 'boolean',
        default: true,
        description: 'Line from previous position',
      },
    ],
    formulas,
    symbols,
    create: () => new Playground(formulas),
  }
}

export const playground = makePlaygroundDefinition(DEFAULT_SOURCES)
