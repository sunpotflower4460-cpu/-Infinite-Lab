import { describe, expect, it } from 'vitest'
import { detCos, detSin } from '../../../src/math/detmath'

/** Distance in units in the last place between two doubles. */
function ulpDiff(a: number, b: number): number {
  if (a === b) return 0
  const buf = new Float64Array([a, b])
  const i = new BigInt64Array(buf.buffer)
  const ai = i[0]! < 0n ? -(i[0]! & 0x7fffffffffffffffn) : i[0]!
  const bi = i[1]! < 0n ? -(i[1]! & 0x7fffffffffffffffn) : i[1]!
  return Number(ai > bi ? ai - bi : bi - ai)
}

// Deterministic sample inputs (no Math.random: tests must be reproducible too).
function samples(): number[] {
  const xs: number[] = [0, -0, 1e-300, 1e-9, 0.5, 0.785398163, Math.PI / 4, 1, 2, 3, Math.PI, 4, 6.283185307179586]
  for (let d = 0; d <= 9; d++) xs.push((d / 10) * 2 * Math.PI)
  let s = 0x9e3779b9
  for (let k = 0; k < 20000; k++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    xs.push(((s / 2 ** 32) * 2 - 1) * 2000)
  }
  for (const big of [1e6, 1e7, 12345678.9, 1e10, 1e22, 1e100, 1e300, -1e300, 2 ** 1000]) xs.push(big)
  return xs
}

describe('deterministic sin/cos', () => {
  it('agree with Math.sin / Math.cos within 1 ulp (V8 is also < 1 ulp)', () => {
    for (const x of samples()) {
      expect(ulpDiff(detSin(x), Math.sin(x)), `sin(${x})`).toBeLessThanOrEqual(1)
      expect(ulpDiff(detCos(x), Math.cos(x)), `cos(${x})`).toBeLessThanOrEqual(1)
    }
  })

  it('handle special values', () => {
    expect(detSin(NaN)).toBeNaN()
    expect(detCos(Infinity)).toBeNaN()
    expect(Object.is(detSin(-0), -0)).toBe(true)
    expect(detCos(0)).toBe(1)
  })

  it('pin known bit patterns (regression guard for determinism)', () => {
    // sin(π/2 rounded to double) = 1 exactly; cos(π) = −1 exactly in double.
    expect(detSin(Math.PI / 2)).toBe(1)
    expect(detCos(Math.PI)).toBe(-1)
    // sin(float64 π) = 1.2246467991473532e-16 (π − fl(π) to double precision)
    expect(detSin(Math.PI)).toBe(1.2246467991473532e-16)
  })
})
