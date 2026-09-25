import { describe, expect, it } from 'vitest'
import { Camera } from '../../../src/renderer/Camera'

describe('Camera', () => {
  const cam = () => {
    const c = new Camera()
    c.setViewport(800, 600)
    c.zoom = 2
    c.centerOn(10, -5)
    return c
  }

  it('maps world ↔ screen with y pointing up', () => {
    const c = cam()
    expect(c.worldToScreen(10, -5)).toEqual([400, 300])
    expect(c.worldToScreen(11, -4)).toEqual([402, 298])
    expect(c.screenToWorld(402, 298)).toEqual([11, -4])
  })

  it('zoomAt keeps the point under the cursor fixed', () => {
    const c = cam()
    const before = c.screenToWorld(123, 456)
    c.zoomAt(123, 456, 3.7)
    const after = c.screenToWorld(123, 456)
    expect(after[0]).toBeCloseTo(before[0], 10)
    expect(after[1]).toBeCloseTo(before[1], 10)
  })

  it('fit contains the bounds', () => {
    const c = cam()
    c.fit({ minX: -100, minY: -20, maxX: 300, maxY: 50 }, 40)
    const [x0, y0] = c.worldToScreen(-100, 50)
    const [x1, y1] = c.worldToScreen(300, -20)
    expect(x0).toBeGreaterThanOrEqual(40 - 1e-9)
    expect(x1).toBeLessThanOrEqual(760 + 1e-9)
    expect(y0).toBeGreaterThanOrEqual(40 - 1e-9)
    expect(y1).toBeLessThanOrEqual(560 + 1e-9)
  })

  it('pan moves the view opposite to the drag in world units', () => {
    const c = cam()
    c.panBy(20, 10)
    expect([c.cx, c.cy]).toEqual([0, 0])
  })
})

describe('Camera.pinch', () => {
  it('keeps the world point under the fingers and zooms by the distance ratio', () => {
    const c = new Camera()
    c.setViewport(400, 800)
    c.zoom = 3
    c.centerOn(5, 5)
    const a0 = { x: 100, y: 300 }
    const b0 = { x: 200, y: 400 }
    const under = c.screenToWorld(150, 350) // midpoint
    const a1 = { x: 60, y: 260 } // fingers spread ×1.8 and move by (+10, −5)
    const b1 = { x: 240, y: 430 }
    c.pinch(a0, b0, a1, b1)
    expect(c.zoom).toBeCloseTo(3 * (Math.hypot(180, 170) / Math.hypot(100, 100)), 12)
    const [wx, wy] = c.screenToWorld(150, 345)
    expect(wx).toBeCloseTo(under[0], 10)
    expect(wy).toBeCloseTo(under[1], 10)
  })
})
