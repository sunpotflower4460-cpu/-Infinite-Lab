import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { computePi } from '../../../src/math/constants/pi'
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

  it('truncates rather than rounds (digit 6 then 5 → "3.14159", not "3.14160")', () => {
    expect(computePi(5).value).toBe('3.14159')
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
})
