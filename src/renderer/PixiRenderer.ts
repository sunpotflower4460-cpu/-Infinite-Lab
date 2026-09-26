import { Application, Container, Graphics, Rectangle } from 'pixi.js'
import { KIND, type GeometryBatch } from '../geometry/batch'
import { GeometryStore } from '../geometry/GeometryStore'
import type { GeometryInstruction } from '../geometry/types'
import { Camera, type Bounds } from './Camera'
import { arcDistance, segmentDistance } from './hitTest'
import { COLORS, LOOKS, type GeometryLayer, type LayerFrame, type Look } from './layers/GeometryLayer'
import { GraphicsLayer } from './layers/GraphicsLayer'
import { InstancedLayer } from './layers/InstancedLayer'
import type { Renderer } from './Renderer'

export { COLORS }
export type LayerMode = 'instanced' | 'graphics'

/**
 * PixiJS (WebGL) renderer.
 *
 * - Geometry lives in the append-only GeometryStore; a GeometryLayer turns it into GPU
 *   geometry: instanced SDF quads (default) or tessellated Graphics (fallback).
 * - Camera, input, picking and highlighting are shared by both layers.
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
  private layer: GeometryLayer = new InstancedLayer()
  private highlight = new Graphics()
  /** Only records with step ≤ visibleStep are shown (Timeline). */
  private visibleStep = Infinity
  private highlightData: GeometryInstruction[] | null = null
  private look: Look = 'lab'
  /** Framing kept across resizes (fitTo) until the user moves the camera or fits all. */
  private framed: Bounds | null = null
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
      background: LOOKS[this.look].background,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      preference: 'webgl',
    })
    this.app = app
    // Without WebGL, Pixi falls back to WebGPU or Canvas 2D; the instanced layer needs WebGL
    // shaders, so use the tessellated Graphics layer there.
    if (!this.instancedSupported && this.layer instanceof InstancedLayer) this.setLayerMode('graphics')
    app.canvas.style.display = 'block'
    app.canvas.setAttribute('data-testid', 'lab-canvas')
    host.appendChild(app.canvas)

    this.world.addChild(this.layer.container, this.highlight)
    app.stage.addChild(this.world)

    this.camera.setViewport(host.clientWidth, host.clientHeight)
    this.resizeObserver = new ResizeObserver(() => {
      // Pixi's `resizeTo` only reacts to window resizes; layout changes resize the host
      // too, so resize the renderer here to keep canvas and camera in the same space.
      app.resize()
      this.camera.setViewport(host.clientWidth, host.clientHeight)
      if (this.framed) this.camera.fit(this.framed, 24)
      else if (this.follow) this.fitAll()
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
    this.layer.clear()
    this.visibleStep = Infinity
    this.highlightData = null
    this.highlight.clear()
    if (this.framed) {
      this.camera.fit(this.framed, 24) // a fixed framing (Film mode) survives a restart
    } else {
      this.camera.centerOn(0, 0)
      this.follow = true
    }
    this.applyCamera()
    this.needsRender = true
  }

  fitAll(): void {
    this.framed = null
    const b = this.store.bounds
    if (!b) {
      this.camera.centerOn(0, 0)
    } else {
      this.camera.fit(b, 48)
    }
    this.applyCamera()
  }

  /** Show exactly these world bounds and stop following new geometry. */
  fitTo(bounds: Bounds): void {
    this.follow = false
    this.framed = { ...bounds }
    this.camera.fit(bounds, 24)
    this.applyCamera()
  }

  /** Presentation palette (see LOOKS); the data is unchanged. */
  setLook(look: Look): void {
    this.look = look
    this.layer.setStyle(LOOKS[look])
    if (this.app) this.app.renderer.background.color = LOOKS[look].background
    this.needsRender = true
  }

  center(): void {
    const b = this.store.bounds
    if (b) this.camera.centerOn((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2)
    this.applyCamera()
  }

  destroy(): void {
    this.resizeObserver?.disconnect()
    for (const f of this.cleanup) f()
    this.layer.destroy()
    if (this.rebuildTimer) clearTimeout(this.rebuildTimer)
    this.app?.destroy(true, { children: true })
    this.app = undefined
  }

  // ---------------------------------------------------------------------------

  /** The current view (camera, Timeline cut-off, highlight) as a PNG at device resolution. */
  async snapshotPng(): Promise<Blob> {
    const app = this.app
    if (!app) throw new Error('renderer not ready')
    this.frame() // bring GPU geometry up to date
    const canvas = app.renderer.extract.canvas({
      target: app.stage,
      frame: new Rectangle(0, 0, this.camera.width, this.camera.height),
      clearColor: LOOKS[this.look].background,
    }) as HTMLCanvasElement
    return new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png'),
    )
  }

  /** Records currently shown (Timeline cut-off applied). */
  get visibleRecords(): number {
    return this.visibleCount()
  }

  /** Name of the active geometry layer (Scientific Mode). */
  get layerName(): string {
    return this.layer.name
  }

  /** Active Pixi backend: 'webgl', 'webgpu' or 'canvas' (null before init). */
  get backend(): string | null {
    return this.app ? this.app.renderer.name : null
  }

  /** The instanced SDF layer uses WebGL shaders. */
  get instancedSupported(): boolean {
    return this.backend === null || this.backend === 'webgl'
  }

  /** Switch between instanced SDF and tessellated Graphics rendering. */
  setLayerMode(mode: LayerMode): void {
    const next = mode === 'graphics' || !this.instancedSupported ? new GraphicsLayer() : new InstancedLayer()
    this.world.removeChild(this.layer.container)
    this.layer.destroy()
    this.layer = next
    next.setStyle(LOOKS[this.look])
    this.world.addChildAt(next.container, 0)
    this.needsFullRebuild = true
  }

  private layerFrame(): LayerFrame {
    return {
      bucket: this.bucket,
      originX: this.originX,
      originY: this.originY,
      pxPerUnit: this.camera.zoom / this.bucket,
    }
  }

  private frame(): void {
    const full = this.needsFullRebuild
    this.needsFullRebuild = false
    if (full) this.rebuildView()
    if (this.layer.sync(this.store, this.visibleCount(), this.layerFrame(), full)) this.needsRender = true
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
    this.store.forEachRecordNear(wx, wy, tol, this.visibleCount(), (d, o) => {
      const kind = d[o]
      let dist: number
      if (kind === KIND.line) {
        dist = segmentDistance(wx, wy, d[o + 2]!, d[o + 3]!, d[o + 4]!, d[o + 5]!)
      } else if (kind === KIND.arc) {
        dist = arcDistance(wx, wy, d[o + 2]!, d[o + 3]!, d[o + 4]!, d[o + 5]!, d[o + 6]!)
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
    this.layer.setPixelScale(c.zoom / this.bucket)
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
      else if (it.type === 'circle') {
        if (it.radius > 0) g.circle(tx(it.x), ty(it.y), it.radius * s)
      } else if (it.type === 'arc' && it.radius > 0) {
        const r = it.radius * s
        g.moveTo(tx(it.x) + r * Math.cos(it.startAngle), ty(it.y) + r * Math.sin(it.startAngle))
        g.arc(tx(it.x), ty(it.y), r, it.startAngle, it.startAngle + it.sweep)
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
    // Active pointers (mouse or fingers), in canvas-local coordinates.
    const pointers = new Map<number, { x: number; y: number }>()
    let downX = 0
    let downY = 0
    /** A second finger touched during this gesture: never treat it as a click. */
    let multi = false
    const local = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect()
      return [e.clientX - r.left, e.clientY - r.top] as const
    }
    const user = () => {
      this.follow = false
      this.framed = null
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
      const [x, y] = local(e)
      pointers.set(e.pointerId, { x, y })
      if (pointers.size === 1) {
        downX = x
        downY = y
        multi = false
      } else multi = true
      canvas.setPointerCapture(e.pointerId)
    }
    const onMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId)
      if (!prev) return
      const [x, y] = local(e)
      if (x === prev.x && y === prev.y) return
      if (pointers.size >= 2) {
        const [idA, idB] = [...pointers.keys()]
        const a0 = { ...pointers.get(idA!)! }
        const b0 = { ...pointers.get(idB!)! }
        pointers.set(e.pointerId, { x, y })
        this.camera.pinch(a0, b0, pointers.get(idA!)!, pointers.get(idB!)!)
      } else {
        pointers.set(e.pointerId, { x, y })
        this.camera.panBy(x - prev.x, y - prev.y)
      }
      user()
      this.applyCamera()
    }
    const onUp = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return
      const [x, y] = local(e)
      pointers.delete(e.pointerId)
      if (pointers.size === 0 && !multi && Math.hypot(x - downX, y - downY) < 4 && this.onPick) {
        this.onPick(this.pick(x, y))
      }
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId)
    }
    const onCancel = (e: PointerEvent) => {
      // the browser took the gesture over: forget the pointer, never treat it as a click
      if (!pointers.delete(e.pointerId)) return
      multi = true
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
    canvas.addEventListener('pointercancel', onCancel)
    canvas.addEventListener('dblclick', onDbl)
    canvas.style.touchAction = 'none'
    this.cleanup.push(() => {
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onCancel)
      canvas.removeEventListener('dblclick', onDbl)
    })
  }
}
