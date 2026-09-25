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
  /** Index of the lowest chunk modified since the last `consumeDirty()`. */
  private dirtyFrom = Infinity

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
      this.dirtyFrom = Math.min(this.dirtyFrom, chunkIndex)
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

  /** Records held by chunk `i`. */
  chunkLength(i: number): number {
    return Math.min(CHUNK_RECORDS, this.count - i * CHUNK_RECORDS)
  }

  consumeDirty(): number {
    const d = this.dirtyFrom
    this.dirtyFrom = Infinity
    return d
  }

  clear(): void {
    this.chunks.length = 0
    this.count = 0
    this.bounds = null
    this.dirtyFrom = Infinity
  }
}
