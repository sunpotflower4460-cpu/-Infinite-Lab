import {
  BufferAttribute,
  BufferGeometry,
  Group,
  Line,
  LineBasicMaterial,
  LineLoop,
  Points,
  PointsMaterial,
} from 'three'
import { detCos, detSin } from '../math/detmath'
import { flowColor, type Presentation } from '../lab/presentation'
import type { Point3, ThirdCircleFrame } from '../lab/thirdCircle'

/** Actual construction circles: XY at O; radial/Z at E; tangent/Z at P. */
export class ThirdCircleConstruction {
  readonly group = new Group()
  private readonly circleGeometry = new BufferGeometry()
  private readonly circles: LineLoop[]
  private readonly armGeometry = new BufferGeometry()
  private readonly armPositions = new Float32Array(12)
  private readonly arm = new Line(
    this.armGeometry,
    new LineBasicMaterial({ transparent: true, depthWrite: false }),
  )
  private readonly tipGeometry = new BufferGeometry()
  private readonly tipPosition = new Float32Array(3)
  private readonly tip = new Points(
    this.tipGeometry,
    new PointsMaterial({ size: 8, sizeAttenuation: false, depthTest: false }),
  )
  constructor() {
    const positions = new Float32Array(128 * 3)
    for (let i = 0; i < 128; i++)
      positions.set([detCos((2 * Math.PI * i) / 128), detSin((2 * Math.PI * i) / 128), 0], i * 3)
    this.circleGeometry.setAttribute('position', new BufferAttribute(positions, 3))
    this.circles = Array.from(
      { length: 3 },
      () =>
        new LineLoop(this.circleGeometry, new LineBasicMaterial({ transparent: true, depthWrite: false })),
    )
    for (const circle of this.circles) {
      circle.matrixAutoUpdate = false
      circle.frustumCulled = false
    }
    this.armGeometry.setAttribute('position', new BufferAttribute(this.armPositions, 3))
    this.tipGeometry.setAttribute('position', new BufferAttribute(this.tipPosition, 3))
    this.arm.frustumCulled = false
    this.tip.frustumCulled = false
    this.group.add(...this.circles, this.arm, this.tip)
    this.group.visible = false
    this.group.renderOrder = 3
  }
  update(frame: ThirdCircleFrame | null, p: Presentation, show: boolean): void {
    this.group.visible = !!frame && show && p.thirdOpacity > 0
    if (!frame || !this.group.visible) return
    const { radial: u, tangent: t, radius: a, point: q } = frame.sample
    const frames: [Point3, Point3, Point3, number][] = [
      [[0, 0, 0], [1, 0, 0], [0, 1, 0], frame.major],
      [frame.elbow, u, [0, 0, 1], frame.minor],
      [frame.center, t, [0, 0, 1], a],
    ]
    frames.forEach(([center, x, y, radius], i) => {
      const circle = this.circles[i]!
      circle.visible = radius > 0 && p.thirdGuides
      circle.matrix.set(
        radius * x[0],
        radius * y[0],
        0,
        center[0],
        radius * x[1],
        radius * y[1],
        0,
        center[1],
        radius * x[2],
        radius * y[2],
        0,
        center[2],
        0,
        0,
        0,
        1,
      )
      circle.matrixWorldNeedsUpdate = true
      const material = circle.material as LineBasicMaterial
      material.color.set(flowColor(p, i === 0 ? 'original' : i === 1 ? 'derived' : 'third'))
      material.opacity = i === 2 ? p.thirdOpacity * 0.8 : 0.24
    })
    this.armPositions.set([0, 0, 0, ...frame.elbow, ...frame.center, ...q])
    this.arm.visible = p.thirdGuides
    this.armGeometry.attributes.position!.needsUpdate = true
    ;(this.arm.material as LineBasicMaterial).color.set(flowColor(p, 'third'))
    ;(this.arm.material as LineBasicMaterial).opacity = p.thirdOpacity * 0.7
    this.tipPosition.set(q)
    this.tipGeometry.attributes.position!.needsUpdate = true
    ;(this.tip.material as PointsMaterial).color.set(flowColor(p, 'third'))
  }
  dispose(): void {
    this.circleGeometry.dispose()
    this.armGeometry.dispose()
    this.tipGeometry.dispose()
    for (const object of [...this.circles, this.arm, this.tip])
      (object.material as LineBasicMaterial | PointsMaterial).dispose()
  }
}
