import { describe, expect, it } from 'vitest'
import { computePhi } from '../../../src/math/constants/phi'
import { computePi } from '../../../src/math/constants/pi'
import {
  circleTest,
  continuedFraction,
  coverageByTurn,
  crossesWall,
  GOLDEN_ANGLE_DEG,
  pentagonRatio,
  PHI,
  ROTATIONS,
} from '../../../src/golden/golden'

describe('φ and π room: the numbers it shows', () => {
  it('pentagon: diagonal / side = 2·cos(π/5) = φ', () => {
    const r = pentagonRatio()
    expect(r.ratio).toBeCloseTo(PHI, 14)
    expect(r.twoCos).toBeCloseTo(PHI, 15)
  })

  it('golden angle = 360°/φ² = 360° − 360°/φ ≈ 137.5078°', () => {
    expect(GOLDEN_ANGLE_DEG).toBeCloseTo(137.50776405003785, 10)
    expect(GOLDEN_ANGLE_DEG).toBeCloseTo(360 - 360 / PHI, 10)
  })

  it('continued fractions: π = [3; 7, 15, 1, 292, …], φ = [1; 1, 1, …]', () => {
    const pi = computePi(60)
    const cf = continuedFraction(pi.digits, pi.integerPartLength, 14)
    expect(cf.terms.slice(0, 13)).toEqual([3, 7, 15, 1, 292, 1, 1, 1, 2, 1, 3, 1, 14])
    const c355 = cf.convergents.find((c) => c.q === 113n)!
    expect(c355.p).toBe(355n)
    expect(c355.error).toBeCloseTo(2.667e-7, 9) // 355/113 − π
    expect(c355.scaled).toBeLessThan(0.004) // unusually close for its denominator
    const phi = computePhi(60)
    const g = continuedFraction(phi.digits, phi.integerPartLength, 20)
    expect(g.terms.every((a) => a === 1)).toBe(true)
    // Fibonacci ratios, never unusually close: q²·error → 1/√5 ≈ 0.447
    const last = g.convergents.at(-1)!
    expect(last.scaled).toBeCloseTo(1 / Math.sqrt(5), 3)
  })

  it('filling the flat torus: φ² fills faster than π; π completes at 113 turns; 22/7 closes', () => {
    const pi = coverageByTurn(Math.PI, 120)
    const golden = coverageByTurn(PHI * PHI, 120)
    const frac = coverageByTurn(22 / 7, 120)
    expect(golden[50]!).toBeGreaterThan(pi[50]! + 0.2)
    expect(pi[113]!).toBeGreaterThan(0.99)
    expect(pi[100]!).toBeLessThan(0.95)
    // closed after 7 turns: (almost) nothing new afterwards — 22/7 is not exact in float64,
    // so over 120 turns the line drifts by a hair and touches a cell or so
    expect(frac[120]! - frac[7]!).toBeLessThan(0.002)
    expect(frac[120]!).toBeLessThan(0.1)
  })

  it('KAM: the π−3 circle breaks first, the golden circle last', () => {
    const w = Object.fromEntries(ROTATIONS.map((r) => [r.id, r.w]))
    expect(circleTest(0.3, w.pi!).survives).toBe(true)
    expect(circleTest(0.8, w.pi!).survives).toBe(false)
    expect(circleTest(0.9, w.golden!).survives).toBe(true)
    expect(circleTest(0.95, w.e!).survives).toBe(false)
    expect(circleTest(1.0, w.golden!).survives).toBe(false)
    // near the literature values: √2 − 1 breaks at ≈ 0.957, the golden circle at ≈ 0.9716
    expect(circleTest(0.97, w.sqrt2!).survives).toBe(false)
    expect(circleTest(0.97, w.golden!).survives).toBe(true)
    expect(circleTest(0.98, w.golden!).survives).toBe(false)
    // the orbit tested really turns at the requested rate
    const g = circleTest(0.9, w.golden!)
    expect(Math.abs(g.measured[1] - w.golden!)).toBeLessThan(5e-5)
  })

  it('a surviving circle is a wall: below K ≈ 0.97 an orbit cannot climb a full turn in p', () => {
    expect(crossesWall(0.9, 200_000)).toBeNull()
    expect(crossesWall(1.2, 200_000)).not.toBeNull()
  })
})

describe('wall test in chunks', () => {
  it('chunked runs give the same crossing step as one run (deterministic)', async () => {
    const { wallSteps, WALL_START, crossesWall } = await import('../../../src/golden/golden')
    const whole = crossesWall(1.2, 200_000)!
    let s: { th: number; p: number } = WALL_START
    let done = 0
    let crossed: number | null = null
    while (crossed === null && done < 200_000) {
      const r = wallSteps(1.2, s, 7_000)
      if (r.crossed !== null) crossed = done + r.crossed
      done += 7_000
      s = r
    }
    expect(crossed).toBe(whole)
  })
})

describe('near fractions (sunflower arms)', () => {
  it('golden turn → Fibonacci denominators; π − 3 turn → 7, then 106, 113', async () => {
    const { nearFractions, GOLDEN_ANGLE_DEG } = await import('../../../src/golden/golden')
    expect(nearFractions(GOLDEN_ANGLE_DEG / 360, 7).map((f) => `${f.p}/${f.q}`)).toEqual([
      '1/2',
      '1/3',
      '2/5',
      '3/8',
      '5/13',
      '8/21',
      '13/34',
    ])
    expect(nearFractions(Math.PI - 3, 3).map((f) => `${f.p}/${f.q}`)).toEqual(['1/7', '15/106', '16/113'])
    expect(nearFractions(1 / 7, 5)).toEqual([{ p: 1, q: 7 }]) // exactly 1/7: nothing further
  })
})
