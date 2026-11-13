import { expect, it } from 'vitest'
import { Object3D, Vector3 } from 'three'
import {
  DEFAULT_PRESENTATION,
  parsePresentation,
  transformFlowPoint,
  inverseFlowPoint,
  visibleFlows,
  thirdRule,
  type Presentation,
} from '../../../src/lab/presentation'
import { setFlowTransform } from '../../../src/renderer/flowTransform'
import { evaluateSet } from '../../../src/experiments/core/formula'
import { getExperiment } from '../../../src/experiments/registry'
import { COMPUTE_SYNC } from '../../../src/math/constants'
import { binaryConstantFor } from '../../../src/math/exactReduce'
import { GeometryStore } from '../../../src/geometry/GeometryStore'
import { GeometryBatchWriter } from '../../../src/geometry/batch'
import { geometryDigest } from '../../../src/geometry/digest'
import { geometryCsv, geometrySvg } from '../../../src/lab/exporters'
import { parseImport, FILE_FORMAT, FILE_VERSION } from '../../../src/lab/experimentFile'
import { makeRunner } from '../helpers'

const p: Presentation = { ...DEFAULT_PRESENTATION, mode: 'yin-yang', thirdFlow: true }
const pi = binaryConstantFor('pi', COMPUTE_SYNC.pi!)
for (const constant of ['pi', 'frac-22-7'])
  for (const [r1, r2] of [
    [1.3, 1],
    [1, 1],
    [0.2, 2],
    [0, 1],
    [1, 0],
    [0, 0],
  ] as const)
    it(
      'third flow preserves torus coordinates and the original pair: ' + constant + ' ' + r1 + '/' + r2,
      () => {
        const c = binaryConstantFor(constant, COMPUTE_SYNC[constant]!)
        for (const n of [1, 300, 1000, 10000, 1e12, Number.MAX_SAFE_INTEGER, 1e30]) {
          const e = evaluateSet(
            getExperiment('two-arm-torus').formulas,
            { n, dt: 0.05, r1, r2, scale: 137 },
            { constant: c, pi },
          )
          const [x, y, z] = [e.x!, e.y!, e.z!]
          const antipode = transformFlowPoint(x, y, z, p, 'derived')
          expect([x + antipode[0], y + antipode[1], z + antipode[2]]).toEqual([0, 0, 0])
          for (const thirdQuarter of [1, -1] as const) {
            const view = { ...p, thirdQuarter }
            const q = transformFlowPoint(x, y, z, view, 'third')
            expect(q[2]).toBe(z)
            expect(q[0] ** 2 + q[1] ** 2).toBe(x * x + y * y)
            const R = r1 * 137,
              r = r2 * 137
            const v = q[0] ** 2 + q[1] ** 2 + q[2] ** 2 + R * R - r * r
            expect(
              Math.abs(v * v - 4 * R * R * (q[0] ** 2 + q[1] ** 2)) / Math.max(1, (R + r) ** 4),
            ).toBeLessThan(4e-15)
            expect(inverseFlowPoint(...q, view, 'third')).toEqual([x, y, z])
          }
        }
      },
    )

it('is an explicit quarter-turn rule, with the same GPU, picking and export transform', () => {
  expect(thirdRule(p)).toContain('Q=(−y, x, z)')
  for (const thirdQuarter of [1, -1] as const)
    for (const flow of ['original', 'derived', 'third'] as const) {
      const view = { ...p, thirdQuarter }
      const object = new Object3D()
      setFlowTransform(object, view, flow)
      const q = new Vector3(2, 3, 4).applyMatrix4(object.matrix).toArray()
      expect(q).toEqual(transformFlowPoint(2, 3, 4, view, flow))
      expect(inverseFlowPoint(...q, view, flow)).toEqual([2, 3, 4])
    }
  expect(visibleFlows(p, true)).toEqual(['original', 'derived', 'third'])
  expect(visibleFlows(p, false)).toEqual(['original', 'derived'])
  expect(visibleFlows({ ...p, mode: 'solo' }, true)).toEqual(['original'])
  expect(visibleFlows({ ...p, flow: 'third' }, true)).toEqual(['third'])
  expect(visibleFlows({ ...p, flow: 'third' }, false)).toEqual(['original', 'derived'])
})

it('round-trips v5 settings and imports v1–v4 with the third flow off by default', () => {
  const base = {
    format: FILE_FORMAT,
    steps: 300,
    result: { geometrySha256: 'a'.repeat(64) },
    config: { experiment: 'two-arm-torus' },
  }
  for (const version of [1, 2, 3, 4]) {
    const config = parseImport(JSON.stringify({ ...base, version })).config
    expect(parsePresentation(config.presentation).thirdFlow).toBe(false)
  }
  const presentation = { ...p, thirdOpacity: 0.18, thirdQuarter: -1, torusSurface: true }
  expect(
    parseImport(JSON.stringify({ ...base, version: FILE_VERSION, config: { ...base.config, presentation } }))
      .config.presentation,
  ).toEqual(presentation)
  for (const value of [
    { thirdOpacity: -0.1 },
    { thirdOpacity: NaN },
    { thirdOpacity: 2 },
    { thirdQuarter: 0 },
    { thirdFlow: 'yes' },
    { torusSurface: 'yes' },
  ])
    expect(() => parsePresentation({ ...p, ...value })).toThrow()
})

it('exports three separate flows with exact source steps without touching the digest', async () => {
  const writer = new GeometryBatchWriter()
  makeRunner('two-arm-torus').advance(300, writer)
  const store = new GeometryStore()
  store.append(writer.flush())
  const sha = await geometryDigest(store, store.count)
  const start = store.firstIndexOfStep(201)
  const rows = geometryCsv(store, store.count, start, true, p, true).join('').trim().split('\n')
  expect(rows).toHaveLength(301)
  for (let i = 1; i <= 100; i++) {
    const a = rows[i]!.split(','),
      b = rows[i + 100]!.split(','),
      q = rows[i + 200]!.split(',')
    expect([a[10], b[10], q[10]]).toEqual(['original', 'derived', 'third'])
    expect(a[0]).toBe(q[0])
    expect(a[0]).toBe(b[0])
    expect(Number(q[2])).toBe(-Number(a[3]))
    expect(Number(q[3])).toBe(Number(a[2]))
    expect(Number(q[9])).toBe(Number(a[9]))
  }
  const svg = geometrySvg(store, store.count, 'third', 'rule', start, p, true, true).join('')
  expect(svg).toContain('data-flow="third"')
  expect(svg).toContain('stroke-opacity="0.23"')
  expect(svg).toContain('Q=(−y, x, z)')
  expect(svg.match(/<line /g)).toHaveLength(297)
  const only = geometryCsv(store, store.count, start, true, { ...p, flow: 'third' }, true)
    .join('')
    .trim()
    .split('\n')
  expect(only).toHaveLength(101)
  expect(store.count).toBe(300)
  expect(await geometryDigest(store, store.count)).toBe(sha)
})
