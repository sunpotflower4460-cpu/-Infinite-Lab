import { describe, expect, it } from 'vitest'
import { bitLength, isqrt } from '../../../src/math/precision/bigint'
import { toDecimalString } from '../../../src/math/precision/fixed'

describe('isqrt', () => {
  it('is exact on small values', () => {
    for (let n = 0n; n < 2000n; n++) {
      const a = isqrt(n)
      expect(a * a <= n && (a + 1n) * (a + 1n) > n).toBe(true)
    }
  })

  it('is exact around large perfect squares', () => {
    const k = 10n ** 300n + 12345n
    expect(isqrt(k * k)).toBe(k)
    expect(isqrt(k * k - 1n)).toBe(k - 1n)
    expect(isqrt(k * k + 2n * k)).toBe(k)
  })

  it('throws on negatives', () => {
    expect(() => isqrt(-1n)).toThrow(RangeError)
  })
})

describe('bitLength', () => {
  it('matches the binary representation', () => {
    for (const n of [0n, 1n, 2n, 3n, 255n, 256n, 2n ** 100n, 2n ** 100n - 1n]) {
      expect(bitLength(n)).toBe(n === 0n ? 0 : n.toString(2).length)
    }
  })
})

describe('toDecimalString', () => {
  it('truncates and pads', () => {
    expect(toDecimalString({ raw: 314159n, scale: 5 }, 3)).toBe('3.141')
    expect(toDecimalString({ raw: 5n, scale: 3 }, 3)).toBe('0.005')
    expect(toDecimalString({ raw: -2718n, scale: 3 }, 2)).toBe('-2.71')
  })
})
