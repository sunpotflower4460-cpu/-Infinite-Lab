import { describe, expect, it } from 'vitest'
import { binaryConstant, constantProductMod } from '../../../src/math/exactReduce'
import { detCos, detSin } from '../../../src/math/detmath'
import { constantDigits, makeRunner } from '../helpers'

describe('Pi Rotation', () => {
  it('heading at step n is (n × modifier × π) mod 360, independent of earlier steps', () => {
    const runner = makeRunner('pi-rotation', 5000, { modifier: 1, distance: 5 })
    runner.advance(4000)
    const { digits, integerPartLength } = constantDigits('pi', 5000)
    const C = binaryConstant(digits, integerPartLength)
    for (const n of [1, 2, 115, 1000, 3999, 4000]) {
      expect(runner.inspect(n).env.phi).toBe(constantProductMod([n, 1], C, 360))
    }
  })

  it('step 1 moves 5 units at π degrees', () => {
    const runner = makeRunner('pi-rotation', 100, { modifier: 1, distance: 5, markerRadius: 0 })
    runner.advance(1)
    const t = runner.inspect(1)
    const theta = (t.env.phi! / 180) * Math.PI
    expect(t.env.phi).toBeCloseTo(Math.PI, 14)
    expect(t.instructions).toEqual([
      { type: 'line', x1: 0, y1: 0, x2: detCos(theta) * 5, y2: detSin(theta) * 5 },
      { type: 'point', x: detCos(theta) * 5, y: detSin(theta) * 5 },
    ])
  })

  it('uses the selected constant (e) and shows its symbol', () => {
    const runner = makeRunner('pi-rotation', 100, {}, 'integer', 'e')
    runner.advance(2)
    const t = runner.inspect(2)
    expect(t.env.phi).toBeCloseTo(2 * Math.E, 13)
    expect(t.evaluations[0]!.symbolic).toBe('φ[n]° = (n × modifier × e) mod 360')
    expect(t.evaluations[0]!.substituted).toBe('(2 × 1 × e) mod 360')
  })
})
