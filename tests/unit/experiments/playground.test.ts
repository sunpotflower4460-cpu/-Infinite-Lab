import { describe, expect, it } from 'vitest'
import { modTau, mul, num, evaluate, renderFormula, v } from '../../../src/experiments/core/formula'
import {
  DEFAULT_SOURCES,
  makePlaygroundDefinition,
  type PlaygroundSources,
} from '../../../src/experiments/playground'
import { resolveExperiment } from '../../../src/experiments/registry'
import { GeometryBatchWriter, decodeRecord } from '../../../src/geometry/batch'
import { detCos, detSin } from '../../../src/math/detmath'
import { binaryConstantFor } from '../../../src/math/exactReduce'
import { COMPUTE_SYNC } from '../../../src/math/constants'
import { makeRunner, piDigits } from '../helpers'

const run = (formulas: PlaygroundSources, steps: number, constant = 'pi') => {
  const runner = makeRunner(
    'playground',
    Math.max(1000, steps),
    { drawPath: false },
    'integer',
    constant,
    formulas,
  )
  const w = new GeometryBatchWriter()
  runner.advance(steps, w)
  const batch = w.flush()
  return { runner, records: Array.from({ length: batch.count }, (_, i) => decodeRecord(batch.data, i)) }
}

describe('Formula Playground', () => {
  it('runs the spec example: ANGLE = digit × π / 5, RADIUS = digit × 2, DISTANCE = 5', () => {
    const digits = piDigits(1000).digits
    const { records } = run(DEFAULT_SOURCES, 50)
    let x = 0
    let y = 0
    for (let i = 0; i < 50; i++) {
      const d = digits[i]!
      const angle = (d * Math.PI) / 5
      x = x + detCos(angle) * 5
      y = y + detSin(angle) * 5
      expect(records[i]).toEqual({ step: i + 1, instruction: { type: 'circle', x, y, radius: d * 2 } })
    }
  })

  it('reads the previous angle, so directions can accumulate', () => {
    const { runner } = run({ angle: 'angle_prev + digit × π / 5', radius: '1', distance: '2' }, 3)
    const t1 = runner.inspect(1).env
    const t3 = runner.inspect(3).env
    const d = piDigits(10).digits
    expect(t1.angle).toBe((d[0]! * Math.PI) / 5)
    expect(t3.angle).toBe(runner.inspect(2).env.angle! + (d[2]! * Math.PI) / 5)
  })

  it('reduces n × C exactly when asked for (… × C) mod 2π', () => {
    const { runner } = run({ angle: '(n × 0.1 × C) mod 2π', radius: '1', distance: '5' }, 3000, 'e')
    const ctx = {
      constant: binaryConstantFor('e', COMPUTE_SYNC.e!),
      pi: binaryConstantFor('pi', COMPUTE_SYNC.pi!),
    }
    expect(runner.inspect(2999).env.angle).toBe(evaluate(modTau([v('n'), num(0.1)], true), { n: 2999 }, ctx))
    // … which is not what float64 would give
    expect(runner.inspect(2999).env.angle).not.toBe((2999 * 0.1 * Math.E) % (2 * Math.PI))
  })

  it('shows exactly the executed formulas', () => {
    const sources = { angle: '(n × C) mod 360 / 57.3', radius: 'abs(sin(n))', distance: 'sqrt(digit)' }
    const def = makePlaygroundDefinition(sources)
    const { runner } = run(sources, 5)
    const trace = runner.inspect(5)
    expect(trace.evaluations.map((e) => e.symbolic)).toEqual(
      def.formulas.map((f) => renderFormula(f, { ...def.symbols, C: 'π' })),
    )
    expect(trace.evaluations[0]!.symbolic).toBe('angle = (n × π) mod 360 / 57.3')
    expect(trace.evaluations[2]!.symbolic).toBe('distance = sqrt(digit)')
    expect(trace.evaluations[3]!.symbolic).toBe('x[n] = x[n−1] + cos(angle) × distance')
  })

  it('stops with a precise error instead of drawing undefined values', () => {
    expect(() => run({ angle: '0', radius: '1', distance: '1 / (digit − digit)' }, 3)).toThrow(
      /step 1: distance = (Infinity|NaN)/,
    )
    expect(() => run({ angle: '0', radius: 'digit − 5', distance: '1' }, 20)).toThrow(
      /radius = -\d+ \(must be ≥ 0\)/,
    )
  })

  it('builds the definition from the formulas (and reuses it while they do not change)', () => {
    const a = resolveExperiment('playground', DEFAULT_SOURCES)
    expect(resolveExperiment('playground', { ...DEFAULT_SOURCES })).toBe(a)
    const b = resolveExperiment('playground', { ...DEFAULT_SOURCES, distance: '6' })
    expect(b).not.toBe(a)
    expect(b.formulas[2]!.expr).toEqual(num(6))
    expect(a.formulas[0]!.expr).toEqual({
      kind: 'bin',
      op: '/',
      left: mul(v('digit'), { kind: 'pi' }),
      right: num(5),
    })
    expect(() => resolveExperiment('playground', { ...DEFAULT_SOURCES, angle: 'n ×' })).toThrow(
      /ends too early/,
    )
  })
})
