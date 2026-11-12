import { expect, it } from 'vitest'
import { DEFAULT_PRESENTATION, parsePresentation, transformPoint } from '../../../src/lab/presentation'
import { parseImport, FILE_FORMAT } from '../../../src/lab/experimentFile'
import { geometryCsv, geometrySvg } from '../../../src/lab/exporters'
import { GeometryStore } from '../../../src/geometry/GeometryStore'
import { GeometryBatchWriter } from '../../../src/geometry/batch'
import { geometryDigest } from '../../../src/geometry/digest'
import { makeRunner } from '../helpers'

it('mirror and antipodal pairs retain step and exact coordinate relations', () => {
  const runner = makeRunner('two-arm-sphere-lift')
  runner.advance(1000)
  for (const n of [1, 7, 300, 1000]) {
    const { x, y, z } = runner.inspect(n).env
    const mirror = transformPoint(x!, y!, z!, 'mirror')
    expect(mirror).toEqual([-x!, y, z])
    expect([x! + mirror[0], y! + mirror[1], z! + mirror[2]]).toEqual([0, 2 * y!, 2 * z!])
    const antipode = transformPoint(x!, y!, z!, 'yin-yang')
    expect([x! + antipode[0], y! + antipode[1], z! + antipode[2]]).toEqual([0, 0, 0])
  }
})
it('v1–v3 imports use Solo defaults; v4 preserves validated view settings', () => {
  const base = {
    format: FILE_FORMAT,
    steps: 300,
    result: { geometrySha256: 'a'.repeat(64) },
    config: { experiment: 'two-arm' },
  }
  for (const version of [1, 2, 3]) {
    const parsed = parseImport(JSON.stringify({ ...base, version }))
    expect(parsePresentation(parsed.config.presentation)).toEqual(DEFAULT_PRESENTATION)
  }
  const presentation = {
    ...DEFAULT_PRESENTATION,
    mode: 'yin-yang',
    trail: 300,
    camera: { position: [300, -400, 250], target: [0, 0, 0] },
    look: 'luminous',
    autoRotate: true,
  }
  const parsed = parseImport(
    JSON.stringify({ ...base, version: 4, config: { experiment: 'two-arm-sphere-lift', presentation } }),
  )
  expect(parsed.config.presentation).toEqual(presentation)
  expect(() => parsePresentation({ ...presentation, trail: -1 })).toThrow()
  expect(() => parsePresentation({ ...presentation, palette: '__proto__' })).toThrow()
  expect(() =>
    parsePresentation({ ...presentation, camera: { position: [1, 2, 3], target: [1, 2, 3] } }),
  ).toThrow()
})
it('CSV/SVG export distinguish both streams without changing stored geometry/digest', async () => {
  const runner = makeRunner('two-arm-sphere-lift')
  const w = new GeometryBatchWriter()
  runner.advance(300, w)
  const store = new GeometryStore()
  store.append(w.flush())
  const before = await geometryDigest(store, store.count)
  const p = { ...DEFAULT_PRESENTATION, mode: 'yin-yang' as const }
  const rows = geometryCsv(store, store.count, 0, true, p).join('').trim().split('\n')
  expect(rows).toHaveLength(601)
  expect(rows[0]).toContain('z,flow')
  const a = rows[1]!.split(','),
    b = rows[301]!.split(',')
  expect(a[0]).toBe(b[0])
  expect(Number(a[2]) + Number(b[2])).toBe(0)
  expect(Number(a[3]) + Number(b[3])).toBe(0)
  expect(Number(a[9]) + Number(b[9])).toBe(0)
  expect(b[10]).toBe('derived')
  const svg = geometrySvg(store, store.count, 'test', 'rule', 0, p, true).join('')
  expect(svg).toContain('orthographic (x,y) projection')
  expect(svg).toContain('data-flow="derived"')
  expect(svg.match(/<line /g)).toHaveLength(598)
  expect(store.count).toBe(300)
  expect(await geometryDigest(store, store.count)).toBe(before)
})
