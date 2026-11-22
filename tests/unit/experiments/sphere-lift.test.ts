import { describe, expect, it } from 'vitest'
import { getExperiment } from '../../../src/experiments/registry'
import { defaultParams } from '../../../src/experiments/core/types'
import { evaluateSet, renderFormula } from '../../../src/experiments/core/formula'
import { binaryConstantFor, halfDifferenceModTau } from '../../../src/math/exactReduce'
import { computePi } from '../../../src/math/constants/pi'
import { makeRunner } from '../helpers'

const pi = binaryConstantFor('pi', computePi)
describe('Sphere Lift', () => {
  for (const constant of ['pi', 'frac-22-7'])
    for (const dt of [0.0001, 0.05, 0.137, 1])
      for (const [r1, r2] of [
        [1, 1],
        [0.2, 3],
        [0, 2],
        [2, 0],
        [0, 0],
      ]) {
        it(`preserves flat x/y and sphere identity: ${constant} dt=${dt} arms=${r1},${r2}`, () => {
          const params = { dt, r1: r1!, r2: r2!, scale: 137 }
          const flat = makeRunner('two-arm', 400, params, 'integer', constant)
          const sphere = makeRunner('two-arm-sphere-lift', 400, params, 'integer', constant)
          flat.advance(300)
          sphere.advance(300)
          for (const n of [1, 7, 22, 113, 299, 300]) {
            const a = flat.inspect(n).env,
              b = sphere.inspect(n).env
            expect(b.x).toBe(a.x)
            expect(b.y).toBe(a.y)
            const rr = (137 * (r1! + r2!)) ** 2
            expect(Math.abs(b.x! ** 2 + b.y! ** 2 + b.z! ** 2 - rr) / Math.max(1, rr)).toBeLessThan(3e-15)
            expect(sphere.inspect(n).instructions).toHaveLength(1)
          }
        })
      }
  it('uses the same AST for execution and inspection, including signed half phase', () => {
    const runner = makeRunner('two-arm-sphere-lift')
    runner.advance(100)
    expect(runner.inspect(100).evaluations[4]!.symbolic).toBe('δ = ((π − 1) × n × dt / 2) mod 2π')
    // At n=100, the half phase has gone beyond π: taking a square root of 1−cos would lose this sign.
    expect(runner.inspect(100).env.z).toBeLessThan(0)
    expect(renderFormula(getExperiment('two-arm-sphere-lift').formulas[5]!)).toContain('sqrt')
  })
  it('sphere identity remains accurate at huge n without accumulating drift', () => {
    const def = getExperiment('two-arm-sphere-lift')
    for (const n of [1e6, 1e12, Number.MAX_SAFE_INTEGER, 1e30]) {
      const env = evaluateSet(
        def.formulas,
        { ...defaultParams(def.parameters), n } as Record<string, number>,
        { constant: pi, pi },
      )
      expect(Math.abs(env.x! ** 2 + env.y! ** 2 + env.z! ** 2 - 40000) / 40000).toBeLessThan(3e-15)
    }
  })
  it('retains the sign of C−1 even for C below 1', () => {
    const c = { ...pi, raw: 1n << 447n }
    const d = halfDifferenceModTau(1, 0.1, c, pi)
    expect(d).toBeCloseTo(2 * Math.PI - 0.025, 14)
  })
})

it('matches independent 190-digit Decimal half-phase fixtures', () => {
  for (const [n, dt, expected] of [
    [1000000.0, 0.05, 0.7943372675775637],
    [1000000000000.0, 0.137, 1.2891293995207003],
    [9007199254740991.0, 0.05, 4.895889776808733],
    [1e30, 0.0001, 1.1130640424808291],
  ])
    expect(halfDifferenceModTau(n!, dt!, pi, pi)).toBeCloseTo(expected!, 14)
})
