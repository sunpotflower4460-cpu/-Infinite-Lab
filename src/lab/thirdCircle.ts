import { COMPUTE_SYNC } from '../math/constants'
import { binaryConstantFor } from '../math/exactReduce'
import {
  add,
  assign,
  cos,
  evaluateSet,
  modTau,
  mul,
  neg,
  renderFormula,
  sin,
  v,
  type FormulaSet,
} from '../experiments/core/formula'
import type { ParamValues } from '../experiments/core/types'
import type { Presentation } from './presentation'

export type Point3 = [number, number, number]
export interface ThirdCircleConfig {
  constantId: string
  dt: number
  radius: number
}
export interface ThirdCircleFrame {
  step: number
  center: Point3
  elbow: Point3
  major: number
  minor: number
  sample: ReturnType<typeof thirdCircleSample>
}
/** e_phi=(-sin u,cos u,0): perpendicular to the second circle's radial/z plane. */
export const THIRD_CIRCLE_FORMULAS: FormulaSet = [
  assign('u', modTau([v('n'), v('dt')])),
  assign('w', modTau([v('n'), v('dt')], true, true)),
  assign('su', sin(v('u'))),
  assign('cu', cos(v('u'))),
  assign('cw', cos(v('w'))),
  assign('sw', sin(v('w'))),
  assign('dx', neg(mul(mul(v('a'), v('cw')), v('su')))),
  assign('dy', mul(mul(v('a'), v('cw')), v('cu'))),
  assign('dz', mul(v('a'), v('sw'))),
  assign('qx', add(v('px'), v('dx'))),
  assign('qy', add(v('py'), v('dy'))),
  assign('qz', add(v('pz'), v('dz'))),
]
export function thirdCircleConfig(
  constantId: string,
  params: ParamValues,
  p: Presentation,
): ThirdCircleConfig {
  return {
    constantId,
    dt: Number(params.dt),
    radius: Number(params.scale) * Number(params.r2) * p.thirdRadius,
  }
}
export function thirdCircleSample(n: number, point: Point3, config: ThirdCircleConfig) {
  const compute = COMPUTE_SYNC[config.constantId]
  if (!compute) throw new Error('Unknown third-circle constant')
  const e = evaluateSet(
    THIRD_CIRCLE_FORMULAS,
    {
      n,
      dt: config.dt,
      a: config.radius,
      px: point[0],
      py: point[1],
      pz: point[2],
    },
    {
      constant: binaryConstantFor(config.constantId, compute),
      pi: binaryConstantFor('pi', COMPUTE_SYNC.pi!),
    },
  )
  return {
    point: (config.radius === 0 ? [...point] : [e.qx!, e.qy!, e.qz!]) as Point3,
    radial: [e.cu!, e.su!, 0] as Point3,
    tangent: [-e.su!, e.cu!, 0] as Point3,
    angle: e.w!,
    radius: config.radius,
  }
}
export function thirdCircleFormulaLines(symbol = 'C'): string[] {
  return THIRD_CIRCLE_FORMULAS.map((f) =>
    renderFormula(f, { C: symbol, px: 'Pₓ', py: 'Pᵧ', pz: 'P𝓏', a: 'R₃', qx: 'Qₓ', qy: 'Qᵧ', qz: 'Q𝓏' }),
  )
}
