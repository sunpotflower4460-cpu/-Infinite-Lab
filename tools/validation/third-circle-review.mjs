import { createServer } from 'vite'
import { mkdir, writeFile } from 'node:fs/promises'
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { evaluateSet } = await server.ssrLoadModule('/src/experiments/core/formula/index.ts')
  const { getExperiment } = await server.ssrLoadModule('/src/experiments/registry.ts')
  const { COMPUTE_SYNC } = await server.ssrLoadModule('/src/math/constants/index.ts')
  const { binaryConstantFor } = await server.ssrLoadModule('/src/math/exactReduce.ts')
  const { thirdCircleSample } = await server.ssrLoadModule('/src/lab/thirdCircle.ts')
  const { default: references } = await server.ssrLoadModule('/tests/fixtures/third-circle-reference.json')
  const pi = binaryConstantFor('pi', COMPUTE_SYNC.pi)
  let coordinate = 0,
    radius = 0,
    plane = 0
  for (const ref of references) {
    const e = evaluateSet(
      getExperiment('two-arm-torus').formulas,
      { n: ref.n, dt: ref.dt, r1: ref.r1, r2: ref.r2, scale: ref.scale },
      { constant: binaryConstantFor(ref.constant, COMPUTE_SYNC[ref.constant]), pi },
    )
    const p = [e.x, e.y, e.z],
      sample = thirdCircleSample(ref.n, p, {
        constantId: ref.constant,
        dt: ref.dt,
        radius: ref.scale * ref.r2 * ref.factor,
      })
    const scale = Math.max(1, ref.scale * (ref.r1 + ref.r2 * (1 + ref.factor))),
      d = sample.point.map((v, i) => v - p[i])
    for (let i = 0; i < 3; i++)
      coordinate = Math.max(coordinate, Math.abs(sample.point[i] - ref.q[i]) / scale)
    radius = Math.max(radius, Math.abs(Math.hypot(...d) - sample.radius) / scale)
    plane = Math.max(plane, Math.abs(d[0] * sample.radial[0] + d[1] * sample.radial[1]) / scale)
  }
  const result = {
    cases: references.length,
    maxNormalizedCoordinateError: coordinate,
    maxNormalizedRadiusError: radius,
    maxNormalizedPlaneError: plane,
  }
  if (Math.max(coordinate, radius, plane) >= 4e-15) throw new Error(JSON.stringify(result))
  await mkdir('artifacts/third-circle', { recursive: true })
  await writeFile('artifacts/third-circle/math-review.json', JSON.stringify(result, null, 2))
  console.log(result)
} finally {
  await server.close()
}
