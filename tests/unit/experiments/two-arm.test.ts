import { describe, expect, it } from 'vitest'
import { detCos, detSin } from '../../../src/math/detmath'
import { binaryConstantFor, productModTau } from '../../../src/math/exactReduce'
import { computePi } from '../../../src/math/constants/pi'
import { makeRunner } from '../helpers'

describe('Two-Arm Rotation', () => {
  const pi = binaryConstantFor('pi', computePi)

  it('steps 1..3 are the pen positions scale·(r1·e^{iθ1} + r2·e^{iθ2}), joined by lines', () => {
    const runner = makeRunner('two-arm', 100, { dt: 0.05, r1: 1, r2: 1, scale: 100, drawArms: true })
    runner.advance(3)
    let px = 200 // t = 0: both arms along +x
    let py = 0
    for (let n = 1; n <= 3; n++) {
      const t = runner.inspect(n)
      const th1 = productModTau([n, 0.05], null, pi)
      const th2 = productModTau([n, 0.05], pi, pi)
      expect(t.env.theta1).toBe(th1)
      expect(t.env.theta2).toBe(th2)
      const x = 100 * (1 * detCos(th1) + 1 * detCos(th2))
      const y = 100 * (1 * detSin(th1) + 1 * detSin(th2))
      expect(t.instructions).toEqual([{ type: 'line', x1: px, y1: py, x2: x, y2: y }])
      // the arms are an overlay of the current step, not stored geometry
      expect(t.overlay).toHaveLength(2)
      px = x
      py = y
    }
    expect(runner.inspect(1).evaluations[1]!.symbolic).toBe('θ₂ = (n × dt × π) mod 2π')
  })

  it('with r1 = r2 the pen passes (almost) through the centre on every loop', () => {
    const runner = makeRunner('two-arm', 2000, { dt: 0.01, r1: 1, r2: 1, scale: 1 })
    runner.advance(2000) // t up to 20
    let closest = Infinity
    for (let n = 1; n <= 2000; n++) {
      const t = runner.inspect(n)
      closest = Math.min(closest, Math.hypot(t.env.x!, t.env.y!))
    }
    // loops cross the origin between samples; with dt = 0.01 the samples come within ~0.01
    expect(closest).toBeLessThan(0.02)
  })
})
