import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { certainTruncation, computePi, RAW_ERROR_ULPS } from '../../../src/math/constants/pi'
import { chudnovskyPi } from '../../../src/math/algorithms/chudnovsky'
import { machinPi } from '../../../src/math/algorithms/machin'
import { toDecimalString } from '../../../src/math/precision/fixed'

const REFERENCE = readFileSync(new URL('../../fixtures/pi-10000.txt', import.meta.url), 'utf8').trim()

describe('π (Chudnovsky, BigInt)', () => {
  it('matches the 50-digit value from the specification', () => {
    expect(computePi(50).value).toBe('3.14159265358979323846264338327950288419716939937510')
  })

  it('10 digits', () => {
    expect(computePi(10).value).toBe('3.1415926535')
  })

  it('truncates rather than rounds (3.1415|9… → "3.1415", not "3.1416")', () => {
    expect(computePi(4).value).toBe('3.1415')
    expect(computePi(1).value).toBe('3.1')
  })

  it.each([1, 2, 3, 13, 14, 15, 28, 100, 997, 1000, 1001, 4321, 10000])(
    'matches the external reference for %i digits',
    (n) => {
      expect(computePi(n).value).toBe(REFERENCE.slice(0, n + 2))
    },
  )

  it('agrees with an independent algorithm (Machin formula) to 5,000 digits', () => {
    expect(computePi(5000).value).toBe(toDecimalString(machinPi(5000), 5000))
  })

  it('exposes digits without the decimal point and the integer-part length', () => {
    const r = computePi(10)
    expect(r.digits).toBe('31415926535')
    expect(r.integerPartLength).toBe(1)
    expect(r.precision).toBe(10)
    expect(r.algorithm).toMatch(/Chudnovsky/)
  })

  it('rejects invalid precision', () => {
    expect(() => computePi(0)).toThrow(RangeError)
    expect(() => computePi(1.5)).toThrow(RangeError)
  })

  it.each([1, 5, 14, 15, 29, 100, 1000, 5000])(
    'raw Chudnovsky error at scale %i is well within RAW_ERROR_ULPS',
    (scale) => {
      const raw = chudnovskyPi(scale).raw
      const truth = BigInt(REFERENCE.replace('.', '').slice(0, scale + 1)) // floor(π·10^scale)
      const err = raw > truth ? raw - truth : truth - raw
      expect(err).toBeLessThanOrEqual(3n)
      expect(err).toBeLessThan(RAW_ERROR_ULPS)
    },
  )

  describe('certain truncation', () => {
    it('accepts values far from a digit boundary', () => {
      expect(certainTruncation({ raw: 314159265358979n, scale: 14 }, 5)).toBe('3.14159')
    })

    it('rejects values whose error interval straddles a digit boundary', () => {
      // 3.14999999999999 ± 16e-14 could be 3.14… or 3.15…
      expect(certainTruncation({ raw: 314999999999999n, scale: 14 }, 2)).toBeNull()
      expect(certainTruncation({ raw: 315000000000000n, scale: 14 }, 2)).toBeNull()
      expect(certainTruncation({ raw: 315000000000000n + RAW_ERROR_ULPS, scale: 14 }, 2)).toBe('3.15')
    })
  })
})
