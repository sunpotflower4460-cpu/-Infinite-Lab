import { describe, expect, it } from 'vitest'
import { GeometryBatchWriter, decodeRecord } from '../../../src/geometry/batch'
import { detCos, detSin } from '../../../src/math/detmath'
import { makeRunner } from '../helpers'

const TAU = 2 * Math.PI

describe('Digit Circle Walk — geometry', () => {
  it('step 1..3 follow the documented formulas exactly (π digits 3, 1, 4)', () => {
    const runner = makeRunner('digit-circle-walk', 100, { distance: 10, radiusBase: 2, radiusScale: 0.5 })
    const out = new GeometryBatchWriter()
    runner.advance(3, out)
    const batch = out.flush()
    expect(batch.count).toBe(6) // line + circle per step

    let x = 0
    let y = 0
    for (const [i, digit] of [3, 1, 4].entries()) {
      const angle = (digit / 10) * TAU
      const nx = x + detCos(angle) * 10
      const ny = y + detSin(angle) * 10
      const lineRec = decodeRecord(batch.data, i * 2)
      const circleRec = decodeRecord(batch.data, i * 2 + 1)
      expect(lineRec.step).toBe(i + 1)
      expect(lineRec.instruction).toEqual({ type: 'line', x1: x, y1: y, x2: nx, y2: ny })
      expect(circleRec.instruction).toEqual({ type: 'circle', x: nx, y: ny, radius: 2 + digit * 0.5 })
      x = nx
      y = ny
    }
  })

  it('step 1 lands at 10·(cos 0.6π, sin 0.6π)', () => {
    const runner = makeRunner('digit-circle-walk', 10)
    const t = (runner.advance(1), runner.inspect(1))
    expect(t.env.x).toBeCloseTo(-3.090169943749474, 12)
    expect(t.env.y).toBeCloseTo(9.510565162951535, 12)
  })

  it('reads the fractional part first when configured', () => {
    const runner = makeRunner('digit-circle-walk', 10, {}, 'fractional')
    runner.advance(2)
    expect(runner.inspect(1).digit).toBe(1)
    expect(runner.inspect(1).digitPlace).toBe(1)
    expect(runner.inspect(2).digit).toBe(4)
    expect(runner.totalSteps).toBe(10)
  })

  it('stops exactly when the computed digits run out', () => {
    const runner = makeRunner('digit-circle-walk', 10)
    expect(runner.totalSteps).toBe(11) // "3" + 10 decimals
    expect(runner.advance(1000)).toBe(11)
    expect(runner.finished).toBe(true)
    expect(runner.advance(1)).toBe(0)
  })

  it('inspect explains the step with substituted formulas', () => {
    const runner = makeRunner('digit-circle-walk', 100)
    runner.advance(6) // π digits: 3 1 4 1 5 9
    const t = runner.inspect(6)
    expect(t.digit).toBe(9)
    expect(t.digitPlace).toBe(5)
    expect(t.evaluations[0]!.symbolic).toBe('angle = digit / 10 × 2π')
    expect(t.evaluations[0]!.substituted).toBe('9 / 10 × 2π')
    expect(t.evaluations[0]!.value).toBe((9 / 10) * TAU)
    expect(t.evaluations[1]!.symbolic).toBe('x[n] = x[n−1] + cos(angle) × distance')
  })
})
