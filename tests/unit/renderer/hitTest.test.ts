import { describe, expect, it } from 'vitest'
import { arcDistance, segmentDistance } from '../../../src/renderer/hitTest'

describe('hit testing', () => {
  it('segment distance: interior, beyond ends, degenerate', () => {
    expect(segmentDistance(5, 3, 0, 0, 10, 0)).toBe(3)
    expect(segmentDistance(-4, 3, 0, 0, 10, 0)).toBe(5)
    expect(segmentDistance(3, 4, 0, 0, 0, 0)).toBe(5)
  })

  it('arc distance only counts the drawn part', () => {
    // quarter arc from 0 to π/2, radius 10, centre (0,0)
    expect(arcDistance(0, 10, 0, 0, 10, 0, Math.PI / 2)).toBeCloseTo(0, 12) // on the arc
    expect(arcDistance(7.0710678, 7.0710678, 0, 0, 10, 0, Math.PI / 2)).toBeCloseTo(0, 6)
    // opposite side of the circle (−10, 0): not on the arc → distance to the nearer end (0,10)
    expect(arcDistance(-10, 0, 0, 0, 10, 0, Math.PI / 2)).toBeCloseTo(Math.hypot(10, 10), 12)
    // a full circle behaves like a circle
    expect(arcDistance(-10, 0, 0, 0, 10, 0, 2 * Math.PI)).toBeCloseTo(0, 12)
  })
})
