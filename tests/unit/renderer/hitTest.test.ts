import { describe, expect, it } from 'vitest'
import { arcDistance, segmentDistance } from '../../../src/renderer/hitTest'
import { arc, clampSweep } from '../../../src/geometry/types'

describe('hit testing', () => {
  it('segment distance: interior, beyond ends, degenerate', () => {
    expect(segmentDistance(5, 3, 0, 0, 10, 0)).toBe(3)
    expect(segmentDistance(-4, 3, 0, 0, 10, 0)).toBe(5)
    expect(segmentDistance(3, 4, 0, 0, 0, 0)).toBe(5)
  })

  it('arc distance only counts the drawn part', () => {
    // quarter arc from 0 to π/2, radius 10, centre (0,0)
    expect(arcDistance(0, 10, 0, 0, 10, 0, Math.PI / 2)).toBeCloseTo(0, 12) // on the arc (sweep π/2)
    expect(arcDistance(7.0710678, 7.0710678, 0, 0, 10, 0, Math.PI / 2)).toBeCloseTo(0, 6)
    // opposite side of the circle (−10, 0): not on the arc → distance to the nearer end (0,10)
    expect(arcDistance(-10, 0, 0, 0, 10, 0, Math.PI / 2)).toBeCloseTo(Math.hypot(10, 10), 12)
    // a full circle behaves like a circle
    expect(arcDistance(-10, 0, 0, 0, 10, 0, 2 * Math.PI)).toBeCloseTo(0, 12)
  })

  it('arcs are start + counter-clockwise sweep, clamped to [0, 2π]', () => {
    expect(clampSweep(-1)).toBe(0)
    expect(clampSweep(10)).toBe(2 * Math.PI)
    expect(clampSweep(NaN)).toBe(0)
    expect(arc(0, 0, 1, 3, 3 * Math.PI).sweep).toBe(2 * Math.PI)
    // quarter arc from π/2 to π: (−10, 0) is on it, (10, 0) is not
    expect(arcDistance(-10, 0, 0, 0, 10, Math.PI / 2, Math.PI / 2)).toBeCloseTo(0, 12)
    expect(arcDistance(10, 0, 0, 0, 10, Math.PI / 2, Math.PI / 2)).toBeGreaterThan(10)
    // three-quarter arc from π/2 covers (10, 0) at 2π
    expect(arcDistance(10, 0, 0, 0, 10, Math.PI / 2, (3 * Math.PI) / 2)).toBeCloseTo(0, 12)
  })
})
