import { Application, Container, Graphics } from 'pixi.js'
import { KIND, STRIDE, type GeometryBatch } from '../geometry/batch'
import { CHUNK_RECORDS, GeometryStore } from '../geometry/GeometryStore'
import type { GeometryInstruction } from '../geometry/types'
import { Camera } from './Camera'
import type { Renderer } from './Renderer'

export const COLORS = {
  background: 0x04050a,
  line: 0x7f9cff,
  circle: 0xe8eeff,
  point: 0xe8eeff,
  highlight: 0xffc766,
}

/**
 * PixiJS (WebGL) renderer.
 *
 * - Geometry lives in append-only chunks (GeometryStore); each chunk becomes one
 *   Graphics object that is tessellated once and then only transformed.
 * - Precision: GPU vertices are float32, so chunks are built relative to an origin near the
 *   view and pre-scaled by a power-of-two "zoom bucket". They are rebuilt when the zoom
 *   leaves the bucket or the view drifts far from the origin. World data stays float64.
 */
export class PixiRenderer implements Renderer {
  readonly camera = new Camera()
  readonly store = new GeometryStore()
  follow = true
  onUserCamera?: () => void
  /** Called with the step of the geometry under a click (or null for empty space). */
  onPick?: (step: number | null) => void

  private app: Application | undefined
  private world = new Container()
  private chunkLayer = new Container()
  private highlight = new Graphics()
  private chunkGraphics: Graphics[] = []
  /** Records currently tessellated in each chunk Graphics. */
  private builtLength: number[] = []
  /** Only records with step ≤ visibleStep are shown (Timeline). */
  private visibleStep = Infinity
  private highlightData: GeometryInstruction[] | null = null
  private bucket = 1
  private originX = 0
  private originY = 0
  private needsFullRebuild = false
  private rebuildTimer: ReturnType<typeof setTimeout> | undefined
  private resizeObserver: ResizeObserver | undefined
  private cleanup: (() => void)[] = []
  /** Render on demand: the scene is only redrawn when geometry or the camera changed. */
  private needsRender = true
  private renderTimes: number[] = []
  /** Frames actually rendered during the last second. */
  renderedFps = 0
  /** Duration of the last render call (CPU side, ms). */
  lastRenderMs = 0

  get objectCount(): number {
    return this.store.count
  }

  get fps(): number {
    return this.renderedFps
  }

  async init(host: HTMLElement): Promise<void> {
    const app = new Application()
    await app.init({
      resizeTo: host,
      background: COLORS.background,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      preference: 'webgl',
    })
    this.app = app
    app.canvas.style.display = 'block'
    app.canvas.setAttribute('data-testid', 'lab-canvas')
    host.appendChild(app.canvas)

    this.chunkLayer.blendMode = 'add'
    this.world.addChild(this.chunkLayer, this.highlight)
    app.stage.addChild(this.world)

    this.camera.setViewport(host.clientWidth, host.clientHeight)
    this.resizeObserver = new ResizeObserver(() => {
      // Pixi's `resizeTo` only reacts to window resizes; layout changes resize the host
      // too, so resize the renderer here to keep canvas and camera in the same space.
      app.resize()
      this.camera.setViewport(host.clientWidth, host.clientHeight)
      if (this.follow) this.fitAll()
      this.applyCamera()
    })
    this.resizeObserver.observe(host)
    this.bindInput(app.canvas)
    app.ticker.remove(app.render, app) // replaced by on-demand rendering in frame()
    app.ticker.add(() => this.frame())
    this.applyCamera()
  }

  append(batch: GeometryBatch): void {
    this.store.append(batch)
    if (this.follow) this.fitAll()
  }

  setHighlight(instructions: GeometryInstruction[] | null): void {
    this.highlightData = instructions
    this.drawHighlight()
  }

  clear(): void {
    this.store.clear()
    for (const g of this.chunkGraphics) g.destroy()
    this.chunkGraphics = []
    this.builtLength = []
    this.visibleStep = Infinity
    this.highlightData = null
    this.highlight.clear()
    this.camera.centerOn(0, 0)
    this.follow = true
    this.needsRender = true
  }

  fitAll(): void {
    const b = this.store.bounds
    if (!b) {
      this.camera.centerOn(0, 0)
    } else {
      this.camera.fit(b, 48)
    }
    this.applyCamera()
  }

  center(): void {
    const b = this.store.bounds
    if (b) this.camera.centerOn((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2)
    this.applyCamera()
  }

  destroy(): void {
    this.resizeObserver?.disconnect()
    for (const f of this.cleanup) f()
    if (this.rebuildTimer) clearTimeout(this.rebuildTimer)
    this.app?.destroy(true, { children: true })
    this.app = undefined
  }

  // ---------------------------------------------------------------------------

  private frame(): void {
    const full = this.needsFullRebuild
    this.needsFullRebuild = false
    if (full) this.rebuildView()
    const visible = this.visibleCount()
    for (let i = 0; i < this.store.chunks.length; i++) {
      const want = Math.max(0, Math.min(this.store.chunkLength(i), visible - i * CHUNK_RECORDS))
      if (full || want !== (this.builtLength[i] ?? -1)) {
        this.buildChunk(i, want)
        this.needsRender = true
      }
    }
    const now = performance.now()
    if (this.needsRender && this.app) {
      this.needsRender = false
      this.app.render()
      this.lastRenderMs = performance.now() - now
      this.renderTimes.push(now)
    }
    while (this.renderTimes.length && now - this.renderTimes[0]! > 1000) this.renderTimes.shift()
    this.renderedFps = this.renderTimes.length
  }

  private visibleCount(): number {
    return Number.isFinite(this.visibleStep) ? this.store.countUpToStep(this.visibleStep) : this.store.count
  }

  /** Show only geometry of steps ≤ step (Infinity = everything). */
  setVisibleStep(step: number): void {
    this.visibleStep = step
    this.needsRender = true
  }

  /**
   * Step of the visible geometry nearest to screen point (sx, sy), within `tolerancePx`.
   * Circles are hit on their circumference or centre, lines anywhere along the segment.
   */
  pick(sx: number, sy: number, tolerancePx = 6): number | null {
    const [wx, wy] = this.camera.screenToWorld(sx, sy)
    const tol = tolerancePx / this.camera.zoom
    // Score = distance, with path lines penalised so circles/points win when both are in range.
    let bestScore = Infinity
    let bestStep: number | null = null
    this.store.forEachRecord(this.visibleCount(), (d, o) => {
      const kind = d[o]
      let dist: number
      if (kind === KIND.line) {
        dist = segmentDistance(wx, wy, d[o + 2]!, d[o + 3]!, d[o + 4]!, d[o + 5]!)
      } else {
        const c = Math.hypot(wx - d[o + 2]!, wy - d[o + 3]!)
        dist = kind === KIND.point ? c : Math.min(c, Math.abs(c - d[o + 4]!))
      }
      if (dist > tol) return
      const score = kind === KIND.line ? dist + tol : dist
      if (score <= bestScore) {
        // ≤ : on ties the later step (drawn on top) wins
        bestScore = score
        bestStep = d[o + 1]!
      }
    })
    return bestStep
  }

  /** Map camera → container transform; schedule rebuilds when precision would suffer. */
  private applyCamera(): void {
    const c = this.camera
    const ratio = c.zoom / this.bucket
    const drift = Math.max(Math.abs(c.cx - this.originX), Math.abs(c.cy - this.originY)) * c.zoom
    if (ratio > 2 || ratio < 0.5 || drift > 1e6) this.scheduleRebuild()
    this.world.scale.set(c.zoom / this.bucket, -c.zoom / this.bucket)
    this.world.position.set(
      c.width / 2 + (this.originX - c.cx) * c.zoom,
      c.height / 2 + (c.cy - this.originY) * c.zoom,
    )
    this.drawHighlight()
    this.needsRender = true
  }

  private scheduleRebuild(): void {
    if (this.rebuildTimer) return
    this.rebuildTimer = setTimeout(() => {
      this.rebuildTimer = undefined
      this.needsFullRebuild = true
    }, 120)
  }

  /** Re-anchor the float32 precision origin and zoom bucket at the current view. */
  private rebuildView(): void {
    const c = this.camera
    this.bucket = 2 ** Math.round(Math.log2(c.zoom))
    this.originX = c.cx
    this.originY = c.cy
    this.applyCamera()
  }

  private buildChunk(index: number, n: number): void {
    this.builtLength[index] = n
    let g = this.chunkGraphics[index]
    if (!g) {
      g = new Graphics()
      this.chunkGraphics[index] = g
      this.chunkLayer.addChild(g)
    }
    g.clear()
    g.visible = n > 0
    if (n === 0) return
    const data = this.store.chunks[index]!
    const s = this.bucket
    const ox = this.originX
    const oy = this.originY
    const tx = (x: number) => (x - ox) * s
    const ty = (y: number) => (y - oy) * s

    let hasLines = false
    for (let i = 0; i < n; i++) {
      const o = i * STRIDE
      if (data[o] === KIND.line) {
        g.moveTo(tx(data[o + 2]!), ty(data[o + 3]!)).lineTo(tx(data[o + 4]!), ty(data[o + 5]!))
        hasLines = true
      }
    }
    if (hasLines) g.stroke({ width: 1, color: COLORS.line, alpha: 0.28, pixelLine: true })

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
        g.moveTo(cx + r * Math.cos(data[o + 5]!), cy + r * Math.sin(data[o + 5]!))
        g.arc(cx, cy, r, data[o + 5]!, data[o + 6]!)
        hasCircles = true
      }
    }
    if (hasCircles) g.stroke({ width: 1, color: COLORS.circle, alpha: 0.5, pixelLine: true })

    // Points and zero-radius circles: a dot of constant screen size.
    const dot = (1.2 * s) / this.camera.zoom
    let hasPoints = false
    for (let i = 0; i < n; i++) {
      const o = i * STRIDE
      const kind = data[o]
      if (kind === KIND.point || (kind === KIND.circle && data[o + 4]! <= 0)) {
        g.circle(tx(data[o + 2]!), ty(data[o + 3]!), dot)
        hasPoints = true
      }
    }
    if (hasPoints) g.fill({ color: COLORS.point, alpha: 0.7 })
  }

  private drawHighlight(): void {
    const g = this.highlight
    g.clear()
    this.needsRender = true
    const items = this.highlightData
    if (!items || items.length === 0) return
    const s = this.bucket
    const tx = (x: number) => (x - this.originX) * s
    const ty = (y: number) => (y - this.originY) * s
    const px = s / this.camera.zoom // one screen pixel in chunk units
    for (const it of items) {
      if (it.type === 'line') g.moveTo(tx(it.x1), ty(it.y1)).lineTo(tx(it.x2), ty(it.y2))
      else if (it.type === 'circle' || it.type === 'arc') {
        if (it.radius > 0) g.circle(tx(it.x), ty(it.y), it.radius * s)
      }
    }
    g.stroke({ width: 2 * px, color: COLORS.highlight, alpha: 0.95 })
    const anchor = [...items]
      .reverse()
      .find((i): i is Exclude<GeometryInstruction, { type: 'line' }> => i.type !== 'line')
    if (anchor) {
      g.circle(tx(anchor.x), ty(anchor.y), 2.5 * px).fill({ color: COLORS.highlight, alpha: 1 })
      g.circle(tx(anchor.x), ty(anchor.y), 12 * px).stroke({
        width: 1 * px,
        color: COLORS.highlight,
        alpha: 0.5,
      })
    }
  }

  private bindInput(canvas: HTMLCanvasElement): void {
    let dragging = false
    let lastX = 0
    let lastY = 0
    let downX = 0
    let downY = 0
    const local = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect()
      return [e.clientX - r.left, e.clientY - r.top] as const
    }
    const user = () => {
      this.follow = false
      this.onUserCamera?.()
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const [sx, sy] = local(e)
      this.camera.zoomAt(sx, sy, Math.exp(-e.deltaY * 0.0015))
      user()
      this.applyCamera()
    }
    const onDown = (e: PointerEvent) => {
      dragging = true
      lastX = downX = e.clientX
      lastY = downY = e.clientY
      canvas.setPointerCapture(e.pointerId)
    }
    const onMove = (e: PointerEvent) => {
      if (!dragging) return
      const dx = e.clientX - lastX
      const dy = e.clientY - lastY
      if (dx === 0 && dy === 0) return
      lastX = e.clientX
      lastY = e.clientY
      this.camera.panBy(dx, dy)
      user()
      this.applyCamera()
    }
    const onUp = (e: PointerEvent) => {
      if (dragging && Math.hypot(e.clientX - downX, e.clientY - downY) < 4 && this.onPick) {
        const [sx, sy] = local(e)
        this.onPick(this.pick(sx, sy))
      }
      dragging = false
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId)
    }
    const onDbl = (e: MouseEvent) => {
      const [sx, sy] = local(e)
      const [wx, wy] = this.camera.screenToWorld(sx, sy)
      this.camera.centerOn(wx, wy)
      user()
      this.applyCamera()
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)
    canvas.addEventListener('dblclick', onDbl)
    canvas.style.touchAction = 'none'
    this.cleanup.push(() => {
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
      canvas.removeEventListener('dblclick', onDbl)
    })
  }
}

function segmentDistance(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1
  const dy = y2 - y1
  const len2 = dx * dx + dy * dy
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2)) : 0
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}
