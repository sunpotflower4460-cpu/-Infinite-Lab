import { describe, expect, it } from 'vitest'
import { GeometryBatchWriter } from '../../../src/geometry/batch'
import { MAX_PRECISION, nextPrecision, parseConfig } from '../../../src/lab/config'
import { constantDigits, makeRunner } from '../helpers'

describe('continuous computation', () => {
  it.each(['digit-circle-walk', 'circle-chain', 'pi-rotation'])(
    '%s: extending the digits mid-run gives exactly the geometry of computing them up front',
    (id) => {
      const long = makeRunner(id, 3000)
      const outLong = new GeometryBatchWriter()
      long.advance(2500, outLong)

      const short = makeRunner(id, 1000)
      const outShort = new GeometryBatchWriter()
      short.advance(5000, outShort) // stops at 1,001 steps
      expect(short.finished).toBe(true)
      short.extendDigits(constantDigits('pi', 3000).digits)
      expect(short.finished).toBe(false)
      short.advance(2500 - short.currentStep, outShort)

      const a = outLong.flush().data
      const b = outShort.flush().data
      expect(Buffer.from(a.buffer).equals(Buffer.from(b.buffer))).toBe(true)
      expect(short.inspect(2000)).toEqual(long.inspect(2000))
    },
  )

  it('refuses an extension that changes a digit or is shorter', () => {
    const runner = makeRunner('digit-circle-walk', 100)
    const digits = constantDigits('pi', 200).digits
    const tampered = digits.slice()
    tampered[50] = (tampered[50]! + 1) % 10
    expect(() => runner.extendDigits(tampered)).toThrow(/digit 50 differs/)
    expect(() => runner.extendDigits(constantDigits('pi', 50).digits)).toThrow(/shorter/)
    expect(() => runner.extendDigits(constantDigits('e', 200).digits)).toThrow(/differs/)
  })

  it('precision ladder doubles, starts at 10,000 and stops at the limit', () => {
    expect(nextPrecision(100)).toBe(10_000)
    expect(nextPrecision(10_000)).toBe(20_000)
    expect(nextPrecision(640_000)).toBe(MAX_PRECISION)
    expect(nextPrecision(MAX_PRECISION)).toBe(MAX_PRECISION)
  })

  it('stops at the browser BigInt limit (Firefox: 2^20 bits → 142,000 digits)', async () => {
    const { digitsForBits, maxBigIntBits } = await import('../../../src/math/bigintLimit')
    const firefox = digitsForBits(2 ** 20)
    expect(firefox).toBe(142_000)
    // the largest intermediate, ~2·d digits, fits in 2^20 bits with room to spare
    expect(2 * firefox * Math.log2(10)).toBeLessThan(0.91 * 2 ** 20)
    expect(nextPrecision(80_000, firefox)).toBe(firefox)
    expect(nextPrecision(firefox, firefox)).toBe(firefox)
    // V8 (this test run) has no practical limit below 1,000,000 digits
    expect(digitsForBits(maxBigIntBits())).toBeGreaterThanOrEqual(MAX_PRECISION)
  })

  it('configs accept extended precisions but not beyond the limit', () => {
    expect(parseConfig({ experiment: 'circle-chain', precision: 40_000 }).precision).toBe(40_000)
    expect(() => parseConfig({ experiment: 'circle-chain', precision: MAX_PRECISION + 1 })).toThrow(
      /precision/,
    )
    expect(() => parseConfig({ experiment: 'circle-chain', precision: 12.5 })).toThrow(/precision/)
  })
})

describe('Pi Rotation does not depend on the digit precision', () => {
  it('precision 100 (fewer than 120 decimals) gives the same headings as 3,000', () => {
    const a = makeRunner('pi-rotation', 100)
    const b = makeRunner('pi-rotation', 3000)
    a.advance(101)
    b.advance(101)
    for (const n of [1, 50, 101]) expect(a.inspect(n).env.phi).toBe(b.inspect(n).env.phi)
    a.extendDigits(constantDigits('pi', 3000).digits)
    a.advance(1000)
    b.advance(1000)
    expect(a.inspect(1101)).toEqual(b.inspect(1101))
  })
})
