import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { computeE } from '../../../src/math/constants/e'
import { computePhi, phiFixed } from '../../../src/math/constants/phi'
import { computeSqrt2, sqrt2Fixed } from '../../../src/math/constants/sqrt2'
import { eFixed } from '../../../src/math/algorithms/eSeries'
import { CONSTANTS, isRational } from '../../../src/math/constants'
import { computeRational } from '../../../src/math/constants/rational'
import { makeRunner } from '../helpers'
import type { ConstantResult } from '../../../src/math/constants/types'
import type { FixedDecimal } from '../../../src/math/precision/fixed'

const ref = (name: string) =>
  readFileSync(new URL(`../../fixtures/${name}-10000.txt`, import.meta.url), 'utf8').trim()

const CASES: [string, (p: number) => ConstantResult, (s: number) => FixedDecimal, string][] = [
  ['e', computeE, eFixed, '2.71828182845904523536028747135266249775724709369995'],
  ['sqrt2', computeSqrt2, sqrt2Fixed, '1.41421356237309504880168872420969807856967187537694'],
  ['phi', computePhi, phiFixed, '1.61803398874989484820458683436563811772030917980576'],
]

describe.each(CASES)('%s', (name, compute, raw, first50) => {
  const REFERENCE = ref(name)

  it('first 50 decimals', () => {
    expect(compute(50).value).toBe(first50)
  })

  it.each([1, 2, 3, 10, 99, 100, 1000, 4321, 10000])('matches the reference for %i digits', (n) => {
    expect(compute(n).value).toBe(REFERENCE.slice(0, n + 2))
  })

  it.each([1, 7, 30, 500, 5000])('raw error at scale %i is ≤ 2 ulp', (scale) => {
    const truth = BigInt(REFERENCE.replace('.', '').slice(0, scale + 1))
    const d = raw(scale).raw - truth
    expect(d < 0n ? -d : d).toBeLessThanOrEqual(2n)
  })

  it('reports digits and integer part', () => {
    const r = compute(5)
    expect(r.integerPartLength).toBe(1)
    expect(r.digits).toBe(r.value.replace('.', ''))
  })
})

describe('algebraic self-checks (independent of any reference)', () => {
  it('√2: raw² ≤ 2·10^2s < (raw+1)²', () => {
    const s = 3000
    const r = sqrt2Fixed(s).raw
    const two = 2n * 10n ** BigInt(2 * s)
    expect(r * r <= two && (r + 1n) * (r + 1n) > two).toBe(true)
  })

  it('φ² = φ + 1 within rounding', () => {
    const s = 3000
    const r = phiFixed(s).raw
    const one = 10n ** BigInt(s)
    const lhs = r * r
    const rhs = (r + one) * one
    const d = lhs > rhs ? lhs - rhs : rhs - lhs
    expect(d < 4n * one).toBe(true) // |φ²−φ−1|·10^2s bounded by the 1-ulp error of r
  })
})

describe('registry', () => {
  it('lists π, e, √2, φ, then the rational comparison values', () => {
    expect(Object.values(CONSTANTS).map((c) => c.symbol)).toEqual([
      'π',
      'e',
      '√2',
      'φ',
      '22/7',
      '355/113',
      '3.14',
    ])
    expect(Object.keys(CONSTANTS).filter(isRational)).toEqual(['frac-22-7', 'frac-355-113', 'dec-3-14'])
  })
})

describe('rational comparison values', () => {
  it('22/7, 355/113 and 3.14 are exact long divisions', () => {
    expect(computeRational(22n, 7n, 13).value).toBe('3.1428571428571')
    expect(computeRational(355n, 113n, 10).value).toBe('3.1415929203')
    expect(computeRational(157n, 50n, 6).value).toBe('3.140000')
    // 22/7 repeats with period 6 forever
    const d = computeRational(22n, 7n, 6000).digits.slice(1)
    expect(d).toBe('142857'.repeat(1000))
    expect(computeRational(1n, 8n, 3)).toMatchObject({ value: '0.125', digits: '0125', integerPartLength: 1 })
  })

  it('with 22/7 the Two-Arm speed ratio is exactly 22/7 (the curve closes after 7 turns)', () => {
    const r = makeRunner('two-arm', 100, { dt: 0.05 }, 'integer', 'frac-22-7')
    r.advance(10)
    expect(r.inspect(1).evaluations[1]!.symbolic).toBe('θ₂ = (n × dt × 22/7) mod 2π')
    // θ₂ − (22/7)·θ₁ ≡ 0 (mod 2π) at every step: the ratio is exactly 22/7
    for (let n = 1; n <= 10; n++) {
      const t = r.inspect(n)
      const d = t.env.theta2! - (22 / 7) * (n * 0.05)
      const k = Math.round(d / (2 * Math.PI))
      expect(Math.abs(d - k * 2 * Math.PI)).toBeLessThan(1e-12)
    }
  })
})
