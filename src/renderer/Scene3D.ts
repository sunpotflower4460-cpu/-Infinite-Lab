import { segmentDistance } from './hitTest'
import { pathGeometry, PathMaterial } from './Polyline3D'
import {
  DEFAULT_PRESENTATION,
  PALETTES,
  flowSigns,
  type Presentation,
  type Camera3DView,
  type Flow,
} from '../lab/presentation'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Line,
  Mesh,
  InstancedInterleavedBuffer,
  LineBasicMaterial,
  NormalBlending,
  PerspectiveCamera,
  OrthographicCamera,
  Points,
  PointsMaterial,
  Scene,
  Vector3,
  Vector2,
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
  presentation?(): Presentation
  selectedFlow?(): Flow
  onCamera?(view: Camera3DView): void
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
  onPick(step: number | null, flow?: Flow): void
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
  private readonly perspective = new PerspectiveCamera(40, 1, 0.1, 1e7)
  private readonly orthographic = new OrthographicCamera(-1, 1, 1, -1, 0.1, 1e7)
  private camera: PerspectiveCamera | OrthographicCamera = this.perspective
  private readonly controls: OrbitControls
  private positions = new Float32Array(3 * 131_072)
  private nativeAttribute = new BufferAttribute(this.positions, 3).setUsage(DynamicDrawUsage)
  private readonly nativeShown = new BufferGeometry().setAttribute('position', this.nativeAttribute)
  private readonly nativeContext = new BufferGeometry().setAttribute('position', this.nativeAttribute)
  private readonly nativeMaterials = Array.from(
    { length: 4 },
    () => new LineBasicMaterial({ transparent: true, depthWrite: false }),
  )
  private readonly nativeLines = this.nativeMaterials.map(
    (m, i) => new Line(i % 2 === 0 ? this.nativeShown : this.nativeContext, m),
  )
  private pathBuffer = new InstancedInterleavedBuffer(this.positions, 3, 1).setUsage(DynamicDrawUsage)
  private readonly shown = pathGeometry(this.pathBuffer)
  private readonly context = pathGeometry(this.pathBuffer)
  private readonly lineMaterial = new PathMaterial()
  private readonly contextMaterial = new PathMaterial()
  private readonly originalLine = new Mesh(this.shown, this.lineMaterial)
  private readonly originalContext = new Mesh(this.context, this.contextMaterial)
  private readonly derivedMaterial = new PathMaterial()
  private readonly derivedContextMaterial = new PathMaterial()
  private readonly derivedLine = new Mesh(this.shown, this.derivedMaterial)
  private readonly derivedContext = new Mesh(this.context, this.derivedContextMaterial)
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
    this.controls.addEventListener('change', () => {
      this.dirty = true
      if (!this.recording) this.source.onCamera?.(this.cameraView())
    })

    for (const line of [this.originalLine, this.originalContext, this.derivedLine, this.derivedContext])
      line.frustumCulled = false
    this.scene.add(
      this.originalContext,
      this.originalLine,
      this.derivedContext,
      this.derivedLine,
      ...this.nativeLines,
    )
    for (const line of this.nativeLines) line.frustumCulled = false
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
    const presentation = this.source.presentation?.()
    if (presentation?.camera) this.restoreCamera(presentation.camera)
    this.setAutoRotate(presentation?.autoRotate ?? false)
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
    const pres = this.source.presentation?.() ?? DEFAULT_PRESENTATION
    if (pres.mode !== 'solo') {
      const [sx, sy, sz] = flowSigns(pres.mode)
      const a = new Vector3(box.min.x * sx, box.min.y * sy, box.min.z * sz)
      const b = new Vector3(box.max.x * sx, box.max.y * sy, box.max.z * sz)
      box.min.min(a).min(b)
      box.max.max(a).max(b)
    }
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
    const halfV = (this.perspective.fov * Math.PI) / 360
    const halfFov = Math.min(halfV, Math.atan(Math.tan(halfV) * this.perspective.aspect))
    const distance = (radius / Math.sin(halfFov)) * 1.15
    const position = centre.clone().add(dir.normalize().multiplyScalar(distance))
    this.camera.near = distance / 1000
    this.camera.far = distance * 10 + radius
    this.updateProjection()
    if (smooth) {
      this.goal = { target: centre, position }
    } else {
      this.goal = null
      this.controls.target.copy(centre)
      this.camera.position.copy(position)
      this.updateProjection()
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
    this.updateProjection()
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
    this.controls.enabled = false
    this.savedView = { target: this.controls.target.clone(), position: this.camera.position.clone() }
    this.goal = null
    return this.canvas
  }

  /** Draw the frame showing steps up to `step` (deterministic: same step → same geometry). */
  renderRecordingStep(step: number, frame: number): HTMLCanvasElement {
    const r = this.recording!
    const to = Math.min(this.source.store.countUpToStep(step), this.uploaded)
    const trail = this.source.presentation?.().trail ?? 0
    const from = Math.max(r.from, trail ? this.source.store.firstIndexOfStep(step - trail + 1) : 0)
    this.applyState(from, to, 'hide', step, r.look)
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
    this.controls.enabled = true
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

  cameraView(): Camera3DView {
    return {
      position: this.camera.position.toArray(),
      target: this.controls.target.toArray(),
      projection: this.camera === this.orthographic ? 'orthographic' : 'perspective',
      zoom: this.camera.zoom,
    }
  }
  restoreCamera(view: Camera3DView): void {
    this.goal = null
    this.camera = view.projection === 'orthographic' ? this.orthographic : this.perspective
    this.controls.object = this.camera
    this.camera.zoom = view.zoom ?? 1
    this.camera.position.fromArray(view.position)
    this.controls.target.fromArray(view.target)
    const d = this.camera.position.distanceTo(this.controls.target)
    this.camera.near = d / 1000
    this.camera.far = d * 20
    this.updateProjection()
    this.controls.update()
    this.lastFit = performance.now()
    this.dirty = true
  }
  preset(view: 'top' | 'oblique'): void {
    this.goal = null
    if (this.recording) return
    const d = Math.max(1, this.camera.position.distanceTo(this.controls.target)) / this.camera.zoom
    this.camera = view === 'top' ? this.orthographic : this.perspective
    this.camera.zoom = 1
    this.controls.object = this.camera
    const dir = view === 'top' ? new Vector3(0, 0, 1) : new Vector3(3, -4, 2.5)
    this.camera.position.copy(this.controls.target).add(dir.normalize().multiplyScalar(d))
    this.updateProjection()
    this.controls.update()
    this.dirty = true
  }
  setAutoRotate(on: boolean): void {
    this.autoRotate = on
    this.controls.autoRotate = on
    this.dirty = true
  }

  async snapshotPng(): Promise<Blob> {
    this.sync()
    const [from, to] = this.shownRange()
    this.applyState(
      from,
      to,
      this.source.range()?.context ?? 'hide',
      this.source.markedStep(),
      this.source.look(),
    )
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
    this.nativeShown.dispose()
    this.nativeContext.dispose()
    this.nativeMaterials.forEach((m) => m.dispose())
    this.marker.geometry.dispose()
    this.guideLine.geometry.dispose()
    for (const m of [
      this.lineMaterial,
      this.contextMaterial,
      this.derivedMaterial,
      this.derivedContextMaterial,
      this.marker.material,
      this.guideLine.material,
    ])
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
    const p = this.source.presentation?.() ?? DEFAULT_PRESENTATION
    if (p.autoRotate !== this.autoRotate) this.setAutoRotate(p.autoRotate)
    const state = `${from}/${to}/${range?.context}/${marked}/${look}/${p.mode}/${p.palette}/${p.opacity}/${p.glow}/${p.width}/${p.flow}/${this.source.selectedFlow?.()}`
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
    if (
      (this.source.follow() || this.lastFit === 0) &&
      (grew || this.lastFit === 0) &&
      now - this.lastFit > FIT_INTERVAL_MS
    ) {
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
    const size = this.renderer.getSize(new Vector2())
    for (const m of [
      this.lineMaterial,
      this.contextMaterial,
      this.derivedMaterial,
      this.derivedContextMaterial,
    ])
      m.sync(size.x, size.y)
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
    this.nativeAttribute.addUpdateRange(3 * this.uploaded, 3 * (store.count - this.uploaded))
    this.nativeAttribute.needsUpdate = true
    this.pathBuffer.addUpdateRange(3 * this.uploaded, 3 * (store.count - this.uploaded))
    this.pathBuffer.needsUpdate = true
    this.shown.instanceCount = this.context.instanceCount = Math.max(0, store.count - 1)
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
    this.nativeShown.dispose()
    this.nativeContext.dispose()
    this.nativeAttribute = new BufferAttribute(next, 3).setUsage(DynamicDrawUsage)
    this.nativeShown.setAttribute('position', this.nativeAttribute)
    this.nativeContext.setAttribute('position', this.nativeAttribute)
    this.pathBuffer = new InstancedInterleavedBuffer(next, 3, 1).setUsage(DynamicDrawUsage)
    // dispose releases the old GPU allocation before rebinding the expanded shared buffer
    const template = pathGeometry(this.pathBuffer)
    for (const g of [this.shown, this.context]) {
      g.dispose()
      for (const [name, attribute] of Object.entries(template.attributes)) g.setAttribute(name, attribute)
    }
  }

  private reset(): void {
    this.uploaded = 0
    this.min.set(Infinity, Infinity, Infinity)
    this.max.set(-Infinity, -Infinity, -Infinity)
    if (!this.source.presentation?.().camera) this.lastFit = 0
    this.lastState = ''
  }

  /** Records [from, to) shown: the Microscope range (if any) up to the Timeline cut-off. */
  private shownRange(): [number, number] {
    const to = Math.min(this.source.visibleRecords(), this.uploaded)
    const range = this.source.range()
    const trail = this.source.presentation?.().trail ?? 0
    const head = to > 0 ? this.source.store.stepAt(to - 1) : 0
    const start = Math.max(range?.from ?? 0, trail ? head - trail + 1 : 0)
    const from = start ? Math.min(this.source.store.firstIndexOfStep(start), to) : 0
    return [from, to]
  }

  private applyState(from: number, to: number, context: 'dim' | 'hide', marked: number | null, look: Look) {
    const style = LOOKS[look]
    const p = this.source.presentation?.() ?? DEFAULT_PRESENTATION
    const paired = p.mode !== 'solo'
    const [a, b] = PALETTES[p.palette]
    const signs = flowSigns(p.mode)
    this.guideLine.scale.set(
      ...(paired && this.source.selectedFlow?.() === 'derived'
        ? signs
        : ([1, 1, 1] as [number, number, number])),
    )
    this.derivedLine.scale.set(...signs)
    this.derivedContext.scale.set(...signs)
    this.originalLine.visible = this.originalContext.visible = !paired || p.flow !== 'derived'
    this.derivedLine.visible = this.derivedContext.visible = paired && p.flow !== 'original'
    const luminous = look === 'luminous'
    this.renderer.setClearColor(new Color(style.background))
    for (const m of [this.lineMaterial, this.contextMaterial]) {
      m.color.set(style.line)
      m.blending = luminous && !paired ? AdditiveBlending : NormalBlending
    }
    if (paired) this.lineMaterial.color.set(a)
    this.lineMaterial.opacity = paired ? Math.min(1, p.opacity * (1 + p.glow * 0.5)) : luminous ? 0.3 : 0.55
    this.lineMaterial.linewidth = p.width
    this.derivedMaterial.color.set(b)
    this.derivedMaterial.blending = this.lineMaterial.blending
    this.derivedMaterial.opacity = this.lineMaterial.opacity
    this.derivedMaterial.linewidth = p.width
    this.derivedContextMaterial.color.set(b)
    this.derivedContextMaterial.opacity = 0.05
    this.contextMaterial.opacity = luminous ? 0.04 : 0.08

    // a polyline joins consecutive records: the shown range starts at `from`, the faint context
    // runs up to (and including) the first shown point so the curve stays connected
    this.lineMaterial.range(from, to)
    this.derivedMaterial.range(from, to)
    const contextTo = !p.trail && context === 'dim' && from > 0 ? from + 1 : 0
    this.contextMaterial.range(0, contextTo)
    this.derivedContextMaterial.range(0, contextTo)
    // Native thin lines preserve the existing fast path. Wider lines use AA screen quads;
    // at very high density use thin strokes (presentation quality only, never decimate data).
    const wide = p.width !== 1 && to - from < 50_000
    this.shown.instanceCount = this.context.instanceCount = Math.max(0, to - 1)
    this.nativeShown.setDrawRange(from, Math.max(0, to - from))
    this.nativeContext.setDrawRange(0, contextTo)
    const materials = [
      this.lineMaterial,
      this.contextMaterial,
      this.derivedMaterial,
      this.derivedContextMaterial,
    ]
    const shown = [
      !paired || p.flow !== 'derived',
      contextTo > 0 && (!paired || p.flow !== 'derived'),
      paired && p.flow !== 'original',
      contextTo > 0 && paired && p.flow !== 'original',
    ]
    const meshes = [this.originalLine, this.originalContext, this.derivedLine, this.derivedContext]
    this.nativeLines.forEach((line, i) => {
      const m = this.nativeMaterials[i]!,
        source = materials[i]!
      m.color.copy(source.color)
      m.opacity = source.opacity
      m.blending = source.blending
      line.scale.set(...(i >= 2 ? signs : ([1, 1, 1] as [number, number, number])))
      line.visible = !wide && shown[i]!
      meshes[i]!.visible = wide && shown[i]!
    })

    const store = this.source.store
    const index = marked === null ? -1 : store.firstIndexOfStep(marked)
    this.marker.visible = index >= from && index < to && store.stepAt(index) === marked
    if (this.marker.visible) {
      this.markerPosition.set(this.positions.subarray(3 * index, 3 * index + 3))
      if (paired && this.source.selectedFlow?.() === 'derived')
        this.markerPosition.set(this.markerPosition.map((v, i) => v * signs[i]!))
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
    this.perspective.aspect = w / h
    this.updateProjection()
    this.dirty = true
  }

  private updateProjection(): void {
    const h = Math.max(1, this.host.clientHeight)
    const aspect = Math.max(1, this.host.clientWidth) / h
    const d = this.camera.position.distanceTo(this.controls.target)
    const halfH = Math.max(1e-6, d * Math.tan((this.perspective.fov * Math.PI) / 360))
    this.orthographic.left = -halfH * aspect
    this.orthographic.right = halfH * aspect
    this.orthographic.top = halfH
    this.orthographic.bottom = -halfH
    this.camera.updateProjectionMatrix()
  }

  // ---- picking -------------------------------------------------------------------

  /** A click (not a drag) inspects the shown step whose point is nearest on screen. */
  private installPicking(): void {
    let down: { x: number; y: number } | null = null
    const pointers = new Set<number>()
    this.canvas.addEventListener('pointerdown', (e) => {
      pointers.add(e.pointerId)
      down = pointers.size === 1 ? { x: e.clientX, y: e.clientY } : null
    })
    this.canvas.addEventListener('pointercancel', (e) => {
      pointers.delete(e.pointerId)
      down = null
    })
    this.canvas.addEventListener('pointerup', (e) => {
      pointers.delete(e.pointerId)
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) >= 4) return
      down = null
      const rect = this.canvas.getBoundingClientRect()
      const hit = this.pick(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height)
      this.source.onPick(hit?.step ?? null, hit?.flow)
    })
  }

  private pick(sx: number, sy: number, width: number, height: number): { step: number; flow: Flow } | null {
    const [from, to] = this.shownRange()
    this.camera.updateMatrixWorld()
    const m = this.camera.projectionMatrix.clone().multiply(this.camera.matrixWorldInverse).elements
    const p = this.positions
    let best = -1
    let bestD = PICK_TOLERANCE_PX * PICK_TOLERANCE_PX
    const pres = this.source.presentation?.() ?? DEFAULT_PRESENTATION
    let flow: Flow = 'original'
    const flows: Flow[] =
      pres.mode === 'solo' ? ['original'] : pres.flow === 'both' ? ['original', 'derived'] : [pres.flow]
    for (const which of flows) {
      const signs = which === 'derived' ? flowSigns(pres.mode) : [1, 1, 1]
      let previous: [number, number] | null = null
      for (let i = from; i < to; i++) {
        const x = p[3 * i]! * signs[0]!
        const y = p[3 * i + 1]! * signs[1]!
        const z = p[3 * i + 2]! * signs[2]!
        const w = m[3]! * x + m[7]! * y + m[11]! * z + m[15]!
        if (w <= 0) {
          previous = null
          continue
        } // behind the camera
        const px = ((m[0]! * x + m[4]! * y + m[8]! * z + m[12]!) / w + 1) * 0.5 * width
        const py = (1 - (m[1]! * x + m[5]! * y + m[9]! * z + m[13]!) / w) * 0.5 * height
        const d = previous
          ? segmentDistance(sx, sy, previous[0], previous[1], px, py) ** 2
          : (px - sx) ** 2 + (py - sy) ** 2
        previous = [px, py]
        if (d < bestD) {
          bestD = d
          best = i
          flow = which
        }
      }
    }
    return best < 0 ? null : { step: this.source.store.stepAt(best), flow }
  }
}
