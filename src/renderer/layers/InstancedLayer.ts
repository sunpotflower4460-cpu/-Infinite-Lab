import { Buffer, BufferUsage, Container, Geometry, Mesh, Shader, UniformGroup } from 'pixi.js'
import { KIND } from '../../geometry/batch'
import type { GeometryStore } from '../../geometry/GeometryStore'
import { COLORS, type GeometryLayer, type LayerFrame } from './GeometryLayer'

/** Records per GPU chunk. Only the chunk being appended to is re-uploaded. */
export const INSTANCED_CHUNK_RECORDS = 16384
const CIRCLE_FLOATS = 5 // cx, cy, r, arcStart, arcEnd
const LINE_FLOATS = 4 // x0, y0, x1, y1
const FULL_TURN = 7 // any sweep ≥ 2π means "full circle"

// Shared transform: Pixi's global/local matrices map layer units to clip space.
const TRANSFORM = /* glsl */ `
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
uniform float uPxPerUnit;
vec4 toClip(vec2 p) {
  mat3 m = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  return vec4((m * vec3(p, 1.0)).xy, 0.0, 1.0);
}
`

const CIRCLE_VERTEX = /* glsl */ `
in vec2 aPosition;   // quad corner, −1…1
in vec2 aCenter;
in float aRadius;
in vec2 aArc;
${TRANSFORM}
out vec2 vPx;        // pixel offset from the centre (layer orientation)
out float vRadiusPx;
out vec2 vArc;
void main() {
  float rpx = aRadius * uPxPerUnit;
  float extent = max(rpx, 0.0) + 2.0;
  gl_Position = toClip(aCenter + aPosition * (extent / uPxPerUnit));
  vPx = aPosition * extent;
  vRadiusPx = rpx;
  vArc = aArc;
}
`

const CIRCLE_FRAGMENT = /* glsl */ `
in vec2 vPx;
in float vRadiusPx;
in vec2 vArc;
uniform vec4 uTint;
uniform float uDotAlpha;
out vec4 finalColor;
void main() {
  float d = length(vPx);
  float a;
  if (vRadiusPx < 0.75) {
    a = clamp(1.7 - d, 0.0, 1.0) * uDotAlpha;          // point / radius-0 circle: 1.2 px dot
  } else {
    a = clamp(1.0 - abs(d - vRadiusPx), 0.0, 1.0) * uTint.a; // 1 px anti-aliased ring
    float sweep = vArc.y - vArc.x;
    if (sweep < 6.2831) {
      float rel = mod(atan(vPx.y, vPx.x) - vArc.x, 6.28318530718);
      if (rel > sweep) a = 0.0;
    }
  }
  if (a <= 0.0) discard;
  finalColor = vec4(uTint.rgb * a, a);
}
`

const LINE_VERTEX = /* glsl */ `
in vec2 aPosition;   // x: 0…1 along the segment, y: −1…1 across
in vec2 aP0;
in vec2 aP1;
${TRANSFORM}
out float vAcrossPx;
void main() {
  vec2 d = aP1 - aP0;
  float len = length(d);
  vec2 dir = len > 0.0 ? d / len : vec2(1.0, 0.0);
  vec2 n = vec2(-dir.y, dir.x);
  float halfWidth = 1.5; // px, 1 px line + anti-aliasing
  vec2 p = mix(aP0, aP1, aPosition.x)
         + (n * aPosition.y * halfWidth + dir * (aPosition.x * 2.0 - 1.0) * 0.5) / uPxPerUnit;
  gl_Position = toClip(p);
  vAcrossPx = aPosition.y * halfWidth;
}
`

const LINE_FRAGMENT = /* glsl */ `
in float vAcrossPx;
uniform vec4 uTint;
out vec4 finalColor;
void main() {
  float a = clamp(1.0 - abs(vAcrossPx), 0.0, 1.0) * uTint.a;
  if (a <= 0.0) discard;
  finalColor = vec4(uTint.rgb * a, a);
}
`

function rgba(hex: number, alpha: number): Float32Array {
  return new Float32Array([((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255, alpha])
}

/** Growable instance buffer + the store record index of every instance (for Timeline cut-offs). */
class InstanceArray {
  data: Float32Array
  records: Int32Array
  count = 0
  readonly buffer: Buffer

  constructor(readonly floats: number) {
    this.data = new Float32Array(256 * floats)
    this.records = new Int32Array(256)
    this.buffer = new Buffer({ data: this.data, usage: BufferUsage.VERTEX | BufferUsage.COPY_DST })
  }

  push(record: number, values: number[]): void {
    if (this.count === this.records.length) {
      const data = new Float32Array(this.data.length * 2)
      data.set(this.data)
      const records = new Int32Array(this.records.length * 2)
      records.set(this.records)
      this.data = data
      this.records = records
      this.buffer.data = data
    }
    this.data.set(values, this.count * this.floats)
    this.records[this.count++] = record
  }

  /** Instances whose record index is < visibleCount (records are in ascending order). */
  visible(visibleCount: number): number {
    let lo = 0
    let hi = this.count
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (this.records[mid]! < visibleCount) lo = mid + 1
      else hi = mid
    }
    return lo
  }

  reset(): void {
    this.count = 0
  }
}

interface Chunk {
  circles: InstanceArray
  lines: InstanceArray
  circleMesh: Mesh<Geometry, Shader>
  lineMesh: Mesh<Geometry, Shader>
  /** Records converted into this chunk so far. */
  filled: number
  uploaded: boolean
}

/**
 * Instanced SDF rendering: every circle/point/arc and every line is one instance of a quad,
 * shaded analytically in the fragment shader. Vertex cost is constant per object, so this
 * scales to hundreds of thousands of objects. Coordinates are float32 relative to the
 * shared precision frame (see LayerFrame), exactly like the Graphics layer.
 */
export class InstancedLayer implements GeometryLayer {
  readonly name = 'Instanced SDF (WebGL)'
  readonly container = new Container()
  private chunks: Chunk[] = []
  /** Store records already converted into instances. */
  private consumed = 0
  private readonly circleQuad = new Buffer({
    data: new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]),
    usage: BufferUsage.VERTEX,
  })
  private readonly lineQuad = new Buffer({
    data: new Float32Array([0, -1, 1, -1, 1, 1, 0, 1]),
    usage: BufferUsage.VERTEX,
  })
  private readonly circleUniforms = new UniformGroup({
    uPxPerUnit: { value: 1, type: 'f32' },
    uTint: { value: rgba(COLORS.circle, COLORS.circleAlpha), type: 'vec4<f32>' },
    uDotAlpha: { value: COLORS.pointAlpha, type: 'f32' },
  })
  private readonly lineUniforms = new UniformGroup({
    uPxPerUnit: { value: 1, type: 'f32' },
    uTint: { value: rgba(COLORS.line, COLORS.lineAlpha), type: 'vec4<f32>' },
  })
  private readonly circleShader = Shader.from({
    gl: { vertex: CIRCLE_VERTEX, fragment: CIRCLE_FRAGMENT, name: 'lab-circles' },
    resources: { layer: this.circleUniforms },
  })
  private readonly lineShader = Shader.from({
    gl: { vertex: LINE_VERTEX, fragment: LINE_FRAGMENT, name: 'lab-lines' },
    resources: { layer: this.lineUniforms },
  })

  constructor() {
    this.container.blendMode = 'add'
  }

  sync(store: GeometryStore, visibleCount: number, frame: LayerFrame, full: boolean): boolean {
    this.setPixelScale(frame.pxPerUnit)
    if (full) {
      for (const c of this.chunks) {
        c.circles.reset()
        c.lines.reset()
        c.filled = 0
      }
      this.consumed = 0
    }
    let changed = this.consume(store, frame) || full
    for (const c of this.chunks) {
      if (!c.uploaded) {
        c.circles.buffer.update()
        c.lines.buffer.update()
        c.uploaded = true
      }
      const nc = c.circles.visible(visibleCount)
      const nl = c.lines.visible(visibleCount)
      if (nc !== c.circleMesh.geometry.instanceCount || nl !== c.lineMesh.geometry.instanceCount)
        changed = true
      c.circleMesh.geometry.instanceCount = nc
      c.lineMesh.geometry.instanceCount = nl
      c.circleMesh.visible = nc > 0
      c.lineMesh.visible = nl > 0
    }
    return changed
  }

  /** Convert newly appended store records into instances. */
  private consume(store: GeometryStore, frame: LayerFrame): boolean {
    if (this.consumed >= store.count) return false
    const s = frame.bucket
    const ox = frame.originX
    const oy = frame.originY
    const start = this.consumed
    store.forEachRecordFrom(start, store.count, (d, o, index) => {
      const chunk = this.chunkFor(index)
      const kind = d[o]
      if (kind === KIND.line) {
        chunk.lines.push(index, [
          (d[o + 2]! - ox) * s,
          (d[o + 3]! - oy) * s,
          (d[o + 4]! - ox) * s,
          (d[o + 5]! - oy) * s,
        ])
      } else {
        const r = kind === KIND.point ? 0 : Math.max(0, d[o + 4]!) * s
        const [a0, a1] = kind === KIND.arc ? [d[o + 5]!, d[o + 6]!] : [0, FULL_TURN]
        chunk.circles.push(index, [(d[o + 2]! - ox) * s, (d[o + 3]! - oy) * s, r, a0, a1])
      }
      chunk.filled++
      chunk.uploaded = false
    })
    this.consumed = store.count
    return true
  }

  private chunkFor(recordIndex: number): Chunk {
    const i = Math.floor(recordIndex / INSTANCED_CHUNK_RECORDS)
    let c = this.chunks[i]
    if (!c) {
      const circles = new InstanceArray(CIRCLE_FLOATS)
      const lines = new InstanceArray(LINE_FLOATS)
      const circleGeometry = new Geometry({
        attributes: {
          aPosition: { buffer: this.circleQuad, format: 'float32x2' },
          aCenter: {
            buffer: circles.buffer,
            format: 'float32x2',
            stride: CIRCLE_FLOATS * 4,
            offset: 0,
            instance: true,
          },
          aRadius: {
            buffer: circles.buffer,
            format: 'float32',
            stride: CIRCLE_FLOATS * 4,
            offset: 8,
            instance: true,
          },
          aArc: {
            buffer: circles.buffer,
            format: 'float32x2',
            stride: CIRCLE_FLOATS * 4,
            offset: 12,
            instance: true,
          },
        },
        indexBuffer: new Uint16Array([0, 1, 2, 0, 2, 3]),
        instanceCount: 0,
      })
      const lineGeometry = new Geometry({
        attributes: {
          aPosition: { buffer: this.lineQuad, format: 'float32x2' },
          aP0: {
            buffer: lines.buffer,
            format: 'float32x2',
            stride: LINE_FLOATS * 4,
            offset: 0,
            instance: true,
          },
          aP1: {
            buffer: lines.buffer,
            format: 'float32x2',
            stride: LINE_FLOATS * 4,
            offset: 8,
            instance: true,
          },
        },
        indexBuffer: new Uint16Array([0, 1, 2, 0, 2, 3]),
        instanceCount: 0,
      })
      const lineMesh = new Mesh({ geometry: lineGeometry, shader: this.lineShader })
      const circleMesh = new Mesh({ geometry: circleGeometry, shader: this.circleShader })
      this.container.addChild(lineMesh, circleMesh)
      c = { circles, lines, circleMesh, lineMesh, filled: 0, uploaded: false }
      this.chunks[i] = c
    }
    return c
  }

  setPixelScale(pxPerUnit: number): void {
    this.circleUniforms.uniforms.uPxPerUnit = pxPerUnit
    this.lineUniforms.uniforms.uPxPerUnit = pxPerUnit
  }

  clear(): void {
    for (const c of this.chunks) {
      c.circleMesh.destroy()
      c.lineMesh.destroy()
      c.circles.buffer.destroy()
      c.lines.buffer.destroy()
    }
    this.chunks = []
    this.consumed = 0
  }

  destroy(): void {
    this.clear()
    this.circleShader.destroy()
    this.lineShader.destroy()
    this.circleQuad.destroy()
    this.lineQuad.destroy()
    this.container.destroy()
  }
}
