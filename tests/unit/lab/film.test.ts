import { describe, expect, it } from 'vitest'
import { filmNumbers, loadFilmInfo, PI_CONVERGENTS, stageFor } from '../../../src/film/explain'
import { filmSpeed } from '../../../src/app/filmSpeed'

describe('Film explanations', () => {
  it('counts the turns of both arms; their ratio is π', () => {
    const { t, turns1, turns2 } = filmNumbers(1000, 0.05)
    expect(t).toBe(50)
    expect(turns1).toBeCloseTo(50 / (2 * Math.PI), 12)
    expect(turns2).toBe(25)
    expect((turns2 / turns1).toFixed(5)).toBe('3.14159')
    expect(filmNumbers(0, 0.05).turns1).toBe(0)
  })

  it('tells the stage that matches the picture', () => {
    expect(stageFor(0.5).id).toBe('start')
    expect(stageFor(3).id).toBe('drift')
    expect(stageFor(7).id).toBe('flower')
    expect(stageFor(30).id).toBe('mesh')
    expect(stageFor(113).id).toBe('fill')
    // the numbers the plain-language texts quote
    expect(stageFor(0).text).toContain('3.14159')
    expect((7 * Math.PI).toFixed(2)).toBe('21.99')
    expect(stageFor(7).text).toContain('21.99')
    expect(stageFor(7).text).toContain('22 − 7 = 15')
    expect((355 / 113).toFixed(7)).toBe('3.1415929')
    expect(stageFor(200).text).toContain('3.1415929')
  })

  it('lists convergents of π, each closer than the last, with (p − q)-fold symmetry', () => {
    let prev = Infinity
    for (const { p, q } of PI_CONVERGENTS) {
      const err = Math.abs(Math.PI - p / q)
      expect(err).toBeLessThan(prev)
      prev = err
      // z(t) = e^{it} + e^{i(p/q)t}: shifting t by s = 2πq/(p−q) rotates the curve by s,
      // so the curve has (p − q)-fold symmetry (gcd(q, p − q) = gcd(q, p) = 1)
      const s = (2 * Math.PI * q) / (p - q)
      const z = (t: number) => [Math.cos(t) + Math.cos((p / q) * t), Math.sin(t) + Math.sin((p / q) * t)]
      if (q < 1000) {
        for (const t of [0.3, 1.7, 4.2]) {
          const [x, y] = z(t)
          const [x2, y2] = z(t + s)
          expect(x2).toBeCloseTo(x! * Math.cos(s) - y! * Math.sin(s), 6)
          expect(y2).toBeCloseTo(x! * Math.sin(s) + y! * Math.cos(s), 6)
        }
      }
    }
    expect(PI_CONVERGENTS.find((c) => c.q === 7)!.p - 7).toBe(15) // the video's 15 petals
  })

  it('starts with the plain explanation when nothing was chosen', () => {
    expect(loadFilmInfo()).toBe('simple')
  })

  it('the flower appears around T ≈ 44 (7 turns of arm 1)', () => {
    // with the film's speed, 7 turns (t = 14π ≈ 44) take about half a minute
    const T = (sec: number) => 0.05 * 5 * 9 * (Math.exp(sec / 9) - 1)
    let sec = 0
    while (T(sec) < 14 * Math.PI) sec += 0.1
    expect(sec).toBeGreaterThan(20)
    expect(sec).toBeLessThan(35)
    expect(filmSpeed(sec)).toBeLessThan(200)
  })
})
