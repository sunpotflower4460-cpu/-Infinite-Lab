import { circle, line, type GeometryInstruction } from '../../geometry/types'
import { paramsToEnv, runFormulas, traceSymbols } from '../core/Experiment'
import { add, assign, cos, div, mod, mul, num, PI, sin, v } from '../core/formula'
import type {
  ExperimentDefinition,
  GeometryExperiment,
  ParamValues,
  StepContext,
  TraceSink,
} from '../core/types'

/**
 * Experiment 02 — Circle Chain.
 *
 * Each digit sets a circle's radius (digit × radiusScale) and a direction. The next circle's
 * centre is placed on the previous circle's circumference in that direction, so circles chain
 * into each other. A digit 0 yields a radius-0 circle, drawn honestly as a point.
 * With `cumulative`, directions add up (turning walk); otherwise each digit is an absolute direction.
 */
const formulas = [
  assign('radius', mul(v('digit'), v('radiusScale')), 'digit → radius'),
  assign(
    'theta',
    mod(
      add(mul(v('cumulative'), v('theta_prev')), mul(div(v('digit'), num(10)), mul(num(2), PI))),
      mul(num(2), PI),
    ),
    'digit → direction (cumulative = 1 adds to the previous direction)',
  ),
  assign('x', add(v('x_prev'), mul(cos(v('theta')), v('r_prev'))), 'centre on the previous circumference'),
  assign('y', add(v('y_prev'), mul(sin(v('theta')), v('r_prev'))), 'centre on the previous circumference'),
] as const

const symbols = {
  radius: 'r[n]',
  r_prev: 'r[n−1]',
  theta: 'θ[n]',
  theta_prev: 'θ[n−1]',
  x_prev: 'x[n−1]',
  y_prev: 'y[n−1]',
  x: 'x[n]',
  y: 'y[n]',
}

interface ChainState {
  x: number
  y: number
  r: number
  theta: number
}

const INITIAL: ChainState = { x: 0, y: 0, r: 0, theta: 0 }

class CircleChain implements GeometryExperiment<ChainState> {
  private params: ParamValues = {}
  private paramEnv: Record<string, number> = {}
  private state: ChainState = { ...INITIAL }

  initialize(config: { params: ParamValues }): void {
    this.params = { ...config.params }
    this.paramEnv = paramsToEnv(this.params)
    this.state = { ...INITIAL }
  }

  step(ctx: StepContext, trace?: TraceSink) {
    const s = this.state
    const env = runFormulas(
      formulas,
      {
        ...this.paramEnv,
        n: ctx.index,
        digit: ctx.digit,
        x_prev: s.x,
        y_prev: s.y,
        r_prev: s.r,
        theta_prev: s.theta,
      },
      trace ? traceSymbols(symbols, ctx) : symbols,
      trace,
    )
    const x = env.x!
    const y = env.y!
    const instructions: GeometryInstruction[] = []
    if (this.params.drawLinks) instructions.push(line(s.x, s.y, x, y))
    instructions.push(circle(x, y, env.radius!))
    this.state = { x, y, r: env.radius!, theta: env.theta! }
    return { instructions, env }
  }

  snapshot(): ChainState {
    return { ...this.state }
  }

  restore(state: ChainState): void {
    this.state = { ...state }
  }

  reset(): void {
    this.state = { ...INITIAL }
  }
}

export const circleChain: ExperimentDefinition = {
  id: 'circle-chain',
  name: 'Circle Chain',
  description: '{C} digit driven circle chain (next centre on the previous circumference)',
  parameters: [
    { key: 'radiusScale', label: 'RADIUS / DIGIT', type: 'number', default: 2, min: 0.1, max: 50, step: 0.1 },
    {
      key: 'cumulative',
      label: 'CUMULATIVE ANGLE',
      type: 'boolean',
      default: true,
      description: 'θ[n] = θ[n−1] + digit/10 × 2π (otherwise absolute)',
    },
    {
      key: 'drawLinks',
      label: 'DRAW LINKS',
      type: 'boolean',
      default: false,
      description: 'Line between centres',
    },
  ],
  formulas,
  symbols,
  create: () => new CircleChain(),
}
