import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Line,
  LineBasicMaterial,
  NormalBlending,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { KIND } from '../geometry/batch'
import type { GeometryStore } from '../geometry/GeometryStore'
import type { GeometryInstruction } from '../geometry/types'
import type { Extent } from '../experiments/core/types'
import { COLORS, LOOKS, type Look } from './layers/GeometryLayer'

/** What the 3D view reads each frame (the lab's state; the view never changes the data). */
export interface Scene3DSource {
  store: GeometryStore
  /** Records shown (Timeline / Microscope cut-off applied). */
  visibleRecords(): number
  /** Microscope: first shown step and whether earlier steps stay as faint context. */
  range(): { from: number; context: 'dim' | 'hide' } | null
  /** Step to mark (current or inspected), or null. */
  markedStep(): number | null
  /** Guide at the marked step (e.g. the machine's arms): points joined in order; never data. */
  guide(): GeometryInstruction[] | null
  look(): Look
  /** Region the rule can reach (framed from the first step), or null. */
  extent(): Extent | null
  follow(): boolean
  onUserCamera(): void
  onPick(step: number | null): void
}

const FIT_INTERVAL_MS = 200
/** Fraction of the remaining way the camera moves per frame while following (smooth, no jumps). */
const FOLLOW_EASE = 0.15
const PICK_TOLERANCE_PX = 10

/**
 * Draws the points of a 3D experiment (records of kind `point` with z) as one polyline joining
 * consecutive steps, with an orbit camera. Presentation only: positions go to the GPU as
 * float32 relative to the view, while the data (and every export / digest) stays float64.
 */
export class Scene3D {
  private readonly renderer: WebGLRenderer
  private readonly scene = new Scene()
  private readonly camera = new PerspectiveCamera(40, 1, 0.1, 1e7)
  private readonly controls: OrbitControls
  private positions = new Float32Array(3 * 131_072)
  private attribute = new BufferAttribute(this.positions, 3)
  private readonly shown = new BufferGeometry()
  private readonly context = new BufferGeometry()
  private readonly lineMaterial = new LineBasicMaterial({ transparent: true, depthWrite: false })
  private readonly contextMaterial = new LineBasicMaterial({ transparent: true, depthWrite: false })
  private readonly marker: Points
  private readonly markerPosition = new Float32Array(3)
  private readonly guidePositions = new Float32Array(3 * 8)
  private readonly guideLine: Line
  private lastGuide: GeometryInstruction[] | null = null
  private uploaded = 0
  private generation = -1
  private lastFollow = false
  private savedView: { target: Vector3; position: Vector3 } | null = null
  private readonly min = new Vector3(Infinity, Infinity, Infinity)
  private readonly max = new Vector3(-Infinity, -Infinity, -Infinity)
  private frameId = 0
  private dirty = true
  private lastFit = 0
  private lastState = ''
  private lastRange = ''
  private autoRotate = false
  /** Camera goal while following: eased towards each frame instead of jumping. */
  private goal: { target: Vector3; position: Vector3 } | null = null
  /** Video recording: records [from, to) drawn regardless of the lab's Timeline. */
  private recording: { from: number; to: number; look: Look } | null = null
  private readonly resizeObserver: ResizeObserver
  private readonly canvas: HTMLCanvasElement

  constructor(
    private readonly host: HTMLElement,
    private readonly source: Scene3DSource,
  ) {
    this.renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.canvas = this.renderer.domElement
    this.canvas.dataset.testid = 'canvas-3d'
    host.appendChild(this.canvas)

    this.camera.up.set(0, 0, 1) // z is "up" (height / the torus axis)
    this.camera.position.set(3, -4, 2.5)
    this.controls = new OrbitControls(this.camera, this.canvas)
    this.controls.addEventListener('start', () => {
      this.goal = null
      this.source.onUserCamera()
      this.dirty = true
    })
    this.controls.addEventListener('change', () => (this.dirty = true))

    for (const g of [this.shown, this.context]) g.setAttribute('position', this.attribute)
    this.attribute.setUsage(DynamicDrawUsage)
    this.scene.add(new Line(this.context, this.contextMaterial))
    this.scene.add(new Line(this.shown, this.lineMaterial))
    const markerGeometry = new BufferGeometry()
    markerGeometry.setAttribute('position', new BufferAttribute(this.markerPosition, 3))
    this.marker = new Points(
      markerGeometry,
      new PointsMaterial({ color: COLORS.highlight, size: 9, sizeAttenuation: false, depthTest: false }),
    )
    this.marker.renderOrder = 1
    this.marker.visible = false
    this.scene.add(this.marker)
    const guideGeometry = new BufferGeometry()
    guideGeometry.setAttribute('position', new BufferAttribute(this.guidePositions, 3))
    this.guideLine = new Line(
      guideGeometry,
      new LineBasicMaterial({ color: COLORS.highlight, transparent: true, opacity: 0.9, depthTest: false }),
    )
    this.guideLine.renderOrder = 2
    this.guideLine.visible = false
    this.scene.add(this.guideLine)

    this.installPicking()
    this.canvas.addEventListener('dblclick', () => this.fit())
    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(host)
    this.resize()
    this.loop()
  }

  /**
   * Frame everything shown (and the region the rule can reach). `smooth`: ease the camera there
   * over the next frames (following growing geometry) instead of jumping.
   */
  fit(smooth = false): void {
    const [from, to] = this.shownRange()
    const box = from === 0 ? { min: this.min.clone(), max: this.max.clone() } : this.boundsOf(from, to)
    const extent = from === 0 && !this.recording ? this.source.extent() : null
    if (extent) {
      box.min.min(new Vector3(extent.minX, extent.minY, extent.minZ))
      box.max.max(new Vector3(extent.maxX, extent.maxY, extent.maxZ))
    }
    if (!Number.isFinite(box.min.x)) return
    const centre = box.min.clone().add(box.max).multiplyScalar(0.5)
    // bounding sphere about the box centre: the farthest shown point (sampled when there are
    // very many), at least the reachable region's half-size — not the box's half-diagonal,
    // which would leave a ball or a torus small in the frame
    let r2 = 0
    const p = this.positions
    const stride = Math.max(1, Math.ceil((to - from) / 200_000))
    for (let i = from; i < to; i += stride) {
      const dx = p[3 * i]! - centre.x
      const dy = p[3 * i + 1]! - centre.y
      const dz = p[3 * i + 2]! - centre.z
      r2 = Math.max(r2, dx * dx + dy * dy + dz * dz)
    }
    const half = box.max.clone().sub(box.min).multiplyScalar(0.5)
    const reach = extent ? Math.max(half.x, half.y, half.z) : 0
    const radius = Math.max(Math.sqrt(r2) * (stride > 1 ? 1.02 : 1), reach, 1e-6)
    const dir = this.camera.position.clone().sub(this.controls.target)
    if (dir.lengthSq() === 0) dir.set(3, -4, 2.5)
    // the narrower of the vertical and horizontal field of view (portrait phones: horizontal)
    const halfV = (this.camera.fov * Math.PI) / 360
    const halfFov = Math.min(halfV, Math.atan(Math.tan(halfV) * this.camera.aspect))
    const distance = (radius / Math.sin(halfFov)) * 1.15
    const position = centre.clone().add(dir.normalize().multiplyScalar(distance))
    this.camera.near = distance / 1000
    this.camera.far = distance * 10 + radius
    this.camera.updateProjectionMatrix()
    if (smooth) {
      this.goal = { target: centre, position }
    } else {
      this.goal = null
      this.controls.target.copy(centre)
      this.camera.position.copy(position)
      this.controls.update()
    }
    this.dirty = true
  }

  private easeCamera(): void {
    if (!this.goal) return
    const { target, position } = this.goal
    this.controls.target.lerp(target, FOLLOW_EASE)
    this.camera.position.lerp(position, FOLLOW_EASE)
    if (this.camera.position.distanceTo(position) < 1e-3 * position.distanceTo(target)) {
      this.controls.target.copy(target)
      this.camera.position.copy(position)
      this.goal = null
    }
    this.controls.update()
    this.dirty = true
  }

  // ---- video ---------------------------------------------------------------------

  /**
   * Start recording steps [fromStep, toStep]: frame that range once (the camera then stays
   * still, or turns if ⟳ Rotate is on) and return the canvas each frame is drawn on.
   */
  beginRecording(fromStep: number, toStep: number, look: Look): HTMLCanvasElement {
    this.sync()
    const store = this.source.store
    this.recording = { from: store.firstIndexOfStep(fromStep), to: store.countUpToStep(toStep), look }
    this.savedView = { target: this.controls.target.clone(), position: this.camera.position.clone() }
    this.goal = null
    this.fit()
    return this.canvas
  }

  /** Draw the frame showing steps up to `step` (deterministic: same step → same geometry). */
  renderRecordingStep(step: number, frame: number): HTMLCanvasElement {
    const r = this.recording!
    const to = Math.min(this.source.store.countUpToStep(step), this.uploaded)
    this.applyState(r.from, to, 'hide', step, r.look)
    this.applyGuide(null)
    this.marker.visible = false
    if (this.autoRotate) {
      // a fixed turn per frame (≈ 2 rpm at 30 fps), independent of how fast frames are encoded
      const offset = this.camera.position.clone().sub(this.controls.target)
      offset.applyAxisAngle(new Vector3(0, 0, 1), frame === 0 ? 0 : (2 * Math.PI) / 900)
      this.camera.position.copy(this.controls.target).add(offset)
      this.camera.lookAt(this.controls.target)
    }
    this.render()
    return this.canvas
  }

  endRecording(): void {
    this.recording = null
    if (this.savedView) {
      // the view is back where it was (as the 2D view after a recording)
      this.controls.target.copy(this.savedView.target)
      this.camera.position.copy(this.savedView.position)
      this.savedView = null
    }
    this.lastState = ''
    this.lastGuide = null
    this.controls.update()
    this.dirty = true
  }

  setAutoRotate(on: boolean): void {
    this.autoRotate = on
    this.controls.autoRotate = on
    this.dirty = true
  }

  async snapshotPng(): Promise<Blob> {
    this.render()
    return new Promise((resolve, reject) =>
      this.canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png'),
    )
  }

  destroy(): void {
    cancelAnimationFrame(this.frameId)
    this.resizeObserver.disconnect()
    this.controls.dispose()
    this.shown.dispose()
    this.context.dispose()
    this.marker.geometry.dispose()
    this.guideLine.geometry.dispose()
    for (const m of [this.lineMaterial, this.contextMaterial, this.marker.material, this.guideLine.material])
      (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose())
    this.renderer.dispose()
    // release the GL context now: browsers keep only ~16, and the oldest (possibly the 2D
    // canvas's) is dropped when switching 2D ↔ 3D often
    this.renderer.forceContextLoss()
    this.canvas.remove()
  }

  // ---- per frame ---------------------------------------------------------------

  private loop = (): void => {
    this.frameId = requestAnimationFrame(this.loop)
    if (this.recording) return // frames are drawn by renderRecordingStep
    const grew = this.sync()
    const [from, to] = this.shownRange()
    const range = this.source.range()
    const marked = this.source.markedStep()
    const look = this.source.look()
    const guide = this.source.guide()
    if (guide !== this.lastGuide) {
      this.lastGuide = guide
      this.applyGuide(guide)
    }
    const state = `${from}/${to}/${range?.context}/${marked}/${look}`
    if (state !== this.lastState) {
      this.lastState = state
      this.applyState(from, to, range?.context ?? 'hide', marked, look)
    }
    const rangeKey = range ? `${range.from}-${to}` : ''
    if (rangeKey !== this.lastRange) {
      const leaving = this.lastRange !== '' && !range
      this.lastRange = rangeKey
      // entering / moving the Microscope frames its range, leaving it frames everything (as in 2D)
      if (range || leaving) this.fit()
    }
    const follow = this.source.follow()
    if (follow && !this.lastFollow && this.lastFit !== 0) this.fit(true) // Fit All pressed
    this.lastFollow = follow
    const now = performance.now()
    if (this.source.follow() && (grew || this.lastFit === 0) && now - this.lastFit > FIT_INTERVAL_MS) {
      const first = this.lastFit === 0
      this.lastFit = now
      this.fit(!first)
    }
    this.easeCamera()
    if (this.autoRotate) this.controls.update()
    if (this.dirty) this.render()
  }

  private render(): void {
    this.dirty = false
    this.renderer.render(this.scene, this.camera)
  }

  /** Upload records appended since the last frame; start over after a reset. Returns true if new. */
  private sync(): boolean {
    const store = this.source.store
    if (store.generation !== this.generation || store.count < this.uploaded) {
      this.generation = store.generation // a restart (clear), even if the new run already caught up
      this.reset()
    }
    if (store.count === this.uploaded) return false
    this.reserve(store.count)
    const p = this.positions
    store.forEachRecordFrom(this.uploaded, store.count, (d, o, i) => {
      // 3D experiments emit exactly one point per step; anything else sits at the origin
      const isPoint = d[o] === KIND.point
      const x = isPoint ? d[o + 2]! : 0
      const y = isPoint ? d[o + 3]! : 0
      const z = isPoint ? d[o + 4]! : 0
      p[3 * i] = x
      p[3 * i + 1] = y
      p[3 * i + 2] = z
      if (x < this.min.x) this.min.x = x
      if (y < this.min.y) this.min.y = y
      if (z < this.min.z) this.min.z = z
      if (x > this.max.x) this.max.x = x
      if (y > this.max.y) this.max.y = y
      if (z > this.max.z) this.max.z = z
    })
    this.attribute.addUpdateRange(3 * this.uploaded, 3 * (store.count - this.uploaded))
    this.attribute.needsUpdate = true
    this.uploaded = store.count
    this.lastState = '' // draw ranges may need the new records
    this.dirty = true
    return true
  }

  private reserve(count: number): void {
    if (3 * count <= this.positions.length) return
    let size = this.positions.length
    while (size < 3 * count) size *= 2
    const next = new Float32Array(size)
    next.set(this.positions.subarray(0, 3 * this.uploaded))
    this.positions = next
    this.attribute = new BufferAttribute(next, 3)
    this.attribute.setUsage(DynamicDrawUsage)
    for (const g of [this.shown, this.context]) g.setAttribute('position', this.attribute)
  }

  private reset(): void {
    this.uploaded = 0
    this.min.set(Infinity, Infinity, Infinity)
    this.max.set(-Infinity, -Infinity, -Infinity)
    this.lastFit = 0
    this.lastState = ''
  }

  /** Records [from, to) shown: the Microscope range (if any) up to the Timeline cut-off. */
  private shownRange(): [number, number] {
    const to = Math.min(this.source.visibleRecords(), this.uploaded)
    const range = this.source.range()
    const from = range ? Math.min(this.source.store.firstIndexOfStep(range.from), to) : 0
    return [from, to]
  }

  private applyState(from: number, to: number, context: 'dim' | 'hide', marked: number | null, look: Look) {
    const style = LOOKS[look]
    const luminous = look === 'luminous'
    this.renderer.setClearColor(new Color(style.background))
    for (const m of [this.lineMaterial, this.contextMaterial]) {
      m.color.set(style.line)
      m.blending = luminous ? AdditiveBlending : NormalBlending
    }
    this.lineMaterial.opacity = luminous ? 0.3 : 0.55
    this.contextMaterial.opacity = luminous ? 0.04 : 0.08
    this.lineMaterial.needsUpdate = this.contextMaterial.needsUpdate = true

    // a polyline joins consecutive records: the shown range starts at `from`, the faint context
    // runs up to (and including) the first shown point so the curve stays connected
    this.shown.setDrawRange(from, Math.max(0, to - from))
    this.context.setDrawRange(0, context === 'dim' && from > 0 ? from + 1 : 0)

    const store = this.source.store
    const index = marked === null ? -1 : store.firstIndexOfStep(marked)
    this.marker.visible = index >= 0 && index < to && store.stepAt(index) === marked
    if (this.marker.visible) {
      this.markerPosition.set(this.positions.subarray(3 * index, 3 * index + 3))
      this.marker.geometry.attributes.position!.needsUpdate = true
    }
    this.dirty = true
  }

  private applyGuide(guide: GeometryInstruction[] | null): void {
    const pts = (guide ?? []).filter((g) => g.type === 'point').slice(0, 8)
    pts.forEach((g, i) => {
      if (g.type !== 'point') return
      this.guidePositions.set([g.x, g.y, g.z ?? 0], 3 * i)
    })
    this.guideLine.geometry.setDrawRange(0, pts.length)
    this.guideLine.geometry.attributes.position!.needsUpdate = true
    this.guideLine.visible = pts.length > 1
    this.dirty = true
  }

  private boundsOf(from: number, to: number): { min: Vector3; max: Vector3 } {
    const min = new Vector3(Infinity, Infinity, Infinity)
    const max = new Vector3(-Infinity, -Infinity, -Infinity)
    const p = this.positions
    for (let i = from; i < to; i++) {
      min.min(new Vector3(p[3 * i], p[3 * i + 1], p[3 * i + 2]))
      max.max(new Vector3(p[3 * i], p[3 * i + 1], p[3 * i + 2]))
    }
    return { min, max }
  }

  private resize(): void {
    const w = Math.max(1, this.host.clientWidth)
    const h = Math.max(1, this.host.clientHeight)
    this.renderer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.dirty = true
  }

  // ---- picking -------------------------------------------------------------------

  /** A click (not a drag) inspects the shown step whose point is nearest on screen. */
  private installPicking(): void {
    let down: { x: number; y: number } | null = null
    this.canvas.addEventListener('pointerdown', (e) => {
      down = e.isPrimary ? { x: e.clientX, y: e.clientY } : null
    })
    this.canvas.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) >= 4) return
      down = null
      const rect = this.canvas.getBoundingClientRect()
      this.source.onPick(this.pick(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height))
    })
  }

  private pick(sx: number, sy: number, width: number, height: number): number | null {
    const [from, to] = this.shownRange()
    this.camera.updateMatrixWorld()
    const m = this.camera.projectionMatrix.clone().multiply(this.camera.matrixWorldInverse).elements
    const p = this.positions
    let best = -1
    let bestD = PICK_TOLERANCE_PX * PICK_TOLERANCE_PX
    for (let i = from; i < to; i++) {
      const x = p[3 * i]!
      const y = p[3 * i + 1]!
      const z = p[3 * i + 2]!
      const w = m[3]! * x + m[7]! * y + m[11]! * z + m[15]!
      if (w <= 0) continue // behind the camera
      const px = ((m[0]! * x + m[4]! * y + m[8]! * z + m[12]!) / w + 1) * 0.5 * width
      const py = (1 - (m[1]! * x + m[5]! * y + m[9]! * z + m[13]!) / w) * 0.5 * height
      const d = (px - sx) ** 2 + (py - sy) ** 2
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    return best < 0 ? null : this.source.store.stepAt(best)
  }
}
