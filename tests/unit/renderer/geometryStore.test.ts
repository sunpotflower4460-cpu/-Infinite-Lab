import { describe, expect, it } from 'vitest'
import { GeometryBatchWriter } from '../../../src/geometry/batch'
import { geometryDigest } from '../../../src/geometry/digest'
import { CHUNK_RECORDS, GeometryStore } from '../../../src/geometry/GeometryStore'
import { makeRunner } from '../helpers'

function storeFor(steps: number, chunk = steps, experiment = 'digit-circle-walk') {
  const runner = makeRunner(experiment, 5000)
  const store = new GeometryStore()
  while (runner.currentStep < steps) {
    const w = new GeometryBatchWriter()
    runner.advance(Math.min(chunk, steps - runner.currentStep), w)
    store.append(w.flush())
  }
  return store
}

describe('GeometryStore', () => {
  it('countUpToStep finds the record boundary for every step (across chunks)', () => {
    const store = storeFor(2500) // 2 records per step → 5000 records, 3 chunks
    expect(store.chunks.length).toBe(Math.ceil(5000 / CHUNK_RECORDS))
    expect(store.countUpToStep(0)).toBe(0)
    for (const s of [1, 2, 999, 1000, 1001, 2499, 2500]) expect(store.countUpToStep(s)).toBe(2 * s)
    expect(store.countUpToStep(1e9)).toBe(5000)
  })

  it('bytes() is little-endian float64 of the records', () => {
    const store = storeFor(3)
    const bytes = store.bytes(store.count)
    const view = new DataView(bytes.buffer)
    expect(bytes.length).toBe(store.count * 7 * 8)
    expect(view.getFloat64(8, true)).toBe(1) // record 0: step 1
    expect(view.getFloat64(7 * 8 + 8, true)).toBe(1) // record 1 (circle of step 1)
  })
})

describe('geometryDigest', () => {
  it('is stable across batch sizes and changes with the geometry', async () => {
    const a = await geometryDigest(storeFor(1500, 1500), Infinity)
    const b = await geometryDigest(storeFor(1500, 7), Infinity)
    const c = await geometryDigest(storeFor(1499, 1499), Infinity)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })

  it('pins the digest of π Digit Circle Walk, 1,000 steps (cross-platform regression guard)', async () => {
    const d = await geometryDigest(storeFor(1000), Infinity)
    expect(d).toBe(PINNED)
  })
})

const PINNED = 'fb95870d0cff6d0c7913adf09bc10f041a593f29f7a1debe29f3bb2e8edd1d38'
