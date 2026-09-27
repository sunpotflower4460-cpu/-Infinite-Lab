import { describe, expect, it } from 'vitest'
import {
  circles,
  firstCapture,
  freePeriod,
  GOLDEN,
  K_GRID,
  RATIOS,
  limitDenominator,
  lockOfSeries,
  Medium,
  rotation,
  runCell,
  T0,
  TAU,
} from '../../../src/rhythm/models'
import tongues from '../../../src/rhythm/tongues.json'

/**
 * The textbook's laws are a port of the research code; these check the port against the numbers of
 * the report (docs/reports/2026-09-27-p16-golden.md) and the research code's own tests.
 */

describe('standard map (report A)', () => {
  it('Birkhoff averages tell circles from chaos (research test)', () => {
    const a = rotation(0, [GOLDEN], 2000)
    expect(Math.abs(a.w[0]! - GOLDEN)).toBeLessThan(1e-12)
    expect(a.err[0]!).toBeLessThan(1e-12)
    expect(rotation(2, [0.123], 4000).err[0]!).toBeGreaterThan(1e-6)
  })

  it('K = 0.95: the golden circle survives and the one near 1/π is gone; K = 0.98: none left', () => {
    const c = circles(0.95, 1601, 8000)
    expect(c.length).toBeGreaterThan(0)
    expect(Math.min(...c.map((w) => Math.abs(w - GOLDEN)))).toBeLessThan(1e-3)
    expect(Math.min(...c.map((w) => Math.abs(w - 1 / Math.PI)))).toBeGreaterThan(0.02)
    expect(circles(0.98, 1601, 8000)).toHaveLength(0)
  })

  it('A2 with the full scan: at K = 0.972 only 0.618012 and 0.381988 are left; at 0.975 none', () => {
    const c = circles(0.972)
    expect(c.length).toBeGreaterThan(0)
    for (const w of c) expect(Math.min(Math.abs(w - GOLDEN), Math.abs(w - (1 - GOLDEN)))).toBeLessThan(1e-4)
    expect(c.map((w) => w.toFixed(6))).toEqual(expect.arrayContaining(['0.618012', '0.381988']))
    expect(circles(0.975)).toHaveLength(0)
  }, 120_000)

  it('A1 on the report grid: the last K with a circle within 1e-3 of each ratio', () => {
    const last: Record<string, number> = {}
    for (const K of K_GRID) {
      const c = circles(K)
      for (const r of RATIOS) if (c.some((w) => Math.abs(w - r.w) < 1e-3)) last[r.id] = K
    }
    expect(last).toEqual({ golden: 0.972, sqrt2m1: 0.957, inve: 0.9, invsqrt2: 0.9, invpi: 0.8 })
  }, 300_000)

  it('limit_denominator', () => {
    expect(limitDenominator(Math.PI, 1000)).toEqual({ p: 355, q: 113 })
    expect(limitDenominator(1 / Math.PI, 100)).toEqual({ p: 7, q: 22 })
    expect(limitDenominator(0.5, 300)).toEqual({ p: 1, q: 2 })
  })
})

describe('one cell under a beat (report B)', () => {
  it('free period T0 = 39.49', () => {
    expect(Math.abs(freePeriod() - T0)).toBeLessThan(0.01)
  })

  it('lock_of reads exact fractions (research test)', () => {
    const exact = Array.from(
      { length: 60 },
      (_, k) => 2 * Math.PI * (k / 3) + 0.3 * Math.sin((2 * Math.PI * k) / 3),
    )
    expect(lockOfSeries(exact, 8)).toMatchObject({ locked: true, p: 1, q: 3 })
    const golden = Array.from({ length: 60 }, (_, k) => TAU * GOLDEN * k)
    const g = lockOfSeries(golden, 8)
    expect(g.locked).toBe(false)
    expect(Math.abs(g.rho - GOLDEN)).toBeLessThan(1e-9)
  })

  it('the table: γ 0.02 both free; 0.05 1/π at 1/3, golden free; 0.1 golden at 3/5', () => {
    const pi = 1 / Math.PI
    expect(runCell(pi, 0.02).locked).toBe(false)
    expect(runCell(GOLDEN, 0.02).locked).toBe(false)
    expect(runCell(pi, 0.05)).toMatchObject({ locked: true, p: 1, q: 3 })
    expect(runCell(GOLDEN, 0.05).locked).toBe(false)
    expect(runCell(pi, 0.1)).toMatchObject({ locked: true, p: 1, q: 3 })
    expect(runCell(GOLDEN, 0.1)).toMatchObject({ locked: true, p: 3, q: 5 })
    expect(runCell(1 / 3, 0.02)).toMatchObject({ locked: true, p: 1, q: 3 })
    expect(runCell(1 / 2, 0.02)).toMatchObject({ locked: true, p: 1, q: 2 })
  })

  it('B4: the first capturing γ — 1/π 0.045, golden 0.06, 1/e 0.065, 1/√2 0.07', () => {
    expect(firstCapture(1 / Math.PI)).toBeCloseTo(0.045, 6)
    expect(firstCapture(GOLDEN)).toBeCloseTo(0.06, 6)
    expect(firstCapture(1 / Math.E)).toBeCloseTo(0.065, 6)
    expect(firstCapture(Math.SQRT1_2)).toBeCloseTo(0.07, 6)
  })

  it('with no beat nothing is captured: γ = 0 is not counted as the first capture', () => {
    expect(runCell(0.5, 0).locked).toBe(true) // exactly 1/2: the test alone cannot tell
    expect(firstCapture(0.5)).toBe(0.005)
  })

  it('the shipped Arnold-tongue map (research code) agrees with this port, cell by cell', () => {
    const t = tongues as {
      s0: number
      ds: number
      ns: number
      g0: number
      dg: number
      p: number[]
      q: number[]
    }
    let checked = 0
    let same = 0
    for (let gi = 2; gi < 61; gi += 6)
      for (let si = 1; si < t.ns; si += 7) {
        const s = +(t.s0 + si * t.ds).toFixed(6)
        const g = +(t.g0 + gi * t.dg).toFixed(6)
        const r = runCell(s, g)
        const k = gi * t.ns + si
        checked++
        if (r.locked ? r.p === t.p[k] && r.q === t.q[k] : t.q[k] === 0) same++
      }
    // cells right on a tongue's edge may flip with the last bits of floating point; nearly all agree
    expect(same / checked).toBeGreaterThan(0.97)
  }, 120_000)
})

describe('the medium', () => {
  it('is deterministic, and a beat at its own tempo captures a small 2D medium', () => {
    const run = () => {
      const m = new Medium(16, 2, 1, 0.1, 3)
      m.measureFrom(20 * T0, 12)
      while (!m.measured) m.step(200)
      return m.result()
    }
    const a = run()
    expect(run()).toEqual(a)
    expect(a.captured).toBeGreaterThan(0.9)
    expect(a.at[0]!.frac).toBe('1/1')
  }, 60_000)
})
