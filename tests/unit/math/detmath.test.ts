import { describe, expect, it } from 'vitest'
import { chudnovskyPi } from '../../../src/math/algorithms/chudnovsky'
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
  const xs: number[] = [
    0,
    -0,
    1e-300,
    1e-9,
    0.5,
    0.785398163,
    Math.PI / 4,
    1,
    2,
    3,
    Math.PI,
    4,
    6.283185307179586,
  ]
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

// ---------------------------------------------------------------------------
// Independent check against the *true* value, computed with exact BigInt arithmetic
// (not against Math.sin, which is itself only accurate to ~1 ulp).

const F = 256n // fraction bits of the reference result
const W = 640n // fraction bits of the working precision (π, reduction, series)

/** x as an exact fixed-point BigInt with W fraction bits. */
function toFixed(x: number): bigint {
  const dv = new DataView(new ArrayBuffer(8))
  dv.setFloat64(0, x)
  const hi = dv.getUint32(0)
  const lo = dv.getUint32(4)
  const biased = (hi >>> 20) & 0x7ff
  if (biased === 0 && (hi & 0xfffff) === 0 && lo === 0) return 0n
  const mant = (BigInt(biased === 0 ? hi & 0xfffff : (hi & 0xfffff) | 0x100000) << 32n) | BigInt(lo)
  const exp = BigInt((biased === 0 ? 1 : biased) - 1075) + W
  if (exp < 0n) throw new Error('input too small for this reference')
  const v = mant << exp
  return x < 0 ? -v : v
}

const PI_W = (() => {
  const { raw, scale } = chudnovskyPi(220) // 220 decimals ≈ 730 bits > W
  return (raw << W) / 10n ** BigInt(scale)
})()

/** True sin and cos of x, as fixed-point with F fraction bits (error ≪ 2^-200). */
function trueSinCos(x: number): [bigint, bigint] {
  // Exact reduction modulo 2π with the high-precision π, then Taylor series.
  const twoPi = 2n * PI_W
  let r = toFixed(x) % twoPi
  if (r > PI_W) r -= twoPi
  if (r < -PI_W) r += twoPi
  const r2 = (r * r) >> W
  let sinSum = 0n
  let cosSum = 0n
  let term = r // r^(2k+1)/(2k+1)!
  let cterm = 1n << W // r^(2k)/(2k)!
  for (let k = 1n; term !== 0n || cterm !== 0n; k++) {
    sinSum += term
    cosSum += cterm
    term = (-(term * r2) >> W) / (2n * k * (2n * k + 1n))
    cterm = (-(cterm * r2) >> W) / ((2n * k - 1n) * (2n * k))
  }
  return [sinSum >> (W - F), cosSum >> (W - F)]
}

/** |approx − truth| measured in ulps of approx. */
function ulpError(approx: number, truth: bigint): number {
  if (approx === 0) return truth === 0n ? 0 : Infinity
  const exp = Math.floor(Math.log2(Math.abs(approx)))
  const ulpBits = BigInt(exp - 52) + F // ulp(approx) · 2^F = 2^ulpBits
  const d = (toFixed(approx) >> (W - F)) - truth
  const diff = d < 0n ? -d : d
  return ulpBits >= 0n ? Number(diff) / Number(1n << ulpBits) : Number(diff << -ulpBits)
}

describe('deterministic sin/cos vs exact reference', () => {
  const xs: number[] = []
  for (let d = 1; d <= 9; d++) xs.push((d / 10) * 2 * Math.PI) // the Digit Circle Walk angles
  for (let k = -3000; k <= 3000; k += 7) if (k !== 0) xs.push(k / 250) // −12 … 12
  xs.push(Math.PI / 4, (3 * Math.PI) / 4, Math.PI, 2 * Math.PI, 1e-5, 0.1)
  xs.push(1e6, 1234567.891, 1e10, -1e15, 1e22, 2 ** 80)

  it('error < 1 ulp on every sample', () => {
    for (const x of xs) {
      const [s, c] = trueSinCos(x)
      expect(ulpError(detSin(x), s), `sin(${x})`).toBeLessThan(1)
      expect(ulpError(detCos(x), c), `cos(${x})`).toBeLessThan(1)
    }
  })

  it('the reference itself is sane', () => {
    const [s, c] = trueSinCos(0.5)
    expect(Number(s) / 2 ** 256).toBeCloseTo(Math.sin(0.5), 15)
    expect(Number(c) / 2 ** 256).toBeCloseTo(Math.cos(0.5), 15)
    // A value two ulps away must be detected.
    const off = detSin(0.5) + 2 * 2 ** (Math.floor(Math.log2(detSin(0.5))) - 52)
    expect(ulpError(off, s)).toBeGreaterThanOrEqual(1)
  })
})
