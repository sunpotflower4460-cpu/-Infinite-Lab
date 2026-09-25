import { describe, expect, it } from 'vitest'
import { MAX_STEPS_PER_TICK, Simulation } from '../../../src/simulation/Simulation'
import { GeometryStore } from '../../../src/geometry/GeometryStore'
import { piDigits } from '../helpers'

function sim(precision = 1000): Simulation {
  const { digits, integerPartLength } = piDigits(precision)
  return new Simulation({
    experimentId: 'digit-circle-walk',
    params: {},
    digitStart: 'integer',
    digits,
    integerPartLength,
    constant: { id: 'pi', symbol: 'π' },
  })
}

describe('Simulation clock', () => {
  it('converts elapsed time to steps without losing fractions', () => {
    const s = sim()
    s.stepsPerSecond = 10
    let total = 0
    for (let i = 0; i < 60; i++) total += s.stepsDue(1000 / 60)
    expect(total).toBeGreaterThanOrEqual(9)
    expect(total).toBeLessThanOrEqual(10)
  })

  it('caps catch-up after a long pause to 0.25 s of steps', () => {
    const s = sim()
    s.stepsPerSecond = 10_000
    expect(s.stepsDue(10_000)).toBe(2_500)
    expect(s.stepsDue(0)).toBe(0)
  })

  it('MAX requests the per-tick cap', () => {
    const s = sim()
    s.stepsPerSecond = Infinity
    expect(s.stepsDue(16)).toBe(MAX_STEPS_PER_TICK)
  })

  it('speed only changes how many steps run per tick, never the result', () => {
    const run = (chunks: number[]) => {
      const s = sim(3000)
      const store = new GeometryStore()
      for (const c of chunks) store.append(s.run(c).batch)
      return store
    }
    const a = run([3001])
    const b = run(Array.from({ length: 300 }, () => 11))
    expect(a.count).toBe(b.count)
    a.chunks.forEach((chunk, i) => expect(Array.from(chunk)).toEqual(Array.from(b.chunks[i]!)))
    expect(a.bounds).toEqual(b.bounds)
  })

  it('reports the trace of the last executed step', () => {
    const s = sim()
    const r = s.run(6)
    expect(r.trace?.step).toBe(6)
    expect(r.trace?.digit).toBe(9)
  })
})
