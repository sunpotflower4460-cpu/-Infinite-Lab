import { describe, expect, it } from 'vitest'
import { GeometryBatchWriter, decodeRecord } from '../../../src/geometry/batch'
import { GeometryStore } from '../../../src/geometry/GeometryStore'
import { arc, circle, line, point } from '../../../src/geometry/types'
import { CSV_HEADER, geometryCsv, geometrySvg } from '../../../src/lab/exporters'
import { makeRunner } from '../helpers'

function walkStore(steps: number): GeometryStore {
  const runner = makeRunner('digit-circle-walk', 1000)
  const w = new GeometryBatchWriter()
  runner.advance(steps, w)
  const store = new GeometryStore()
  store.append(w.flush())
  return store
}

describe('CSV export', () => {
  it('writes one row per record with exact float64 values', () => {
    const store = walkStore(300)
    const csv = geometryCsv(store, store.count).join('')
    const rows = csv.trim().split('\n')
    expect(rows[0]).toBe(CSV_HEADER)
    expect(rows).toHaveLength(store.count + 1)
    // every numeric field parses back to exactly the stored value
    for (let i = 0; i < store.count; i++) {
      const f = rows[i + 1]!.split(',')
      const { step, instruction: g } = decodeRecord(store.chunks[0]!, i)
      expect(Number(f[0])).toBe(step)
      expect(f[1]).toBe(g.type)
      if (g.type === 'line') expect([+f[2]!, +f[3]!, +f[5]!, +f[6]!]).toEqual([g.x1, g.y1, g.x2, g.y2])
      if (g.type === 'circle') expect([+f[2]!, +f[3]!, +f[4]!]).toEqual([g.x, g.y, g.radius])
    }
  })

  it('respects the Timeline cut-off (count)', () => {
    const store = walkStore(300)
    expect(geometryCsv(store, 10).join('').trim().split('\n')).toHaveLength(11)
  })
})

describe('SVG export', () => {
  it('contains every shape with exact coordinates and the description', () => {
    const w = new GeometryBatchWriter()
    w.push(1, line(0, 0, 1.5, -2.25))
    w.push(1, circle(1.5, -2.25, 0.1))
    w.push(2, point(3, 4))
    w.push(3, arc(0, 0, 2, 0, Math.PI / 2))
    const store = new GeometryStore()
    store.append(w.flush())
    const svg = geometrySvg(store, store.count, 'π <test>', 'angle = digit / 10 × 2π').join('')
    expect(svg).toContain('<line data-step="1" x1="0" y1="0" x2="1.5" y2="-2.25"')
    expect(svg).toContain('<circle data-step="1" cx="1.5" cy="-2.25" r="0.1"')
    expect(svg).toContain('data-step="2" cx="3" cy="4"')
    expect(svg).toContain('<path data-step="3" d="M 2 0 A 2 2 0 0 1')
    expect(svg).toContain('<title>π &lt;test&gt;</title>')
    expect(svg).toContain('<desc>angle = digit / 10 × 2π</desc>')
    expect(svg).toContain('transform="scale(1,-1)"')
    expect(svg.match(/data-step=/g)).toHaveLength(4)
  })

  it('writes arcs as start + counter-clockwise sweep', () => {
    const w = new GeometryBatchWriter()
    w.push(1, arc(0, 0, 2, Math.PI / 2, (3 * Math.PI) / 2))
    const store = new GeometryStore()
    store.append(w.flush())
    const svg = geometrySvg(store, 1, 't', 'd').join('')
    // from (0, 2) sweeping 3π/2 counter-clockwise ends at (2, 0): large-arc flag 1
    expect(svg).toMatch(/d="M [^ ]+ 2 A 2 2 0 1 1 2 [^"]+"/)
  })
})

describe('Microscope range export', () => {
  it('CSV and SVG contain exactly the records of steps [from, to], framed to them', () => {
    const store = walkStore(300) // 2 records per step
    const from = store.firstIndexOfStep(101)
    const to = store.countUpToStep(150)
    const csvRows = geometryCsv(store, to, from).join('').trim().split('\n').slice(1)
    expect(csvRows).toHaveLength(100)
    const steps = csvRows.map((r) => Number(r.split(',')[0]))
    expect(Math.min(...steps)).toBe(101)
    expect(Math.max(...steps)).toBe(150)

    const svg = geometrySvg(store, to, 't', 'd', from).join('')
    const svgSteps = [...svg.matchAll(/data-step="(\d+)"/g)].map((m) => Number(m[1]))
    expect(svgSteps).toHaveLength(100)
    expect(Math.min(...svgSteps)).toBe(101)
    // the viewBox is the range's bounding box (plus padding), not the whole walk's
    const b = store.boundsBetween(from, to)!
    const vb = /viewBox="([^"]+)"/.exec(svg)![1]!.split(' ').map(Number)
    const pad = Math.max(b.maxX - b.minX, b.maxY - b.minY) * 0.04
    expect(vb[0]).toBeCloseTo(b.minX - pad, 9)
    expect(vb[2]).toBeCloseTo(b.maxX - b.minX + 2 * pad, 9)
    expect(store.boundsUpTo(store.count)!.minX).toBeLessThanOrEqual(b.minX)
  })
})
