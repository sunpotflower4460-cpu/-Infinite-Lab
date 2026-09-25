import { Container, Graphics } from 'pixi.js'
import { KIND, STRIDE } from '../../geometry/batch'
import { CHUNK_RECORDS, type GeometryStore } from '../../geometry/GeometryStore'
import { COLORS, type GeometryLayer, type LayerFrame } from './GeometryLayer'

/**
 * Tessellated PixiJS Graphics, one per store chunk (2,000 records), built once and then only
 * transformed. Simple and robust; the fallback when instanced rendering is unavailable.
 */
export class GraphicsLayer implements GeometryLayer {
  readonly name = 'Graphics (tessellated)'
  readonly container = new Container()
  private chunks: Graphics[] = []
  private builtLength: number[] = []

  constructor() {
    this.container.blendMode = 'add'
  }

  sync(store: GeometryStore, visibleCount: number, frame: LayerFrame, full: boolean): boolean {
    let changed = false
    for (let i = 0; i < store.chunks.length; i++) {
      const want = Math.max(0, Math.min(store.chunkLength(i), visibleCount - i * CHUNK_RECORDS))
      if (full || want !== (this.builtLength[i] ?? -1)) {
        this.build(store, i, want, frame)
        changed = true
      }
    }
    return changed
  }

  setPixelScale(): void {
    // tessellation is refreshed on the next bucket change
  }

  private build(store: GeometryStore, index: number, n: number, frame: LayerFrame): void {
    this.builtLength[index] = n
    let g = this.chunks[index]
    if (!g) {
      g = new Graphics()
      this.chunks[index] = g
      this.container.addChild(g)
    }
    g.clear()
    g.visible = n > 0
    if (n === 0) return
    const data = store.chunks[index]!
    const s = frame.bucket
    const tx = (x: number) => (x - frame.originX) * s
    const ty = (y: number) => (y - frame.originY) * s

    let hasLines = false
    for (let i = 0; i < n; i++) {
      const o = i * STRIDE
      if (data[o] === KIND.line) {
        g.moveTo(tx(data[o + 2]!), ty(data[o + 3]!)).lineTo(tx(data[o + 4]!), ty(data[o + 5]!))
        hasLines = true
      }
    }
    if (hasLines) g.stroke({ width: 1, color: COLORS.line, alpha: COLORS.lineAlpha, pixelLine: true })

    let hasCircles = false
    for (let i = 0; i < n; i++) {
      const o = i * STRIDE
      const kind = data[o]
      if (kind === KIND.circle && data[o + 4]! > 0) {
        g.circle(tx(data[o + 2]!), ty(data[o + 3]!), data[o + 4]! * s)
        hasCircles = true
      } else if (kind === KIND.arc) {
        const cx = tx(data[o + 2]!)
        const cy = ty(data[o + 3]!)
        const r = data[o + 4]! * s
        const start = data[o + 5]!
        g.moveTo(cx + r * Math.cos(start), cy + r * Math.sin(start))
        g.arc(cx, cy, r, start, start + data[o + 6]!) // sweep ≥ 0: counter-clockwise in layer (y-up) space
        hasCircles = true
      }
    }
    if (hasCircles) g.stroke({ width: 1, color: COLORS.circle, alpha: COLORS.circleAlpha, pixelLine: true })

    // Points and zero-radius circles: a dot of constant screen size.
    const dot = 1.2 / frame.pxPerUnit
    let hasPoints = false
    for (let i = 0; i < n; i++) {
      const o = i * STRIDE
      const kind = data[o]
      if (kind === KIND.point || (kind === KIND.circle && data[o + 4]! <= 0)) {
        g.circle(tx(data[o + 2]!), ty(data[o + 3]!), dot)
        hasPoints = true
      }
    }
    if (hasPoints) g.fill({ color: COLORS.point, alpha: COLORS.pointAlpha })
  }

  clear(): void {
    for (const g of this.chunks) g.destroy()
    this.chunks = []
    this.builtLength = []
  }

  destroy(): void {
    this.clear()
    this.container.destroy()
  }
}
