import { describe, expect, it } from 'vitest'
import { evaluateSet } from '../../../src/experiments/core/formula'
import { getExperiment } from '../../../src/experiments/registry'
import { torusKind } from '../../../src/experiments/two-arm-3d/torus'
import { COMPUTE_SYNC } from '../../../src/math/constants'
import { binaryConstantFor } from '../../../src/math/exactReduce'
import { transformPoint } from '../../../src/lab/presentation'
import references from '../../fixtures/torus-reference.json'
import { makeRunner } from '../helpers'

const def = getExperiment('two-arm-torus')
const pi = binaryConstantFor('pi', COMPUTE_SYNC.pi!)

/** This implicit identity also covers the negative-rho sheet of a spindle torus. */
function torusError(x: number, y: number, z: number, R: number, r: number): number {
  const q = x * x + y * y + z * z + R * R - r * r
  return Math.abs(q * q - 4 * R * R * (x * x + y * y)) / Math.max(1, (R + r) ** 4)
}

describe('torus surface and the two flows at all parameter regimes', () => {
  for (const constant of ['pi', 'frac-22-7'])
    for (const dt of [0.0001, 0.05, 0.137, 1])
      for (const [r1, r2] of [
        [1.3, 1],
        [1, 1],
        [0.25, 2],
        [0, 2],
        [2, 0],
        [0, 0],
      ] as const) {
        it(`${constant}, dt=${dt}, R=${r1}, r=${r2}`, () => {
          const binary = binaryConstantFor(constant, COMPUTE_SYNC[constant]!)
          for (const n of [0, 1, 7, 300, 1000, 10000, 1e6, 1e12, Number.MAX_SAFE_INTEGER, 1e30]) {
            const scale = 137
            const env = evaluateSet(def.formulas, { n, dt, r1, r2, scale }, { constant: binary, pi })
            const [x, y, z] = [env.x!, env.y!, env.z!]
            expect([x, y, z].every(Number.isFinite)).toBe(true)
            expect(torusError(x, y, z, r1 * scale, r2 * scale)).toBeLessThan(4e-15)
            if (r1 >= r2) {
              // Ring and horn: Euclidean distance to the major circle = tube radius.
              const residual = (Math.hypot(x, y) - r1 * scale) ** 2 + z * z - (r2 * scale) ** 2
              expect(Math.abs(residual) / Math.max(1, ((r1 + r2) * scale) ** 2)).toBeLessThan(4e-15)
            }
            for (const mode of ['mirror', 'yin-yang'] as const) {
              const q = transformPoint(x, y, z, mode)
              expect(torusError(...q, r1 * scale, r2 * scale)).toBeLessThan(4e-15)
              if (mode === 'yin-yang') expect([x + q[0], y + q[1], z + q[2]]).toEqual([0, 0, 0])
              else expect(q).toEqual([-x, y, z])
            }
          }
        })
      }
})

it('agrees with independent 190-digit Decimal angle and coordinate references at huge n', () => {
  for (const ref of references) {
    const ctx = { constant: binaryConstantFor(ref.constant, COMPUTE_SYNC[ref.constant]!), pi }
    const env = evaluateSet(
      def.formulas,
      { n: ref.n, dt: ref.dt, r1: ref.r1, r2: ref.r2, scale: ref.scale },
      ctx,
    )
    expect(Math.abs(env.theta1! - ref.theta1)).toBeLessThan(1e-15)
    expect(Math.abs(env.theta2! - ref.theta2)).toBeLessThan(1e-15)
    for (const key of ['x', 'y', 'z'] as const)
      expect(Math.abs(env[key]! - ref[key]) / Math.max(1, ref.scale * (ref.r1 + ref.r2))).toBeLessThan(4e-15)
  }
})

it('retains the two angles and step correspondence while making an explicitly different x/y map', () => {
  const a = makeRunner('two-arm', 400, { r1: 1.3, r2: 1 })
  const b = makeRunner('two-arm-torus', 400, { r1: 1.3, r2: 1 })
  a.advance(300)
  b.advance(300)
  for (const n of [1, 22, 113, 300]) {
    const flat = a.inspect(n),
      torus = b.inspect(n)
    expect(torus.env.theta1).toBe(flat.env.theta1)
    expect(torus.env.theta2).toBe(flat.env.theta2)
    expect(torus.step).toBe(flat.step)
    expect(torus.instructions).toHaveLength(1)
    expect(torus.env.x).not.toBe(flat.env.x)
    expect(torus.env.y).not.toBe(flat.env.y)
  }
  expect(b.inspect(300).evaluations[4]!.symbolic).toBe('y[n] = scale × (ρ × sin(θ₁))')
})

it('classifies holes and degeneracies by the supplied radii without changing them', () => {
  for (const [R, r, kind] of [
    [1.3, 1, 'ring'],
    [1, 1, 'horn'],
    [1, 2, 'spindle'],
    [0, 2, 'sphere'],
    [2, 0, 'circle'],
    [0, 0, 'point'],
  ] as const)
    expect(torusKind(R, r)).toBe(kind)
  for (const [R, r] of [
    [-1, 1],
    [1, NaN],
    [Infinity, 1],
  ])
    expect(() => torusKind(R!, r!)).toThrow()
})
