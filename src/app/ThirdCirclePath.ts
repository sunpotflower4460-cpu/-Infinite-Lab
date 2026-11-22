import { GeometryStore } from '../geometry/GeometryStore'
import { STRIDE } from '../geometry/batch'
import type { ThirdCircleConfig } from '../lab/thirdCircle'
import type { ThirdCircleJob, ThirdCircleResult } from '../workers/third-circle.worker'

/** Optional worker/cache for Q. Never mutates, transfers, or replaces the original P store. */
export class ThirdCirclePath {
  readonly store = new GeometryStore()
  private worker: Worker | null = null
  private key = ''
  private config: ThirdCircleConfig | null = null
  private generation = 0
  private busy = false
  private error: Error | null = null
  private waiters: { count: number; resolve(): void; reject(e: Error): void }[] = []

  constructor(
    private readonly source: GeometryStore,
    private readonly changed: (count: number, error: string | null) => void,
  ) {}
  get failure(): string | null {
    return this.error?.message ?? null
  }

  sync(config: ThirdCircleConfig | null): void {
    const key = config ? JSON.stringify([this.source.generation, config]) : ''
    if (key !== this.key) {
      this.dispose()
      this.key = key
      this.config = config
      this.error = null
      this.store.clear()
      if (config) {
        this.worker = new Worker(new URL('../workers/third-circle.worker.ts', import.meta.url), {
          type: 'module',
        })
        this.worker.onmessage = (event: MessageEvent<ThirdCircleResult>) => {
          const r = event.data
          if (r.generation !== this.generation) return
          this.busy = false
          if (r.error) this.error = new Error(r.error)
          else this.store.append({ data: r.data!, count: r.count! })
          this.settle()
          this.changed(this.store.count, this.error?.message ?? null)
          this.pump()
        }
        this.worker.onerror = (event) => {
          this.error = new Error(event.message || 'Third-circle worker failed')
          this.busy = false
          this.settle()
          this.changed(this.store.count, this.error.message)
        }
      }
    }
    this.pump()
  }

  ready(count: number): Promise<void> {
    if (this.error) return Promise.reject(this.error)
    if (!this.config) return Promise.reject(new Error('Third circle is not enabled'))
    if (this.store.count >= count) return Promise.resolve()
    return new Promise((resolve, reject) => {
      this.waiters.push({ count, resolve, reject })
      this.pump()
    })
  }

  dispose(): void {
    this.worker?.terminate()
    this.worker = null
    this.generation++
    this.busy = false
    this.key = ''
    this.config = null
    const error = new Error('Third-circle calculation changed')
    for (const w of this.waiters) w.reject(error)
    this.waiters = []
  }

  private settle(): void {
    this.waiters = this.waiters.filter((w) => {
      if (this.error) {
        w.reject(this.error)
        return false
      }
      if (this.store.count >= w.count) {
        w.resolve()
        return false
      }
      return true
    })
  }

  private pump(): void {
    if (!this.worker || !this.config || this.busy || this.error || this.store.count >= this.source.count)
      return
    const from = this.store.count,
      to = Math.min(this.source.count, from + 2048)
    const data = new Float64Array((to - from) * STRIDE)
    this.source.forEachRecordFrom(from, to, (d, o, i) =>
      data.set(d.subarray(o, o + STRIDE), (i - from) * STRIDE),
    )
    this.busy = true
    this.worker.postMessage(
      { generation: this.generation, config: this.config, data, count: to - from } satisfies ThirdCircleJob,
      [data.buffer],
    )
  }
}
