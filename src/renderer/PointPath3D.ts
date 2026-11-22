import { BufferAttribute, BufferGeometry, DynamicDrawUsage, InstancedInterleavedBuffer, Vector3 } from 'three'
import type { GeometryStore } from '../geometry/GeometryStore'
import { pathGeometry } from './Polyline3D'

/** Separate coordinates are necessary for a real third circle, unlike a rigid phase copy. */
export class PointPath3D {
  positions = new Float32Array(3 * 2048)
  uploaded = 0
  generation = -1
  readonly min = new Vector3(Infinity, Infinity, Infinity)
  readonly max = new Vector3(-Infinity, -Infinity, -Infinity)
  private attribute = new BufferAttribute(this.positions, 3).setUsage(DynamicDrawUsage)
  private buffer = new InstancedInterleavedBuffer(this.positions, 3, 1).setUsage(DynamicDrawUsage)
  nativeShown = new BufferGeometry().setAttribute('position', this.attribute)
  nativeContext = new BufferGeometry().setAttribute('position', this.attribute)
  shown = pathGeometry(this.buffer)
  context = pathGeometry(this.buffer)

  sync(store: GeometryStore): boolean {
    let changed = false
    if (store.generation !== this.generation || store.count < this.uploaded) {
      this.uploaded = 0
      this.generation = store.generation
      this.min.set(Infinity, Infinity, Infinity)
      this.max.set(-Infinity, -Infinity, -Infinity)
      changed = true
    }
    if (store.count === this.uploaded) return changed
    if (store.count * 3 > this.positions.length) {
      let size = this.positions.length
      while (size < store.count * 3) size *= 2
      const next = new Float32Array(size)
      next.set(this.positions.subarray(0, this.uploaded * 3))
      this.dispose()
      this.positions = next
      this.attribute = new BufferAttribute(next, 3).setUsage(DynamicDrawUsage)
      this.buffer = new InstancedInterleavedBuffer(next, 3, 1).setUsage(DynamicDrawUsage)
      this.nativeShown = new BufferGeometry().setAttribute('position', this.attribute)
      this.nativeContext = new BufferGeometry().setAttribute('position', this.attribute)
      this.shown = pathGeometry(this.buffer)
      this.context = pathGeometry(this.buffer)
    }
    store.forEachRecordFrom(this.uploaded, store.count, (d, o, i) => {
      this.positions.set(d.subarray(o + 2, o + 5), 3 * i)
      this.min.x = Math.min(this.min.x, d[o + 2]!)
      this.max.x = Math.max(this.max.x, d[o + 2]!)
      this.min.y = Math.min(this.min.y, d[o + 3]!)
      this.max.y = Math.max(this.max.y, d[o + 3]!)
      this.min.z = Math.min(this.min.z, d[o + 4]!)
      this.max.z = Math.max(this.max.z, d[o + 4]!)
    })
    this.attribute.addUpdateRange(this.uploaded * 3, (store.count - this.uploaded) * 3)
    this.attribute.needsUpdate = true
    this.buffer.addUpdateRange(this.uploaded * 3, (store.count - this.uploaded) * 3)
    this.buffer.needsUpdate = true
    this.uploaded = store.count
    return true
  }
  range(from: number, to: number, contextTo: number): void {
    this.nativeShown.setDrawRange(from, Math.max(0, to - from))
    this.nativeContext.setDrawRange(0, Math.min(contextTo, to))
    this.shown.instanceCount = this.context.instanceCount = Math.max(0, to - 1)
  }
  dispose(): void {
    for (const geometry of [this.nativeShown, this.nativeContext, this.shown, this.context])
      geometry.dispose()
  }
}
