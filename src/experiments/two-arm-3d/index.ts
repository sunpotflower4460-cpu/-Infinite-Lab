import { point } from '../../geometry/types'
import { paramsToEnv, runFormulas, traceSymbols } from '../core/Experiment'
import { add, assign, cos, modTau, mul, sin, v, type FormulaSet } from '../core/formula'
import type {
  ExperimentDefinition,
  GeometryExperiment,
  ParameterDef,
  ParamValues,
  StepContext,
  TraceSink,
} from '../core/types'

/**
 * 3D views of the Two-Arm Rotation (Experiment 04). All use exactly the same angles —
 *   θ₁ = (n × dt) mod 2π,  θ₂ = (n × dt × C) mod 2π  (reduced exactly in BigInt) —
 * and emit one point (x, y, z) per step; the 3D view joins consecutive steps with straight
 * segments, as Two-Arm joins consecutive pen positions. 2D views show the projection (x, y).
 */

const theta1 = assign('theta1', modTau([v('n'), v('dt')]), 'arm 1 angle (exact BigInt reduction)')
const theta2 = assign(
  'theta2',
  modTau([v('n'), v('dt')], true),
  'arm 2 turns C× as fast (exact BigInt reduction)',
)

/**
 * Torus: the pair (θ₁, θ₂) as a point on a torus — θ₁ around the central axis, θ₂ around the
 * tube. Each step of Two-Arm is determined by this pair (pen = r₁e^{iθ₁} + r₂e^{iθ₂}), so the
 * torus is the space the 2D pattern comes from. With C irrational the winding never closes
 * and covers the torus densely (Kronecker); near-closures follow C's convergents (22/7, 355/113).
 */
const torusFormulas: FormulaSet = [
  theta1,
  theta2,
  assign('rho', add(v('major'), mul(v('minor'), cos(v('theta2')))), 'distance from the central axis'),
  assign('x', mul(v('scale'), mul(v('rho'), cos(v('theta1')))), 'x'),
  assign('y', mul(v('scale'), mul(v('rho'), sin(v('theta1')))), 'y'),
  assign('z', mul(v('scale'), mul(v('minor'), sin(v('theta2')))), 'z'),
]

/**
 * Sphere: θ₁ as longitude and θ₂ as latitude on a sphere of radius r — the torus with R = 0.
 * θ₂ runs through a full turn, so the curve passes from pole to pole on both sides; with C
 * irrational it never closes and gradually covers the whole sphere.
 */
const sphereFormulas: FormulaSet = [
  theta1,
  theta2,
  assign('rho', mul(v('radius'), cos(v('theta2'))), 'distance from the axis (latitude θ₂)'),
  assign('x', mul(v('scale'), mul(v('rho'), cos(v('theta1')))), 'x (longitude θ₁)'),
  assign('y', mul(v('scale'), mul(v('rho'), sin(v('theta1')))), 'y (longitude θ₁)'),
  assign('z', mul(v('scale'), mul(v('radius'), sin(v('theta2')))), 'z (latitude θ₂)'),
]

/** Height: the Two-Arm pen position lifted by time, z proportional to t = n × dt. */
const heightFormulas: FormulaSet = [
  theta1,
  theta2,
  assign(
    'x',
    mul(v('scale'), add(mul(v('r1'), cos(v('theta1'))), mul(v('r2'), cos(v('theta2'))))),
    'pen x (as Two-Arm)',
  ),
  assign(
    'y',
    mul(v('scale'), add(mul(v('r1'), sin(v('theta1'))), mul(v('r2'), sin(v('theta2'))))),
    'pen y (as Two-Arm)',
  ),
  assign('z', mul(mul(v('scale'), v('rise')), mul(v('n'), v('dt'))), 'height grows with t = n × dt'),
]

const symbols = {
  theta1: 'θ₁',
  theta2: 'θ₂',
  rho: 'ρ',
  major: 'R',
  minor: 'r',
  radius: 'r',
  x: 'x[n]',
  y: 'y[n]',
  z: 'z[n]',
}

/** Stateless: each point depends only on n (and the parameters), never on earlier steps. */
class PointPath implements GeometryExperiment<null> {
  private paramEnv: Record<string, number> = {}

  constructor(private readonly formulas: FormulaSet) {}

  initialize(config: { params: ParamValues }): void {
    this.paramEnv = paramsToEnv({ ...config.params })
  }

  step(ctx: StepContext, trace?: TraceSink) {
    const env = runFormulas(
      this.formulas,
      { ...this.paramEnv, n: ctx.index, digit: ctx.digit },
      trace ? traceSymbols(symbols, ctx) : symbols,
      trace,
      { constant: ctx.constant.binary, pi: ctx.constant.pi },
    )
    return { instructions: [point(env.x!, env.y!, env.z!)], env }
  }

  snapshot(): null {
    return null
  }

  restore(): void {}

  reset(): void {}
}

const DT: ParameterDef = {
  key: 'dt',
  label: 'dt (per step)',
  type: 'number',
  default: 0.05,
  min: 0.0001,
  max: 1,
  step: 0.001,
}
const SCALE: ParameterDef = {
  key: 'scale',
  label: 'SCALE',
  type: 'number',
  default: 100,
  min: 1,
  max: 1000,
  step: 1,
}

export const twoArmTorus: ExperimentDefinition = {
  id: 'two-arm-torus',
  name: 'Two-Arm 3D: Torus',
  description:
    '{C} two-arm angles on a torus: θ₁ = t around the axis, θ₂ = {C}·t around the tube (never closes when {C} is irrational)',
  view: '3d',
  parameters: [
    DT,
    {
      key: 'major',
      label: 'TORUS R (axis → tube centre)',
      type: 'number',
      default: 1.3,
      min: 0,
      max: 5,
      step: 0.05,
    },
    { key: 'minor', label: 'TORUS r (tube)', type: 'number', default: 1, min: 0, max: 5, step: 0.05 },
    SCALE,
  ],
  formulas: torusFormulas,
  symbols,
  create: () => new PointPath(torusFormulas),
}

export const twoArmSphere: ExperimentDefinition = {
  id: 'two-arm-sphere',
  name: 'Two-Arm 3D: Sphere',
  description:
    '{C} two-arm angles on a sphere: longitude θ₁ = t, latitude θ₂ = {C}·t (the torus with R = 0; never closes when {C} is irrational)',
  view: '3d',
  parameters: [
    DT,
    { key: 'radius', label: 'SPHERE r', type: 'number', default: 2, min: 0, max: 5, step: 0.05 },
    SCALE,
  ],
  formulas: sphereFormulas,
  symbols,
  create: () => new PointPath(sphereFormulas),
}

export const twoArmHeight: ExperimentDefinition = {
  id: 'two-arm-height',
  name: 'Two-Arm 3D: Height',
  description: '{C} two-arm pen path (e^{it} + e^{i·{C}·t}) lifted by time: z ∝ t',
  view: '3d',
  parameters: [
    DT,
    { key: 'r1', label: 'ARM 1', type: 'number', default: 1, min: 0, max: 5, step: 0.05 },
    { key: 'r2', label: 'ARM 2', type: 'number', default: 1, min: 0, max: 5, step: 0.05 },
    SCALE,
    {
      key: 'rise',
      label: 'RISE (height per unit t)',
      type: 'number',
      default: 0.01,
      min: 0,
      max: 10,
      step: 0.01,
    },
  ],
  formulas: heightFormulas,
  symbols,
  create: () => new PointPath(heightFormulas),
}

/** The Two-Arm family: the same angles as the 2D pen path, on a sphere, a torus, or lifted by time. */
export const TWO_ARM_VIEWS = [
  { id: 'two-arm', label: '2D' },
  { id: twoArmSphere.id, label: 'Sphere' },
  { id: twoArmTorus.id, label: 'Torus' },
  { id: twoArmHeight.id, label: 'Height' },
] as const
