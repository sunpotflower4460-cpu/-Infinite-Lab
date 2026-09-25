import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { binaryConstant, constantProductMod, decomposeDouble } from '../../../src/math/exactReduce'
import { piDigits } from '../helpers'

const PI_REF = readFileSync(new URL('../../fixtures/pi-10000.txt', import.meta.url), 'utf8').trim()

/** (n × π) mod 360 from 1,000 reference digits, as a double (independent of exactReduce). */
function reference(n: bigint): number {
  const D = 1000
  const piScaled = BigInt(PI_REF.replace('.', '').slice(0, D + 1)) // π·10^D (floor)
  const m = 360n * 10n ** BigInt(D)
  const r = (n * piScaled) % m
  // keep 30 significant decimals and let Number() round
  return Number(`${r / 10n ** BigInt(D)}.${(r % 10n ** BigInt(D)).toString().padStart(D, '0').slice(0, 30)}`)
}

describe('decomposeDouble', () => {
  it('is exact', () => {
    for (const x of [1, -1, 0.1, 3.5, 1e-300, 5e-324, 1e300, -123.456]) {
      const { mant, exp } = decomposeDouble(x)
      // mant · 2^exp reconstructed with exact scaling
      expect(Number(mant) * 2 ** exp).toBe(x)
    }
  })
})

describe('constantProductMod (n × C mod 360, BigInt)', () => {
  const { digits, integerPartLength } = piDigits(200)
  const C = binaryConstant(digits, integerPartLength)

  it.each([1n, 2n, 7n, 114n, 1000n, 123456n, 1_000_000n, 99_999_999n, 10n ** 12n])(
    'n = %s matches an independent 1,000-digit reference',
    (n) => {
      const got = constantProductMod([Number(n)], C, 360)
      const want = reference(n)
      expect(Math.abs(got - want)).toBeLessThanOrEqual(Math.abs(want) * 2 ** -51)
    },
  )

  it('takes float64 factors exactly (0.1 means the double nearest 0.1)', () => {
    // fl(0.1) = 3602879701896397 / 2^55, so 10 × fl(0.1) = 1 + 2^-54 (slightly above 1).
    // The exact product π·(1 + 2^-54) = π + 1.74e-16 rounds to the double just above fl(π):
    const got = constantProductMod([10, 0.1], C, 360)
    expect(got).toBe(3.1415926535897936)
    expect(got).toBeGreaterThan(constantProductMod([1], C, 360))
    // …whereas multiplying in float64 first would lose that: 10 * 0.1 === 1
    expect(10 * 0.1).toBe(1)
  })

  it('does not drift, unlike repeated float64 addition', () => {
    let naive = 0
    for (let i = 0; i < 1_000_000; i++) naive = (naive + Math.PI) % 360
    const exact = constantProductMod([1_000_000], C, 360)
    const want = reference(1_000_000n)
    expect(Math.abs(exact - want)).toBeLessThan(1e-12)
    expect(Math.abs(naive - want)).toBeGreaterThan(1e-9) // float64 accumulation has drifted
  })

  it('handles negatives and zero', () => {
    expect(constantProductMod([0], C, 360)).toBe(0)
    const r = constantProductMod([-1], C, 360)
    expect(r).toBeCloseTo(360 - Math.PI, 12)
  })
})
