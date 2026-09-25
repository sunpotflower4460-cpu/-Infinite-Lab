import { circle, line, point, type GeometryInstruction } from '../../geometry/types'
import { paramsToEnv, runFormulas, traceSymbols } from '../core/Experiment'
import { add, assign, constMod, cos, div, mul, num, PI, sin, v } from '../core/formula'
import type {
  ExperimentDefinition,
  GeometryExperiment,
  ParamValues,
  StepContext,
  TraceSink,
} from '../core/types'

/**
 * Experiment 03 — Pi Rotation.
 *
 * Uses the *value* of the constant C (π by default), not its digits. Every step turns by
 * C × modifier degrees and moves a fixed distance:  φ[n] = n × modifier × C (mod 360°).
 * φ[n] is computed from n directly with an exact BigInt product and reduction, so the
 * heading does not accumulate float64 rounding error over millions of steps.
 */
const formulas = [
  assign(
    'phi',
    constMod([v('n'), v('modifier')], 360),
    'heading in degrees (exact BigInt product and reduction)',
  ),
  assign('theta', mul(div(v('phi'), num(180)), PI), 'degrees → radians (float64)'),
  assign('x', add(v('x_prev'), mul(cos(v('theta')), v('distance'))), 'move'),
  assign('y', add(v('y_prev'), mul(sin(v('theta')), v('distance'))), 'move'),
] as const

const symbols = {
  phi: 'φ[n]°',
  theta: 'θ[n]',
  x_prev: 'x[n−1]',
  y_prev: 'y[n−1]',
  x: 'x[n]',
  y: 'y[n]',
}

interface RotationState {
  x: number
  y: number
}

class PiRotation implements GeometryExperiment<RotationState> {
  private params: ParamValues = {}
  private paramEnv: Record<string, number> = {}
  private state: RotationState = { x: 0, y: 0 }

  initialize(config: { params: ParamValues }): void {
    this.params = { ...config.params }
    this.paramEnv = paramsToEnv(this.params)
    this.state = { x: 0, y: 0 }
  }

  step(ctx: StepContext, trace?: TraceSink) {
    const env = runFormulas(
      formulas,
      { ...this.paramEnv, n: ctx.index, digit: ctx.digit, x_prev: this.state.x, y_prev: this.state.y },
      trace ? traceSymbols(symbols, ctx) : symbols,
      trace,
      { constant: ctx.constant.binary },
    )
    const x = env.x!
    const y = env.y!
    const r = this.params.markerRadius as number
    const instructions: GeometryInstruction[] = []
    if (this.params.drawPath) instructions.push(line(this.state.x, this.state.y, x, y))
    instructions.push(r > 0 ? circle(x, y, r) : point(x, y))
    this.state = { x, y }
    return { instructions, env }
  }

  snapshot(): RotationState {
    return { ...this.state }
  }

  restore(state: RotationState): void {
    this.state = { ...state }
  }

  reset(): void {
    this.state = { x: 0, y: 0 }
  }
}

export const piRotation: ExperimentDefinition = {
  id: 'pi-rotation',
  name: 'Pi Rotation',
  description: '{C} value driven rotation walk: turn {C} × modifier degrees per step',
  parameters: [
    { key: 'modifier', label: 'MODIFIER', type: 'number', default: 1, min: -1000, max: 1000, step: 0.001 },
    { key: 'distance', label: 'DISTANCE', type: 'number', default: 5, min: 0.1, max: 100, step: 0.1 },
    {
      key: 'markerRadius',
      label: 'MARKER RADIUS',
      type: 'number',
      default: 0,
      min: 0,
      max: 50,
      step: 0.5,
      description: '0 draws a point',
    },
    { key: 'drawPath', label: 'DRAW PATH', type: 'boolean', default: true },
  ],
  formulas,
  symbols,
  create: () => new PiRotation(),
}
