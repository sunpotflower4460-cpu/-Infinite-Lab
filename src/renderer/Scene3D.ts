import { setFlowTransform } from './flowTransform'
import { PointPath3D } from './PointPath3D'
import { ThirdCircleConstruction } from './ThirdCircleConstruction'
import type { ThirdCircleFrame } from '../lab/thirdCircle'
import { segmentDistance } from './hitTest'
import { pathGeometry, PathMaterial } from './Polyline3D'
import {
  DEFAULT_PRESENTATION,
  flowColor,
  flowAxes,
  visibleFlows,
  transformFlowPoint,
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
  TorusGeometry,
  MeshBasicMaterial,
  DoubleSide,
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
  thirdStore?(): GeometryStore | null
  thirdFrame?(step?: number): ThirdCircleFrame | null
  torusRadii?(): { major: number; minor: number } | null
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
    { length: 6 },
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
  private readonly thirdMaterial = new PathMaterial()
  private readonly thirdContextMaterial = new PathMaterial()
  private readonly thirdLine = new Mesh(this.shown, this.thirdMaterial)
  private readonly thirdContext = new Mesh(this.context, this.thirdContextMaterial)
  private torusShell: Mesh<TorusGeometry, MeshBasicMaterial> | null = null
  private shellKey = ''
  private thirdPath: PointPath3D | null = null
  private readonly construction = new ThirdCircleConstruction()
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

    for (const line of [
      this.originalLine,
      this.originalContext,
      this.derivedLine,
      this.derivedContext,
      this.thirdLine,
      this.thirdContext,
    ])
      line.frustumCulled = false
    this.scene.add(
      this.originalContext,
      this.originalLine,
      this.derivedContext,
      this.derivedLine,
      this.thirdContext,
      this.thirdLine,
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
    this.scene.add(this.construction.group)

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
    const flows = visibleFlows(pres, !!this.source.torusRadii?.())
    if (flows.includes('third') && this.thirdPath) {
      const a = this.thirdPath.positions
      if (from === 0 && this.thirdPath.uploaded) {
        box.min.min(this.thirdPath.min)
        box.max.max(this.thirdPath.max)
      } else
        for (let i = from; i < Math.min(to, this.thirdPath.uploaded); i++) {
          const q = new Vector3(a[3 * i], a[3 * i + 1], a[3 * i + 2])
          box.min.min(q)
          box.max.max(q)
        }
    }
    const marked = this.source.markedStep(),
      markedIndex = marked === null ? -1 : this.source.store.firstIndexOfStep(marked)
    const guideStep =
      markedIndex >= from && markedIndex < to
        ? (marked ?? undefined)
        : to > 0
          ? this.source.store.stepAt(to - 1)
          : undefined
    const frame =
      flows.includes('third') && pres.thirdModel === 'circle' && pres.thirdOpacity > 0
        ? this.source.thirdFrame?.(guideStep)
        : null
    const circles: { center: Vector3; x: Vector3; y: Vector3; radius: number }[] =
      frame && pres.thirdGuides
        ? [
            { center: new Vector3(), x: new Vector3(1, 0, 0), y: new Vector3(0, 1, 0), radius: frame.major },
            {
              center: new Vector3(...frame.elbow),
              x: new Vector3(...frame.sample.radial),
              y: new Vector3(0, 0, 1),
              radius: frame.minor,
            },
            {
              center: new Vector3(...frame.center),
              x: new Vector3(...frame.sample.tangent),
              y: new Vector3(0, 0, 1),
              radius: frame.sample.radius,
            },
          ]
        : []
    for (const c of circles) {
      const half = new Vector3(
        Math.hypot(c.x.x, c.y.x),
        Math.hypot(c.x.y, c.y.y),
        Math.hypot(c.x.z, c.y.z),
      ).multiplyScalar(c.radius)
      box.min.min(c.center.clone().sub(half))
      box.max.max(c.center.clone().add(half))
    }
    const corners: Vector3[] = []
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y])
        for (const z of [box.min.z, box.max.z]) corners.push(new Vector3(x, y, z))
    for (const flow of flows)
      for (const p of corners) {
        const q = new Vector3(...transformFlowPoint(p.x, p.y, p.z, pres, flow))
        box.min.min(q)
        box.max.max(q)
      }
    const centre = box.min.clone().add(box.max).multiplyScalar(0.5)
    // bounding sphere about the box centre: the farthest shown point (sampled when there are
    // very many), at least the reachable region's half-size — not the box's half-diagonal,
    // which would leave a ball or a torus small in the frame
    let r2 = 0
    const p = this.positions
    const axes = flows.map((flow) => ({
      axes: flowAxes(pres, flow),
      path: flow === 'third' ? this.thirdPath : null,
    }))
    const stride = Math.max(1, Math.ceil(((to - from) * flows.length) / 200_000))
    for (let i = from; i < to; i += stride) {
      for (const item of axes) {
        if (item.path && i >= item.path.uploaded) continue
        const data = item.path?.positions ?? p
        const x = data[3 * i]!,
          y = data[3 * i + 1]!,
          z = data[3 * i + 2]!
        const [a, b, c, d, e] = item.axes
        const dx = a * x + b * y - centre.x
        const dy = c * x + d * y - centre.y
        const dz = e * z - centre.z
        r2 = Math.max(r2, dx * dx + dy * dy + dz * dz)
      }
    }
    for (const c of circles) {
      const offset = c.center.clone().sub(centre)
      r2 = Math.max(
        r2,
        offset.lengthSq() + c.radius * c.radius + 2 * c.radius * Math.hypot(offset.dot(c.x), offset.dot(c.y)),
      )
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
    this.syncThird()
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
    this.syncThird()
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
      this.thirdMaterial,
      this.thirdContextMaterial,
      this.marker.material,
      this.guideLine.material,
    ])
      (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose())
    this.torusShell?.geometry.dispose()
    this.torusShell?.material.dispose()
    this.thirdPath?.dispose()
    this.construction.dispose()
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
    const thirdGrew = this.syncThird()
    if (thirdGrew) {
      this.lastState = ''
      this.dirty = true
    }
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
    const state =
      `${from}/${to}/${range?.context}/${marked}/${look}/${p.mode}/${p.palette}/${p.opacity}/${p.glow}/${p.width}/${p.flow}/${this.source.selectedFlow?.()}` +
      '/' +
      [
        p.thirdFlow,
        p.thirdModel,
        p.thirdRadius,
        p.thirdGuides,
        p.thirdTrace,
        p.thirdOpacity,
        p.thirdQuarter,
        p.torusSurface,
        this.source.torusRadii?.()?.major,
        this.source.torusRadii?.()?.minor,
      ].join('/')
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
      (grew || thirdGrew || this.lastFit === 0) &&
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
      this.thirdMaterial,
      this.thirdContextMaterial,
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

  private syncThird(): boolean {
    const store = this.source.thirdStore?.()
    if (!store) {
      if (!this.thirdPath) return false
      this.thirdPath.dispose()
      this.thirdPath = null
      return true
    }
    this.thirdPath ??= new PointPath3D()
    return this.thirdPath.sync(store)
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
    const flows = visibleFlows(p, !!this.source.torusRadii?.())
    const selected = this.source.selectedFlow?.() ?? 'original'
    const markedFlow = flows.includes(selected) ? selected : flows[0]!
    const paired = p.mode !== 'solo'
    const luminous = look === 'luminous'
    this.renderer.setClearColor(new Color(style.background))
    this.syncTorusSurface(p)
    const contextTo = !p.trail && context === 'dim' && from > 0 ? from + 1 : 0
    const wide = p.width !== 1 && to - from < 50_000
    this.shown.instanceCount = this.context.instanceCount = Math.max(0, to - 1)
    this.nativeShown.setDrawRange(from, Math.max(0, to - from))
    this.nativeContext.setDrawRange(0, contextTo)
    this.thirdLine.geometry = this.thirdPath?.shown ?? this.shown
    this.thirdContext.geometry = this.thirdPath?.context ?? this.context
    this.nativeLines[4]!.geometry = this.thirdPath?.nativeShown ?? this.nativeShown
    this.nativeLines[5]!.geometry = this.thirdPath?.nativeContext ?? this.nativeContext
    const thirdTo = Math.min(to, this.thirdPath?.uploaded ?? to)
    this.thirdPath?.range(from, thirdTo, contextTo)
    const materials = [
      this.lineMaterial,
      this.contextMaterial,
      this.derivedMaterial,
      this.derivedContextMaterial,
      this.thirdMaterial,
      this.thirdContextMaterial,
    ]
    const meshes = [
      this.originalLine,
      this.originalContext,
      this.derivedLine,
      this.derivedContext,
      this.thirdLine,
      this.thirdContext,
    ]
    const allFlows: Flow[] = ['original', 'derived', 'third']
    this.nativeLines.forEach((line, i) => {
      const flow = allFlows[Math.floor(i / 2)]!
      const isContext = i % 2 === 1
      const m = materials[i]!,
        native = this.nativeMaterials[i]!,
        mesh = meshes[i]!
      m.color.set(!paired && flow === 'original' ? style.line : flowColor(p, flow))
      m.blending = luminous && !paired ? AdditiveBlending : NormalBlending
      m.opacity =
        flow === 'third'
          ? p.thirdOpacity * (isContext ? 0.12 : this.thirdPath && p.thirdGuides ? 0.3 : 1)
          : isContext
            ? luminous
              ? 0.04
              : 0.08
            : paired
              ? Math.min(1, p.opacity * (1 + p.glow * 0.5))
              : luminous
                ? 0.3
                : 0.55
      m.linewidth = p.width
      const end = flow === 'third' ? thirdTo : to
      m.range(isContext ? 0 : from, isContext ? Math.min(contextTo, end) : end)
      native.color.copy(m.color)
      native.opacity = m.opacity
      native.blending = m.blending
      setFlowTransform(line, p, flow)
      setFlowTransform(mesh, p, flow)
      const show =
        flows.includes(flow) &&
        !(flow === 'third' && this.thirdPath && !p.thirdTrace) &&
        m.opacity > 0 &&
        (isContext ? contextTo > 0 : end > from)
      line.visible = show && !wide
      mesh.visible = show && wide
    })
    setFlowTransform(this.guideLine, p, markedFlow)
    const markVisible = markedFlow !== 'third' || p.thirdOpacity > 0
    this.guideLine.visible = this.guideLine.geometry.drawRange.count > 1 && markVisible && !this.thirdPath
    ;(this.guideLine.material as LineBasicMaterial).color.set(
      markedFlow === 'third' ? flowColor(p, 'third') : COLORS.highlight,
    )
    const store = this.source.store
    const index = marked === null ? -1 : store.firstIndexOfStep(marked)
    this.marker.visible =
      markVisible &&
      index >= from &&
      index < (markedFlow === 'third' ? thirdTo : to) &&
      store.stepAt(index) === marked
    if (this.marker.visible) {
      const original = (
        markedFlow === 'third' && this.thirdPath ? this.thirdPath.positions : this.positions
      ).subarray(3 * index, 3 * index + 3)
      this.markerPosition.set(transformFlowPoint(original[0]!, original[1]!, original[2]!, p, markedFlow))
      ;(this.marker.material as PointsMaterial).color.set(
        markedFlow === 'third' ? flowColor(p, 'third') : COLORS.highlight,
      )
      this.marker.geometry.attributes.position!.needsUpdate = true
    }
    const guideStep = this.marker.visible ? (marked ?? undefined) : to > 0 ? store.stepAt(to - 1) : undefined
    this.construction.update(
      this.source.thirdFrame?.(guideStep) ?? null,
      p,
      !!this.thirdPath && flows.includes('third'),
    )
    this.dirty = true
  }

  /** A labelled visual aid, not geometry records or evidence of a physical field. */
  private syncTorusSurface(p: Presentation): void {
    const radii = this.source.torusRadii?.()
    const key =
      p.torusSurface && radii && radii.major > 0 && radii.minor > 0 ? radii.major + '/' + radii.minor : ''
    if (key === this.shellKey) return
    this.shellKey = key
    if (this.torusShell) {
      this.scene.remove(this.torusShell)
      this.torusShell.geometry.dispose()
      this.torusShell.material.dispose()
      this.torusShell = null
    }
    if (key && radii) {
      this.torusShell = new Mesh(
        new TorusGeometry(radii.major, radii.minor, 24, 96),
        new MeshBasicMaterial({
          color: 0x829ab7,
          transparent: true,
          opacity: 0.045,
          depthWrite: false,
          side: DoubleSide,
        }),
      )
      this.torusShell.renderOrder = -2
      this.scene.add(this.torusShell)
    }
  }

  private applyGuide(guide: GeometryInstruction[] | null): void {
    const pts = (guide ?? []).filter((g) => g.type === 'point').slice(0, 8)
    pts.forEach((g, i) => {
      if (g.type !== 'point') return
      this.guidePositions.set([g.x, g.y, g.z ?? 0], 3 * i)
    })
    this.guideLine.geometry.setDrawRange(0, pts.length)
    this.guideLine.geometry.attributes.position!.needsUpdate = true
    const p = this.source.presentation?.() ?? DEFAULT_PRESENTATION
    const flows = visibleFlows(p, !!this.source.torusRadii?.())
    const selected = this.source.selectedFlow?.() ?? 'original'
    const flow = flows.includes(selected) ? selected : flows[0]!
    this.guideLine.visible =
      pts.length > 1 && (flow !== 'third' || p.thirdOpacity > 0) && !this.source.thirdStore?.()
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
    const flows = visibleFlows(pres, !!this.source.torusRadii?.()).filter(
      (f) => f !== 'third' || pres.thirdOpacity > 0,
    )
    for (const which of flows) {
      const data = which === 'third' && this.thirdPath ? this.thirdPath.positions : p
      const end = Math.min(to, which === 'third' ? (this.thirdPath?.uploaded ?? to) : to)
      let previous: [number, number] | null = null
      const start = which === 'third' && this.thirdPath && !pres.thirdTrace ? Math.max(from, end - 1) : from
      for (let i = start; i < end; i++) {
        const [x, y, z] = transformFlowPoint(data[3 * i]!, data[3 * i + 1]!, data[3 * i + 2]!, pres, which)
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
