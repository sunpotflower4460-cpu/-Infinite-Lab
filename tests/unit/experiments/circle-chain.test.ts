import { describe, expect, it } from 'vitest'
import { detCos, detSin } from '../../../src/math/detmath'
import { makeRunner } from '../helpers'

const TAU = 2 * Math.PI
const mod = (a: number, b: number) => {
  const m = a % b
  return m < 0 ? m + b : m
}

describe('Circle Chain', () => {
  it('steps 1..3 follow the documented formulas (π digits 3, 1, 4; cumulative)', () => {
    const runner = makeRunner('circle-chain', 50, { radiusScale: 2, cumulative: true })
    runner.advance(3)
    let x = 0
    let y = 0
    let r = 0
    let theta = 0
    for (const [i, digit] of [3, 1, 4].entries()) {
      const t = runner.inspect(i + 1)
      const radius = digit * 2
      theta = mod(1 * theta + (digit / 10) * TAU, TAU)
      x = x + detCos(theta) * r
      y = y + detSin(theta) * r
      expect(t.env.radius).toBe(radius)
      expect(t.env.theta).toBe(theta)
      expect(t.instructions).toEqual([{ type: 'circle', x, y, radius }])
      r = radius
    }
    // the first circle sits at the origin, the second on its circumference
    expect(runner.inspect(1).instructions[0]).toMatchObject({ x: 0, y: 0, radius: 6 })
    const c2 = runner.inspect(2).instructions[0]!
    expect(c2.type === 'circle' && Math.hypot(c2.x, c2.y)).toBeCloseTo(6, 12)
  })

  it('absolute mode ignores the previous direction', () => {
    const runner = makeRunner('circle-chain', 50, { cumulative: false })
    runner.advance(3)
    expect(runner.inspect(3).env.theta).toBe((4 / 10) * TAU)
  })

  it('digit 0 gives a radius-0 circle (kept, not replaced)', () => {
    // π's first 0 is the 32nd decimal place → step 33 when reading from "3"
    const runner = makeRunner('circle-chain', 100)
    runner.advance(33)
    const t = runner.inspect(33)
    expect(t.digit).toBe(0)
    expect(t.instructions[0]).toMatchObject({ type: 'circle', radius: 0 })
  })

  it('shows its formulas', () => {
    const runner = makeRunner('circle-chain', 50)
    runner.advance(2)
    const ev = runner.inspect(2).evaluations
    expect(ev.map((e) => e.symbolic)).toEqual([
      'r[n] = digit × radiusScale',
      'θ[n] = (cumulative × θ[n−1] + digit / 10 × 2π) mod 2π',
      'x[n] = x[n−1] + cos(θ[n]) × r[n−1]',
      'y[n] = y[n−1] + sin(θ[n]) × r[n−1]',
    ])
  })
})
