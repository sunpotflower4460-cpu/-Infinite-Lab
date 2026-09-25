import { circle, line, type GeometryInstruction } from '../../geometry/types'
import { paramsToEnv, runFormulas } from '../core/Experiment'
import { add, assign, cos, div, mul, num, PI, sin, v } from '../core/formula'
import type { ExperimentDefinition, GeometryExperiment, ParamValues } from '../core/types'

/**
 * Experiment 01 — Digit Circle Walk.
 *
 * Each digit d chooses one of ten directions (d/10 of a full turn). A walker moves a fixed
 * distance in that direction and a circle is drawn where it lands. This is one *arbitrary*
 * rule for turning digits into geometry — not "the shape of π".
 */
const formulas = [
  assign('angle', mul(div(v('digit'), num(10)), mul(num(2), PI)), 'digit → direction (one of 10)'),
  assign('x', add(v('x_prev'), mul(cos(v('angle')), v('distance'))), 'move'),
  assign('y', add(v('y_prev'), mul(sin(v('angle')), v('distance'))), 'move'),
  assign('radius', add(v('radiusBase'), mul(v('digit'), v('radiusScale'))), 'digit → circle radius'),
] as const

const symbols = {
  x_prev: 'x[n−1]',
  y_prev: 'y[n−1]',
  x: 'x[n]',
  y: 'y[n]',
}

interface WalkState {
  x: number
  y: number
}

class DigitCircleWalk implements GeometryExperiment<WalkState> {
  private params: ParamValues = {}
  private paramEnv: Record<string, number> = {}
  private state: WalkState = { x: 0, y: 0 }

  initialize(config: { params: ParamValues }): void {
    this.params = { ...config.params }
    this.paramEnv = paramsToEnv(this.params)
    this.state = { x: 0, y: 0 }
  }

  step(ctx: { index: number; digit: number }, trace?: Parameters<GeometryExperiment['step']>[1]) {
    const env = runFormulas(
      formulas,
      { ...this.paramEnv, n: ctx.index, digit: ctx.digit, x_prev: this.state.x, y_prev: this.state.y },
      symbols,
      trace,
    )
    const x = env.x!
    const y = env.y!
    const instructions: GeometryInstruction[] = []
    if (this.params.drawPath) instructions.push(line(this.state.x, this.state.y, x, y))
    instructions.push(circle(x, y, env.radius!))
    this.state = { x, y }
    return { instructions, env }
  }

  snapshot(): WalkState {
    return { ...this.state }
  }

  restore(state: WalkState): void {
    this.state = { ...state }
  }

  reset(): void {
    this.state = { x: 0, y: 0 }
  }
}

export const digitCircleWalk: ExperimentDefinition = {
  id: 'digit-circle-walk',
  name: 'Digit Circle Walk',
  description: 'π digit driven circle walk',
  parameters: [
    { key: 'distance', label: 'DISTANCE', type: 'number', default: 10, min: 0.5, max: 100, step: 0.5 },
    { key: 'radiusBase', label: 'RADIUS BASE', type: 'number', default: 2, min: 0, max: 50, step: 0.5 },
    {
      key: 'radiusScale',
      label: 'RADIUS / DIGIT',
      type: 'number',
      default: 0.5,
      min: 0,
      max: 10,
      step: 0.1,
    },
    { key: 'drawPath', label: 'DRAW PATH', type: 'boolean', default: true, description: 'Line from previous position' },
  ],
  formulas,
  symbols,
  create: () => new DigitCircleWalk(),
}
