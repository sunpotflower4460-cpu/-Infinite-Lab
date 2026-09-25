import { describe, expect, it } from 'vitest'
import { GeometryBatchWriter } from '../../../src/geometry/batch'
import { CHECKPOINT_INTERVAL } from '../../../src/experiments/core'
import { makeRunner } from '../helpers'

function runAll(steps: number, chunk: number): Float64Array {
  const runner = makeRunner('digit-circle-walk', 10000)
  const out = new GeometryBatchWriter()
  while (runner.currentStep < steps) runner.advance(Math.min(chunk, steps - runner.currentStep), out)
  return out.flush().data
}

describe('determinism', () => {
  it('same input → byte-identical output, independent of batch size', () => {
    const a = runAll(5000, 5000)
    const b = runAll(5000, 5000)
    const c = runAll(5000, 37)
    expect(Buffer.from(a.buffer).equals(Buffer.from(b.buffer))).toBe(true)
    expect(Buffer.from(a.buffer).equals(Buffer.from(c.buffer))).toBe(true)
  })

  it('reset reproduces the same geometry', () => {
    const runner = makeRunner('digit-circle-walk', 2000)
    const w1 = new GeometryBatchWriter()
    runner.advance(1500, w1)
    runner.reset()
    const w2 = new GeometryBatchWriter()
    runner.advance(1500, w2)
    expect(Array.from(w1.flush().data)).toEqual(Array.from(w2.flush().data))
  })
})

describe('replay', () => {
  it('0 → 1000 equals checkpoint-restore → 1000 for every inspected step', () => {
    const runner = makeRunner('digit-circle-walk', 5000)
    const out = new GeometryBatchWriter()
    runner.advance(2500, out)
    const batch = out.flush()
    // Every step's re-executed geometry must equal what was originally emitted (2 records / step).
    for (const step of [1, 2, 999, 1000, 1001, 1500, 2000, 2001, 2500]) {
      const trace = runner.inspect(step)
      const circle = trace.instructions.find((g) => g.type === 'circle')!
      const o = ((step - 1) * 2 + 1) * 7
      expect(batch.data[o + 1]).toBe(step)
      expect([circle.type === 'circle' && circle.x, circle.type === 'circle' && circle.y]).toEqual([
        batch.data[o + 2],
        batch.data[o + 3],
      ])
    }
    expect(CHECKPOINT_INTERVAL).toBe(1000)
  })

  it('inspect() reproduces every emitted step exactly (all 2,500 steps)', () => {
    const runner = makeRunner('digit-circle-walk', 5000)
    const out = new GeometryBatchWriter()
    runner.advance(2500, out)
    const { data, count } = out.flush()
    expect(count).toBe(5000)
    for (let step = 1; step <= 2500; step++) {
      const [line, circle] = runner.inspect(step).instructions
      const o = (step - 1) * 2 * 7
      expect(line).toEqual({
        type: 'line',
        x1: data[o + 2],
        y1: data[o + 3],
        x2: data[o + 4],
        y2: data[o + 5],
      })
      expect(circle).toEqual({ type: 'circle', x: data[o + 9], y: data[o + 10], radius: data[o + 11] })
    }
  })

  it('inspect does not disturb the running state', () => {
    const runner = makeRunner('digit-circle-walk', 3000)
    runner.advance(1200)
    const before = runner.snapshot()
    runner.inspect(5)
    runner.inspect(1100)
    expect(runner.snapshot()).toEqual(before)
    expect(() => runner.inspect(1201)).toThrow(RangeError)
  })
})

describe('traceLast', () => {
  it('explains the last step identically to inspect()', () => {
    const runner = makeRunner('digit-circle-walk', 3000)
    runner.advance(1234, undefined, true)
    expect(runner.lastTrace).toEqual(runner.inspect(1234))
  })
})
