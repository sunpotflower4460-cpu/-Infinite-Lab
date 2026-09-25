import { KIND, STRIDE, type GeometryBatch } from './batch'

export const CHUNK_RECORDS = 2000

export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/**
 * Append-only store of all emitted geometry records (render model).
 * Records are packed into fixed-size chunks so the renderer can build GPU
 * geometry per chunk exactly once.
 */
export class GeometryStore {
  readonly chunks: Float64Array[] = []
  count = 0
  bounds: Bounds | null = null

  append(batch: GeometryBatch): void {
    const src = batch.data
    for (let i = 0; i < batch.count; i++) {
      const chunkIndex = Math.floor(this.count / CHUNK_RECORDS)
      let chunk = this.chunks[chunkIndex]
      if (!chunk) {
        chunk = new Float64Array(CHUNK_RECORDS * STRIDE)
        this.chunks.push(chunk)
      }
      const so = i * STRIDE
      const o = (this.count % CHUNK_RECORDS) * STRIDE
      for (let k = 0; k < STRIDE; k++) chunk[o + k] = src[so + k]!
      this.extendBounds(src, so)
      this.count++
    }
  }

  private extendBounds(d: Float64Array, o: number): void {
    const kind = d[o]
    let minX: number, maxX: number, minY: number, maxY: number
    if (kind === KIND.line) {
      minX = Math.min(d[o + 2]!, d[o + 4]!)
      maxX = Math.max(d[o + 2]!, d[o + 4]!)
      minY = Math.min(d[o + 3]!, d[o + 5]!)
      maxY = Math.max(d[o + 3]!, d[o + 5]!)
    } else {
      const r = kind === KIND.point ? 0 : Math.abs(d[o + 4]!)
      minX = d[o + 2]! - r
      maxX = d[o + 2]! + r
      minY = d[o + 3]! - r
      maxY = d[o + 3]! + r
    }
    const b = this.bounds
    if (!b) this.bounds = { minX, minY, maxX, maxY }
    else {
      if (minX < b.minX) b.minX = minX
      if (minY < b.minY) b.minY = minY
      if (maxX > b.maxX) b.maxX = maxX
      if (maxY > b.maxY) b.maxY = maxY
    }
  }

  /** Step of record `index`. Records are appended in step order. */
  stepAt(index: number): number {
    return this.chunks[Math.floor(index / CHUNK_RECORDS)]![(index % CHUNK_RECORDS) * STRIDE + 1]!
  }

  /** Number of leading records whose step is ≤ `step` (binary search). */
  countUpToStep(step: number): number {
    let lo = 0
    let hi = this.count
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (this.stepAt(mid) <= step) lo = mid + 1
      else hi = mid
    }
    return lo
  }

  /** Visit the first `count` records: (chunk, offset into chunk). */
  forEachRecord(count: number, fn: (data: Float64Array, offset: number) => void): void {
    const n = Math.min(count, this.count)
    for (let i = 0; i < n; i++) fn(this.chunks[Math.floor(i / CHUNK_RECORDS)]!, (i % CHUNK_RECORDS) * STRIDE)
  }

  /**
   * The first `count` records as little-endian IEEE-754 bytes (STRIDE float64 each) —
   * a platform-independent serialization used for geometry digests.
   */
  bytes(count: number): Uint8Array<ArrayBuffer> {
    const n = Math.min(count, this.count)
    const out = new Uint8Array(n * STRIDE * 8)
    const view = new DataView(out.buffer)
    let p = 0
    this.forEachRecord(n, (d, o) => {
      for (let k = 0; k < STRIDE; k++, p += 8) view.setFloat64(p, d[o + k]!, true)
    })
    return out
  }

  /** Records held by chunk `i`. */
  chunkLength(i: number): number {
    return Math.min(CHUNK_RECORDS, this.count - i * CHUNK_RECORDS)
  }

  clear(): void {
    this.chunks.length = 0
    this.count = 0
    this.bounds = null
  }
}
