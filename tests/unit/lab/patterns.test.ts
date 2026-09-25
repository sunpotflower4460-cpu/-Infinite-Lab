import { describe, expect, it } from 'vitest'
import { detectPatterns } from '../../../src/analysis/patterns'
import { GeometryBatchWriter } from '../../../src/geometry/batch'
import { GeometryStore } from '../../../src/geometry/GeometryStore'
import { circle, line, point } from '../../../src/geometry/types'
import { makeRunner } from '../helpers'

function storeOf(points: [number, number][]): GeometryStore {
  const w = new GeometryBatchWriter()
  points.forEach(([x, y], i) => w.push(i + 1, point(x, y)))
  const s = new GeometryStore()
  s.append(w.flush())
  return s
}

describe('detectPatterns', () => {
  it('finds the 7-fold symmetry of a 7-spoke star, and the walk geometry', () => {
    const w = new GeometryBatchWriter()
    for (let i = 0; i < 7; i++) {
      const a = (2 * Math.PI * i) / 7
      w.push(i + 1, line(5, -1, 5 + 2 * Math.cos(a), -1 + 2 * Math.sin(a)))
    }
    const s = new GeometryStore()
    s.append(w.flush())
    const f = detectPatterns(s, Infinity)
    expect(f.symmetry[0]!.order % 7).toBe(0)
    expect(f.symmetry.find((x) => x.order === 7)!.significant).toBe(true)
    expect(f.symmetry.filter((x) => x.significant).every((x) => x.order % 7 === 0)).toBe(true)
  })

  it('measures centroid, radii and returns of a repeated 7-gon walk', () => {
    const pts: [number, number][] = []
    for (let rep = 0; rep < 3; rep++)
      for (let i = 0; i < 7; i++)
        pts.push([5 + 2 * Math.cos((2 * Math.PI * i) / 7), -1 + 2 * Math.sin((2 * Math.PI * i) / 7)])
    const f = detectPatterns(storeOf(pts), Infinity)
    expect(f.centroid.x).toBeCloseTo(5, 12)
    expect(f.centroid.y).toBeCloseTo(-1, 12)
    expect(f.maxRadius).toBeCloseTo(2, 12)
    expect(f.radiusOfGyration).toBeCloseTo(2, 12)
    expect(f.nearReturns.map((r) => r.step)).toEqual([8, 15])
  })

  it('detects the 15-petal stage of Two-Arm Rotation with π and its disappearance later', () => {
    const at = (steps: number) => {
      const runner = makeRunner('two-arm', 20000, { dt: 0.05 })
      const w = new GeometryBatchWriter()
      runner.advance(steps, w)
      const s = new GeometryStore()
      s.append(w.flush())
      return detectPatterns(s, s.count).symmetry
    }
    const flower = at(1400) // t = 70
    expect(flower[0]!.order).toBe(15)
    expect(flower[0]!.significant).toBe(true)
    expect(at(12000).some((x) => x.order === 15 && x.significant)).toBe(false) // t = 600: filled in
  })

  it('reports digit frequencies and χ² against uniform', () => {
    const f = detectPatterns(storeOf([[0, 0]]), Infinity, [3, 1, 4, 1, 5, 9, 2, 6, 5, 3])
    expect(f.digits!.counts).toEqual([0, 2, 1, 2, 1, 2, 1, 0, 0, 1])
    // expected 1 per digit: χ² = Σ (c − 1)² / 1 = 1+1+0+1+0+1+0+1+1+0 = 6
    expect(f.digits!.chiSquare).toBe(6)
  })

  it('respects the visible count and handles empty input', () => {
    const w = new GeometryBatchWriter()
    w.push(1, circle(0, 0, 1))
    w.push(2, circle(10, 0, 1))
    const s = new GeometryStore()
    s.append(w.flush())
    expect(detectPatterns(s, 1).centroid).toEqual({ x: 0, y: 0 })
    expect(detectPatterns(s, 0).records).toBe(0)
  })
})
