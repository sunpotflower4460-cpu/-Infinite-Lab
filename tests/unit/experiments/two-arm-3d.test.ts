import { describe, expect, it } from 'vitest'
import { GeometryBatchWriter, decodeRecord } from '../../../src/geometry/batch'
import { GeometryStore } from '../../../src/geometry/GeometryStore'
import { geometryDigest } from '../../../src/geometry/digest'
import { point } from '../../../src/geometry/types'
import { CSV_HEADER_3D, geometryCsv } from '../../../src/lab/exporters'
import { detCos, detSin } from '../../../src/math/detmath'
import { binaryConstantFor, productModTau } from '../../../src/math/exactReduce'
import { computePi } from '../../../src/math/constants/pi'
import { makeRunner } from '../helpers'

const pi = binaryConstantFor('pi', computePi)

function storeOf(id: string, steps: number, params = {}): GeometryStore {
  const runner = makeRunner(id, 2000, params)
  const w = new GeometryBatchWriter()
  runner.advance(steps, w)
  const store = new GeometryStore()
  store.append(w.flush())
  return store
}

describe('Two-Arm 3D: Torus', () => {
  it('places step n at the torus point of the exact two-arm angles (θ₁, θ₂)', () => {
    const runner = makeRunner('two-arm-torus', 1000, { dt: 0.05, r1: 2, r2: 1, scale: 100 })
    runner.advance(5)
    for (let n = 1; n <= 5; n++) {
      const t = runner.inspect(n)
      const th1 = productModTau([n, 0.05], null, pi)
      const th2 = productModTau([n, 0.05], pi, pi)
      expect(t.env.theta1).toBe(th1)
      expect(t.env.theta2).toBe(th2)
      const rho = 2 + 1 * detCos(th2)
      expect(t.instructions).toEqual([
        {
          type: 'point',
          x: 100 * (rho * detCos(th1)),
          y: 100 * (rho * detSin(th1)),
          z: 100 * (1 * detSin(th2)),
        },
      ])
    }
    expect(runner.inspect(1).evaluations.map((e) => e.symbolic)).toEqual([
      'θ₁ = (n × dt) mod 2π',
      'θ₂ = (n × dt × π) mod 2π',
      'ρ = r1 + r2 × cos(θ₂)',
      'x[n] = scale × (ρ × cos(θ₁))',
      'y[n] = scale × (ρ × sin(θ₁))',
      'z[n] = scale × (r2 × sin(θ₂))',
    ])
  })

  it('is the two-arm machine with arm 2 turning in the vertical plane (arms shown, not stored)', () => {
    const runner = makeRunner('two-arm-torus', 1000, { dt: 0.05, r1: 1.3, r2: 1, scale: 100, drawArms: true })
    runner.advance(50)
    for (const n of [1, 17, 50]) {
      const t = runner.inspect(n)
      const [origin, elbow, pen] = t.overlay!
      expect(origin).toEqual({ type: 'point', x: 0, y: 0, z: 0 })
      if (elbow?.type !== 'point' || pen?.type !== 'point') throw new Error('expected points')
      // arm 1: length 130, horizontal, at angle θ₁
      expect(Math.hypot(elbow.x, elbow.y)).toBeCloseTo(130, 10)
      expect(elbow.z).toBe(0)
      // arm 2: length 100, in the vertical plane through arm 1, at angle θ₂ above the level
      const dx = pen.x - elbow.x
      const dy = pen.y - elbow.y
      expect(Math.hypot(dx, dy, pen.z!)).toBeCloseTo(100, 10)
      expect(dx * elbow.y - dy * elbow.x).toBeCloseTo(0, 8) // same vertical plane as arm 1
      expect(Math.atan2(pen.z!, Math.hypot(dx, dy) * Math.sign(dx * elbow.x + dy * elbow.y))).toBeCloseTo(
        Math.atan2(Math.sin(t.env.theta2!), Math.cos(t.env.theta2!)),
        10,
      )
      expect(t.instructions).toEqual([pen])
    }
  })

  it('uses the same angles as the 2D Two-Arm Rotation at every step', () => {
    const flat = makeRunner('two-arm', 1000)
    const torus = makeRunner('two-arm-torus', 1000)
    flat.advance(300)
    torus.advance(300)
    for (const n of [1, 7, 22, 113, 300]) {
      expect(torus.inspect(n).env.theta1).toBe(flat.inspect(n).env.theta1)
      expect(torus.inspect(n).env.theta2).toBe(flat.inspect(n).env.theta2)
    }
  })

  it('every point lies on the torus: (√(x² + y²) − R·s)² + z² = (r·s)²', () => {
    const store = storeOf('two-arm-torus', 1500)
    for (let i = 0; i < store.count; i += 37) {
      const { instruction: g } = decodeRecord(store.chunks[Math.floor(i / 2000)]!, i % 2000)
      if (g.type !== 'point') throw new Error('expected points')
      const d = Math.hypot(g.x, g.y) - 130 // default R = 1.3, scale 100
      expect(Math.hypot(d, g.z!)).toBeCloseTo(100, 9)
    }
  })
})

describe('Two-Arm 3D: Sphere', () => {
  it('uses θ₁ as longitude and θ₂ as latitude; every point lies on the sphere', () => {
    const runner = makeRunner('two-arm-sphere', 1000, { dt: 0.05, radius: 2, scale: 100 })
    runner.advance(400)
    for (const n of [1, 3, 40, 399]) {
      const t = runner.inspect(n)
      const th1 = productModTau([n, 0.05], null, pi)
      const th2 = productModTau([n, 0.05], pi, pi)
      const rho = 2 * detCos(th2)
      expect(t.instructions).toEqual([
        {
          type: 'point',
          x: 100 * (rho * detCos(th1)),
          y: 100 * (rho * detSin(th1)),
          z: 100 * (2 * detSin(th2)),
        },
      ])
      const g = t.instructions[0]!
      if (g.type === 'point') expect(Math.hypot(g.x, g.y, g.z!)).toBeCloseTo(200, 9)
    }
  })

  it('is the torus with R = 0', () => {
    const sphere = storeOf('two-arm-sphere', 300, { radius: 1.5 })
    const torus = storeOf('two-arm-torus', 300, { r1: 0, r2: 1.5 })
    for (let i = 0; i < 300; i++) {
      const a = decodeRecord(sphere.chunks[0]!, i).instruction
      const b = decodeRecord(torus.chunks[0]!, i).instruction
      expect(a).toEqual(b)
    }
  })
})

describe('Two-Arm 3D: Height', () => {
  it('is the Two-Arm pen position with z = scale × rise × (n × dt)', () => {
    const flat = makeRunner('two-arm', 1000, { dt: 0.05, r1: 1, r2: 1, scale: 100 })
    const lifted = makeRunner('two-arm-height', 1000, { dt: 0.05, r1: 1, r2: 1, scale: 100, rise: 0.01 })
    flat.advance(200)
    lifted.advance(200)
    for (const n of [1, 2, 50, 200]) {
      const a = flat.inspect(n)
      const b = lifted.inspect(n)
      expect(b.env.x).toBe(a.env.x)
      expect(b.env.y).toBe(a.env.y)
      expect(b.env.z).toBe(100 * 0.01 * (n * 0.05))
      expect(b.instructions).toEqual([point(a.env.x!, a.env.y!, 100 * 0.01 * (n * 0.05))])
    }
  })
})

describe('3D geometry records', () => {
  it('a 2D point encodes exactly as before (z slot 0), so existing digests are unchanged', async () => {
    const a = new GeometryBatchWriter()
    a.push(1, point(3, 4))
    const b = new GeometryBatchWriter()
    b.push(1, point(3, 4, 0))
    const [sa, sb] = [new GeometryStore(), new GeometryStore()]
    sa.append(a.flush())
    sb.append(b.flush())
    expect(await geometryDigest(sa, Infinity)).toBe(await geometryDigest(sb, Infinity))
    expect(decodeRecord(sa.chunks[0]!, 0).instruction).toEqual({ type: 'point', x: 3, y: 4 })
  })

  it('z is part of the record, the digest and the 3D CSV', async () => {
    const store = storeOf('two-arm-torus', 50)
    const g = decodeRecord(store.chunks[0]!, 9).instruction
    expect(g.type === 'point' && g.z !== undefined).toBe(true)
    const other = storeOf('two-arm-torus', 50, { r2: 1.5 })
    expect(await geometryDigest(store, Infinity)).not.toBe(await geometryDigest(other, Infinity))
    const rows = geometryCsv(store, store.count, 0, true).join('').trim().split('\n')
    expect(rows[0]).toBe(CSV_HEADER_3D)
    const f = rows[10]!.split(',')
    expect(g.type === 'point' && [+f[2]!, +f[3]!, +f[9]!]).toEqual(g.type === 'point' && [g.x, g.y, g.z])
  })

  it('is deterministic: the same configuration gives the same digest', async () => {
    const a = await geometryDigest(storeOf('two-arm-height', 800), Infinity)
    const b = await geometryDigest(storeOf('two-arm-height', 800), Infinity)
    expect(a).toBe(b)
  })
})
