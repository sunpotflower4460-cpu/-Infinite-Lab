import { expect, it } from 'vitest'
import references from '../../fixtures/third-circle-reference.json'
import { thirdCircleConfig, thirdCircleSample, thirdCircleFormulaLines } from '../../../src/lab/thirdCircle'
import { DEFAULT_PRESENTATION, hasThirdFlow, parsePresentation } from '../../../src/lab/presentation'
import { evaluateSet } from '../../../src/experiments/core/formula'
import { getExperiment } from '../../../src/experiments/registry'
import { COMPUTE_SYNC } from '../../../src/math/constants'
import { binaryConstantFor } from '../../../src/math/exactReduce'
import { GeometryBatchWriter } from '../../../src/geometry/batch'
import { GeometryStore } from '../../../src/geometry/GeometryStore'
import { geometryDigest } from '../../../src/geometry/digest'
import { geometryCsv, geometrySvg } from '../../../src/lab/exporters'
import { parseImport, FILE_FORMAT } from '../../../src/lab/experimentFile'
import { makeRunner } from '../helpers'
import { ThirdCircleConstruction } from '../../../src/renderer/ThirdCircleConstruction'
import { LineLoop, Vector3 } from 'three'

const pi = binaryConstantFor('pi', COMPUTE_SYNC.pi!)
it('matches independent 230-digit three-circle references across radii, constants and huge steps', () => {
  for (const ref of references) {
    const e = evaluateSet(
      getExperiment('two-arm-torus').formulas,
      { n: ref.n, dt: ref.dt, r1: ref.r1, r2: ref.r2, scale: ref.scale },
      { constant: binaryConstantFor(ref.constant, COMPUTE_SYNC[ref.constant]!), pi },
    )
    const p: [number, number, number] = [e.x!, e.y!, e.z!]
    const sample = thirdCircleSample(ref.n, p, {
      constantId: ref.constant,
      dt: ref.dt,
      radius: ref.scale * ref.r2 * ref.factor,
    })
    const scale = Math.max(1, ref.scale * (ref.r1 + ref.r2 * (1 + ref.factor)))
    sample.point.forEach((x, i) => expect(Math.abs(x - ref.q[i]!) / scale).toBeLessThan(4e-15))
    const d = sample.point.map((x, i) => x - p[i]!)
    expect(Math.abs(Math.hypot(...d) - sample.radius) / scale).toBeLessThan(4e-15)
    expect(Math.abs(d[0]! * sample.radial[0] + d[1]! * sample.radial[1]) / scale).toBeLessThan(4e-15)
    const a = sample.radius,
      R = ref.scale * ref.r1,
      r = ref.scale * ref.r2
    expect((Math.hypot(...sample.point) - (r + Math.hypot(R, a))) / scale).toBeLessThan(4e-15)
    if (R >= r) expect((R - r - Math.hypot(sample.point[0], sample.point[1])) / scale).toBeLessThan(4e-15)
    if (!ref.factor) expect(sample.point).toEqual(p)
  }
})

it('draws actual construction circles with their stated centers, radii and orthogonal planes', () => {
  const runner = makeRunner('two-arm-torus')
  runner.advance(170)
  const e = runner.inspect(170).env
  const p: [number, number, number] = [e.x!, e.y!, e.z!]
  const sample = thirdCircleSample(170, p, { constantId: 'pi', dt: 0.05, radius: 100 })
  const frame = {
    step: 170,
    center: p,
    elbow: sample.radial.map((x) => x * 130) as [number, number, number],
    major: 130,
    minor: 100,
    sample,
  }
  const construction = new ThirdCircleConstruction()
  construction.update(frame, { ...DEFAULT_PRESENTATION, thirdFlow: true }, true)
  const centers = [new Vector3(), new Vector3(...frame.elbow), new Vector3(...p)]
  const normals = [new Vector3(0, 0, 1), new Vector3(...sample.tangent), new Vector3(...sample.radial)]
  expect(centers[1]!.length()).toBeCloseTo(130, 10)
  expect(new Vector3(...p).sub(centers[1]!).length()).toBeCloseTo(100, 10)
  construction.group.children.slice(0, 3).forEach((object, index) => {
    const circle = object as LineLoop,
      attribute = circle.geometry.attributes.position!
    for (let i = 0; i < attribute.count; i++) {
      const delta = new Vector3()
        .fromBufferAttribute(attribute, i)
        .applyMatrix4(circle.matrix)
        .sub(centers[index]!)
      expect(Math.abs(delta.length() - [130, 100, 100][index]!) / 130).toBeLessThan(1e-7)
      expect(Math.abs(delta.dot(normals[index]!)) / 130).toBeLessThan(1e-7)
    }
  })
  construction.dispose()
})

it('passes inside and outside the existing torus without changing its source points', async () => {
  const source = new GeometryStore(),
    third = new GeometryStore(),
    writer = new GeometryBatchWriter()
  makeRunner('two-arm-torus', 1200).advance(1000, writer)
  source.append(writer.flush())
  const sha = await geometryDigest(source, source.count)
  const data = source.chunks[0]!.slice(0, source.count * 7)
  let inside = 0,
    outside = 0
  for (let i = 0; i < source.count; i++) {
    const o = i * 7
    const q = thirdCircleSample(data[o + 1]!, [data[o + 2]!, data[o + 3]!, data[o + 4]!], {
      constantId: 'pi',
      dt: 0.05,
      radius: 100,
    }).point
    const distance = Math.hypot(Math.hypot(q[0], q[1]) - 130, q[2])
    if (distance < 99) inside++
    if (distance > 101) outside++
    data.set(q, o + 2)
  }
  expect(inside).toBeGreaterThan(0)
  expect(outside).toBeGreaterThan(0)
  third.append({ data, count: source.count })
  expect(await geometryDigest(third, 300)).toBe(
    '98256d86efddb394a336931ccdcc4b9c723df9373f0597299ab53aebc17b58a3',
  )
  const p = { ...DEFAULT_PRESENTATION, thirdFlow: true, mode: 'yin-yang' as const }
  expect(geometryCsv(source, 1000, 900, true, p, true, third).join('').trim().split('\n')).toHaveLength(301)
  expect(geometrySvg(source, 1000, 'three', 'rule', 900, p, true, true, third).join('')).toContain(
    'data-flow="third"',
  )
  expect(() => geometryCsv(source, 1000, 0, true, p, true)).toThrow('not ready')
  expect(await geometryDigest(source, source.count)).toBe(sha)
})

it('keeps old phase files explicit and saves the new circle separately in v6', () => {
  expect(hasThirdFlow({ ...DEFAULT_PRESENTATION, thirdFlow: true }, true)).toBe(true)
  expect(parsePresentation({ thirdFlow: true, mode: 'yin-yang', thirdQuarter: -1 }).thirdModel).toBe('phase')
  expect(
    thirdCircleConfig('pi', { dt: 0.05, scale: 100, r2: 1 }, { ...DEFAULT_PRESENTATION, thirdRadius: 0.75 })
      .radius,
  ).toBe(75)
  expect(thirdCircleFormulaLines().join('\n')).toContain('C²')
  const file = {
    format: FILE_FORMAT,
    version: 6,
    steps: 1,
    config: { experiment: 'two-arm-torus', presentation: { ...DEFAULT_PRESENTATION, thirdFlow: true } },
    result: {
      geometryRecords: 1,
      geometrySha256: 'a'.repeat(64),
      thirdCircle: { geometryRecords: 1, geometrySha256: 'b'.repeat(64) },
    },
  }
  expect(parseImport(JSON.stringify(file)).expectedThirdDigest).toBe('b'.repeat(64))
  const missing = JSON.parse(JSON.stringify(file))
  delete missing.result.thirdCircle
  expect(() => parseImport(JSON.stringify(missing))).toThrow('missing third-circle')
  const wrongCount = structuredClone(file)
  wrongCount.result.thirdCircle.geometryRecords = 2
  expect(() => parseImport(JSON.stringify(wrongCount))).toThrow('invalid third-circle')
  for (const patch of [
    { thirdRadius: -1 },
    { thirdRadius: 4 },
    { thirdGuides: 'yes' },
    { thirdModel: 'other' },
  ])
    expect(() => parsePresentation({ ...DEFAULT_PRESENTATION, ...patch })).toThrow()
})
