import { line, type GeometryInstruction } from '../../geometry/types'
import { detCos, detSin } from '../../math/detmath'
import { paramsToEnv, runFormulas, traceSymbols } from '../core/Experiment'
import { add, assign, cos, modTau, mul, sin, v } from '../core/formula'
import type {
  ExperimentDefinition,
  GeometryExperiment,
  ParamValues,
  StepContext,
  TraceSink,
} from '../core/types'

/**
 * Experiment 04 — Two-Arm Rotation (candidate rule for the reference video).
 *
 * Two arms are joined end to end; arm 1 turns at unit speed, arm 2 turns C times as fast.
 * The pen at the tip traces z(t) = r₁·e^{iθ₁} + r₂·e^{iθ₂},  θ₁ = t,  θ₂ = C·t,  sampled at
 * t = n·dt. Both angles are reduced mod 2π exactly in BigInt from n, so they never drift.
 * With r₁ = r₂ every loop passes through the centre; when C is irrational the curve never
 * closes (near-closures follow C's rational approximations, e.g. π ≈ 22/7, 355/113).
 * It uses the constant's value; the digits only bound the number of steps.
 */
const formulas = [
  assign('theta1', modTau([v('n'), v('dt')]), 'arm 1 angle (exact BigInt reduction)'),
  assign('theta2', modTau([v('n'), v('dt')], true), 'arm 2 turns C× as fast (exact BigInt reduction)'),
  assign('x', mul(v('scale'), add(mul(v('r1'), cos(v('theta1'))), mul(v('r2'), cos(v('theta2'))))), 'pen x'),
  assign('y', mul(v('scale'), add(mul(v('r1'), sin(v('theta1'))), mul(v('r2'), sin(v('theta2'))))), 'pen y'),
] as const

const symbols = {
  theta1: 'θ₁',
  theta2: 'θ₂',
  x: 'x[n]',
  y: 'y[n]',
}

interface PenState {
  x: number
  y: number
}

class TwoArm implements GeometryExperiment<PenState> {
  private params: ParamValues = {}
  private paramEnv: Record<string, number> = {}
  private state: PenState = { x: 0, y: 0 }

  initialize(config: { params: ParamValues }): void {
    this.params = { ...config.params }
    this.paramEnv = paramsToEnv(this.params)
    this.reset()
  }

  step(ctx: StepContext, trace?: TraceSink) {
    const env = runFormulas(
      formulas,
      { ...this.paramEnv, n: ctx.index, digit: ctx.digit },
      trace ? traceSymbols(symbols, ctx) : symbols,
      trace,
      { constant: ctx.constant.binary, pi: ctx.constant.pi },
    )
    const x = env.x!
    const y = env.y!
    const instructions: GeometryInstruction[] = [line(this.state.x, this.state.y, x, y)]
    let overlay: GeometryInstruction[] | undefined
    if (this.params.drawArms && trace) {
      // only traced steps (current / inspected) are ever highlighted
      const s = this.paramEnv.scale!
      const ex = s * this.paramEnv.r1! * detCos(env.theta1!)
      const ey = s * this.paramEnv.r1! * detSin(env.theta1!)
      overlay = [line(0, 0, ex, ey), line(ex, ey, x, y)]
    }
    this.state = { x, y }
    return { instructions, env, overlay }
  }

  snapshot(): PenState {
    return { ...this.state }
  }

  restore(state: PenState): void {
    this.state = { ...state }
  }

  reset(): void {
    // pen position at t = 0: both arms along +x
    const s = (this.paramEnv.scale ?? 0) * ((this.paramEnv.r1 ?? 0) + (this.paramEnv.r2 ?? 0))
    this.state = { x: s, y: 0 }
  }
}

export const twoArm: ExperimentDefinition = {
  id: 'two-arm',
  name: 'Two-Arm Rotation',
  description: '{C} two-arm rotation: arm 2 turns {C}× as fast as arm 1 (pen traces e^{it} + e^{i·{C}·t})',
  parameters: [
    { key: 'dt', label: 'dt (per step)', type: 'number', default: 0.05, min: 0.0001, max: 1, step: 0.001 },
    { key: 'r1', label: 'ARM 1', type: 'number', default: 1, min: 0, max: 5, step: 0.05 },
    { key: 'r2', label: 'ARM 2', type: 'number', default: 1, min: 0, max: 5, step: 0.05 },
    { key: 'scale', label: 'SCALE', type: 'number', default: 100, min: 1, max: 1000, step: 1 },
    {
      key: 'drawArms',
      label: 'SHOW ARMS',
      type: 'boolean',
      default: true,
      description: 'Arms at the current step',
    },
  ],
  formulas,
  symbols,
  create: () => new TwoArm(),
}
