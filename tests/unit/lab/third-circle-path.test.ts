import { afterEach, expect, it, vi } from 'vitest'
import { ThirdCirclePath } from '../../../src/app/ThirdCirclePath'
import { GeometryStore } from '../../../src/geometry/GeometryStore'
import { GeometryBatchWriter } from '../../../src/geometry/batch'
import { geometryDigest } from '../../../src/geometry/digest'
import { thirdCircleSample } from '../../../src/lab/thirdCircle'
import type { ThirdCircleJob, ThirdCircleResult } from '../../../src/workers/third-circle.worker'
import { makeRunner } from '../helpers'

class WorkerDouble {
  static all: WorkerDouble[] = []
  jobs: ThirdCircleJob[] = []
  terminated = false
  onmessage: ((e: { data: ThirdCircleResult }) => void) | null = null
  onerror: unknown = null
  constructor() {
    WorkerDouble.all.push(this)
  }
  postMessage(job: ThirdCircleJob) {
    this.jobs.push(job)
  }
  terminate() {
    this.terminated = true
  }
  deliver(index: number) {
    const job = this.jobs[index]!
    for (let i = 0; i < job.count; i++) {
      const o = i * 7
      job.data.set(
        thirdCircleSample(
          job.data[o + 1]!,
          [job.data[o + 2]!, job.data[o + 3]!, job.data[o + 4]!],
          job.config,
        ).point,
        o + 2,
      )
    }
    this.onmessage?.({ data: { generation: job.generation, data: job.data, count: job.count } })
  }
}
afterEach(() => {
  vi.unstubAllGlobals()
  WorkerDouble.all = []
})
function source(count: number) {
  const store = new GeometryStore(),
    w = new GeometryBatchWriter()
  makeRunner('two-arm-torus', count + 100).advance(count, w)
  store.append(w.flush())
  return store
}
const config = { constantId: 'pi', dt: 0.05, radius: 100 }

it('builds only appended source points with one bounded job in flight and leaves P intact', async () => {
  vi.stubGlobal('Worker', WorkerDouble)
  const p = source(5000),
    digest = await geometryDigest(p, p.count),
    counts: number[] = []
  const path = new ThirdCirclePath(p, (count) => counts.push(count))
  path.sync(config)
  const w = WorkerDouble.all[0]!
  const ready = path.ready(5000)
  expect(w.jobs).toHaveLength(1)
  expect(w.jobs[0]!.count).toBe(2048)
  w.deliver(0)
  expect(path.store.count).toBe(2048)
  expect(w.jobs).toHaveLength(2)
  w.deliver(1)
  expect(w.jobs[2]!.count).toBe(904)
  w.deliver(2)
  await ready
  expect(counts).toEqual([2048, 4096, 5000])
  path.sync({ ...config })
  expect(w.jobs).toHaveLength(3)
  expect(await geometryDigest(p, p.count)).toBe(digest)
  path.dispose()
})

it('cancels waiters on a radius/source reset and rejects stale worker results', async () => {
  vi.stubGlobal('Worker', WorkerDouble)
  const p = source(3),
    path = new ThirdCirclePath(p, () => {})
  path.sync(config)
  const old = WorkerDouble.all[0]!,
    first = path.ready(3)
  const rejection = expect(first).rejects.toThrow('calculation changed')
  path.sync({ ...config, radius: 50 })
  await rejection
  expect(old.terminated).toBe(true)
  old.deliver(0)
  expect(path.store.count).toBe(0)
  WorkerDouble.all[1]!.deliver(0)
  await path.ready(3)
  const raw = p.chunks[0]!,
    q = path.store.chunks[0]!
  expect(Math.hypot(q[2]! - raw[2]!, q[3]! - raw[3]!, q[4]! - raw[4]!)).toBeCloseTo(50, 10)
  p.clear()
  path.sync({ ...config, radius: 50 })
  expect(path.store.count).toBe(0)
  path.dispose()
})
