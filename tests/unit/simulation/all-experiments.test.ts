import { describe, expect, it } from 'vitest'
import { GeometryBatchWriter, decodeRecord } from '../../../src/geometry/batch'
import { EXPERIMENTS } from '../../../src/experiments/registry'
import { makeRunner } from '../helpers'

const IDS = Object.keys(EXPERIMENTS)
const CONSTANT_IDS = ['pi', 'e', 'sqrt2', 'phi']

function emitted(id: string, constantId: string, steps: number, chunk: number) {
  const runner = makeRunner(id, 3000, {}, 'integer', constantId)
  const out = new GeometryBatchWriter()
  while (runner.currentStep < steps) runner.advance(Math.min(chunk, steps - runner.currentStep), out)
  return { runner, batch: out.flush() }
}

describe.each(IDS)('%s', (id) => {
  it.each(CONSTANT_IDS)('is deterministic and batch-size independent (%s)', (c) => {
    const a = emitted(id, c, 2500, 2500).batch
    const b = emitted(id, c, 2500, 13).batch
    expect(Buffer.from(a.data.buffer).equals(Buffer.from(b.data.buffer))).toBe(true)
  })

  it('inspect() reproduces every emitted record (steps 1–2,100)', () => {
    const { runner, batch } = emitted(id, 'pi', 2100, 2100)
    let rec = 0
    for (let step = 1; step <= 2100; step++) {
      const got = runner.inspect(step).instructions
      for (const g of got) {
        const r = decodeRecord(batch.data, rec++)
        expect(r.step).toBe(step)
        expect(r.instruction).toEqual(g)
      }
    }
    expect(rec).toBe(batch.count)
  })

  it('different constants give different geometry', () => {
    const pi = emitted(id, 'pi', 200, 200).batch
    const e = emitted(id, 'e', 200, 200).batch
    expect(Buffer.from(pi.data.buffer).equals(Buffer.from(e.data.buffer))).toBe(false)
  })
})
