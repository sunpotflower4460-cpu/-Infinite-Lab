import type { Object3D } from 'three'
import { flowAxes, type Flow, type Presentation } from '../lab/presentation'

/** Exact quarter-turn matrix rather than cos(π/2) rounded to a small nonzero value. */
export function setFlowTransform(object: Object3D, p: Presentation, flow: Flow): void {
  const [a, b, c, d, e] = flowAxes(p, flow)
  object.matrixAutoUpdate = false
  object.matrix.set(a, b, 0, 0, c, d, 0, 0, 0, 0, e, 0, 0, 0, 0, 1)
  object.matrixWorldNeedsUpdate = true
}
