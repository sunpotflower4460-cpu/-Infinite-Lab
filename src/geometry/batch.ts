import type { GeometryInstruction } from './types'

/**
 * Compact transferable encoding of geometry instructions:
 * one record = STRIDE float64 values  [kind, step, a, b, c, d, e]
 *
 *   point  : a=x  b=y
 *   circle : a=x  b=y  c=radius
 *   line   : a=x1 b=y1 c=x2 d=y2
 *   arc    : a=x  b=y  c=radius d=startAngle e=endAngle
 *
 * Float64 end-to-end: nothing is rounded to float32 before it reaches the renderer.
 */
export const STRIDE = 7
export const KIND = { point: 0, circle: 1, line: 2, arc: 3 } as const
export type KindCode = (typeof KIND)[keyof typeof KIND]

export interface GeometryBatch {
  data: Float64Array
  /** Number of records in `data`. */
  count: number
}

export class GeometryBatchWriter {
  private data: Float64Array
  private count = 0

  constructor(initialRecords = 1024) {
    this.data = new Float64Array(initialRecords * STRIDE)
  }

  get length(): number {
    return this.count
  }

  push(step: number, g: GeometryInstruction): void {
    if ((this.count + 1) * STRIDE > this.data.length) {
      const next = new Float64Array(this.data.length * 2)
      next.set(this.data)
      this.data = next
    }
    const o = this.count * STRIDE
    const d = this.data
    d[o + 1] = step
    switch (g.type) {
      case 'point':
        d[o] = KIND.point
        d[o + 2] = g.x
        d[o + 3] = g.y
        d[o + 4] = d[o + 5] = d[o + 6] = 0
        break
      case 'circle':
        d[o] = KIND.circle
        d[o + 2] = g.x
        d[o + 3] = g.y
        d[o + 4] = g.radius
        d[o + 5] = d[o + 6] = 0
        break
      case 'line':
        d[o] = KIND.line
        d[o + 2] = g.x1
        d[o + 3] = g.y1
        d[o + 4] = g.x2
        d[o + 5] = g.y2
        d[o + 6] = 0
        break
      case 'arc':
        d[o] = KIND.arc
        d[o + 2] = g.x
        d[o + 3] = g.y
        d[o + 4] = g.radius
        d[o + 5] = g.startAngle
        d[o + 6] = g.endAngle
        break
    }
    this.count++
  }

  /** Return the written records as a tight batch (safe to transfer) and reset the writer. */
  flush(): GeometryBatch {
    const batch = { data: this.data.slice(0, this.count * STRIDE), count: this.count }
    this.count = 0
    return batch
  }
}

export function decodeRecord(data: Float64Array, index: number): { step: number; instruction: GeometryInstruction } {
  const o = index * STRIDE
  const step = data[o + 1]!
  const [a, b, c, d, e] = [data[o + 2]!, data[o + 3]!, data[o + 4]!, data[o + 5]!, data[o + 6]!]
  switch (data[o]) {
    case KIND.point:
      return { step, instruction: { type: 'point', x: a, y: b } }
    case KIND.circle:
      return { step, instruction: { type: 'circle', x: a, y: b, radius: c } }
    case KIND.line:
      return { step, instruction: { type: 'line', x1: a, y1: b, x2: c, y2: d } }
    default:
      return { step, instruction: { type: 'arc', x: a, y: b, radius: c, startAngle: d, endAngle: e } }
  }
}
