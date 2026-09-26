import { Container, Graphics } from 'pixi.js'
import { KIND, STRIDE } from '../../geometry/batch'
import { CHUNK_RECORDS, type GeometryStore } from '../../geometry/GeometryStore'
import { LOOKS, type GeometryLayer, type LayerFrame, type LayerStyle } from './GeometryLayer'

/**
 * Tessellated PixiJS Graphics, one per store chunk (2,000 records), built once and then only
 * transformed. Simple and robust; the fallback when instanced rendering is unavailable.
 */
export class GraphicsLayer implements GeometryLayer {
  readonly name = 'Graphics (tessellated)'
  readonly container = new Container()
  private chunks: Graphics[] = []
  private builtLength: number[] = []
  private style: LayerStyle = LOOKS.lab
  private styleChanged = false
  private contextStart = 0
  private contextAlpha = 1

  constructor() {
    this.container.blendMode = 'add'
  }

  sync(store: GeometryStore, visibleCount: number, frame: LayerFrame, full: boolean): boolean {
    let changed = false
    if (this.styleChanged) {
      full = true
      this.styleChanged = false
    }
    for (let i = 0; i < store.chunks.length; i++) {
      const want = Math.max(0, Math.min(store.chunkLength(i), visibleCount - i * CHUNK_RECORDS))
      if (full || want !== (this.builtLength[i] ?? -1)) {
        this.build(store, i, want, frame)
        changed = true
      }
    }
    return changed
  }

  setStyle(style: LayerStyle): void {
    if (style === this.style) return
    this.style = style
    this.styleChanged = true
  }

  setContext(startIndex: number, alpha: number): void {
    if (startIndex === this.contextStart && alpha === this.contextAlpha) return
    this.contextStart = startIndex
    this.contextAlpha = alpha
    this.styleChanged = true // rebuild every chunk on the next sync
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
    // Microscope: records before contextStart are drawn as faded context (or not at all).
    const base = index * CHUNK_RECORDS
    const split = Math.max(0, Math.min(n, this.contextStart - base))
    if (split > 0 && this.contextAlpha > 0) this.drawRecords(g, data, 0, split, frame, this.contextAlpha)
    if (split < n) this.drawRecords(g, data, split, n, frame, 1)
  }

  private drawRecords(
    g: Graphics,
    data: Float64Array,
    from: number,
    to: number,
    frame: LayerFrame,
    fade: number,
  ) {
    const s = frame.bucket
    const tx = (x: number) => (x - frame.originX) * s
    const ty = (y: number) => (y - frame.originY) * s
    const st = this.style

    let hasLines = false
    for (let i = from; i < to; i++) {
      const o = i * STRIDE
      if (data[o] === KIND.line) {
        g.moveTo(tx(data[o + 2]!), ty(data[o + 3]!)).lineTo(tx(data[o + 4]!), ty(data[o + 5]!))
        hasLines = true
      }
    }
    if (hasLines) g.stroke({ width: 1, color: st.line, alpha: st.lineAlpha * fade, pixelLine: true })

    let hasCircles = false
    for (let i = from; i < to; i++) {
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
    if (hasCircles) g.stroke({ width: 1, color: st.circle, alpha: st.circleAlpha * fade, pixelLine: true })

    // Points and zero-radius circles: a dot of constant screen size.
    const dot = 1.2 / frame.pxPerUnit
    let hasPoints = false
    for (let i = from; i < to; i++) {
      const o = i * STRIDE
      const kind = data[o]
      if (kind === KIND.point || (kind === KIND.circle && data[o + 4]! <= 0)) {
        g.circle(tx(data[o + 2]!), ty(data[o + 3]!), dot)
        hasPoints = true
      }
    }
    if (hasPoints) g.fill({ color: st.point, alpha: st.pointAlpha * fade })
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
