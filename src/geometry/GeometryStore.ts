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
  /** Bounding box of each chunk: a coarse spatial index (consecutive steps are close together). */
  readonly chunkBounds: Bounds[] = []
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
      this.extendBounds(src, so, chunkIndex)
      this.count++
    }
  }

  private extendBounds(d: Float64Array, o: number, chunkIndex: number): void {
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
    if (!this.bounds) this.bounds = { minX, minY, maxX, maxY }
    else grow(this.bounds, minX, minY, maxX, maxY)
    const cb = this.chunkBounds[chunkIndex]
    if (!cb) this.chunkBounds[chunkIndex] = { minX, minY, maxX, maxY }
    else grow(cb, minX, minY, maxX, maxY)
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

  /** Visit records [from, to): (chunk, offset into chunk, record index). */
  forEachRecordFrom(
    from: number,
    to: number,
    fn: (data: Float64Array, offset: number, index: number) => void,
  ): void {
    const end = Math.min(to, this.count)
    for (let i = Math.max(0, from); i < end; i++) {
      fn(this.chunks[Math.floor(i / CHUNK_RECORDS)]!, (i % CHUNK_RECORDS) * STRIDE, i)
    }
  }

  /**
   * Visit the first `count` records whose chunk bounding box is within `margin` of (x, y);
   * whole chunks far from the point are skipped.
   */
  forEachRecordNear(
    x: number,
    y: number,
    margin: number,
    count: number,
    fn: (data: Float64Array, offset: number) => void,
  ): void {
    const n = Math.min(count, this.count)
    for (let c = 0; c * CHUNK_RECORDS < n; c++) {
      const b = this.chunkBounds[c]!
      if (x < b.minX - margin || x > b.maxX + margin || y < b.minY - margin || y > b.maxY + margin) continue
      const data = this.chunks[c]!
      const end = Math.min(CHUNK_RECORDS, n - c * CHUNK_RECORDS)
      for (let i = 0; i < end; i++) fn(data, i * STRIDE)
    }
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

  /** Bounding box of the first `count` records. */
  boundsUpTo(count: number): Bounds | null {
    const n = Math.min(count, this.count)
    if (n === this.count) return this.bounds && { ...this.bounds }
    return this.boundsBetween(0, n)
  }

  /**
   * Bounding box of records [from, to): whole chunks from `chunkBounds`, only the partial
   * first and last chunks are scanned. Null when the range is empty.
   */
  boundsBetween(from: number, to: number): Bounds | null {
    const a = Math.max(0, from)
    const b = Math.min(to, this.count)
    if (a >= b) return null
    let out: Bounds | null = null
    const add = (x: Bounds | null) => {
      if (!x) return
      if (!out) out = { ...x }
      else grow(out, x.minX, x.minY, x.maxX, x.maxY)
    }
    const scan = (s: number, e: number) => {
      if (e <= s) return
      const c = Math.floor(s / CHUNK_RECORDS)
      const scratch = new GeometryStore()
      const offset = s - c * CHUNK_RECORDS
      scratch.append({
        data: this.chunks[c]!.subarray(offset * STRIDE, (offset + e - s) * STRIDE),
        count: e - s,
      })
      add(scratch.bounds)
    }
    const firstFull = Math.ceil(a / CHUNK_RECORDS)
    const lastFull = Math.floor(b / CHUNK_RECORDS) // exclusive
    if (firstFull >= lastFull) {
      // within one chunk, or straddling one boundary without a whole chunk in between
      const boundary = firstFull * CHUNK_RECORDS
      if (boundary > a && boundary < b) {
        scan(a, boundary)
        scan(boundary, b)
      } else scan(a, b)
      return out
    }
    scan(a, firstFull * CHUNK_RECORDS)
    for (let c = firstFull; c < lastFull; c++) add(this.chunkBounds[c]!)
    scan(lastFull * CHUNK_RECORDS, b)
    return out
  }

  /** Index of the first record with step ≥ `step` (records before it belong to earlier steps). */
  firstIndexOfStep(step: number): number {
    return this.countUpToStep(step - 1)
  }

  /** Records held by chunk `i`. */
  chunkLength(i: number): number {
    return Math.min(CHUNK_RECORDS, this.count - i * CHUNK_RECORDS)
  }

  clear(): void {
    this.chunks.length = 0
    this.chunkBounds.length = 0
    this.count = 0
    this.bounds = null
  }
}

function grow(b: Bounds, minX: number, minY: number, maxX: number, maxY: number): void {
  if (minX < b.minX) b.minX = minX
  if (minY < b.minY) b.minY = minY
  if (maxX > b.maxX) b.maxX = maxX
  if (maxY > b.maxY) b.maxY = maxY
}
