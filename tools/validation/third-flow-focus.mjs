// Clear, unretouched app renders. Run with Vite on :4175.
import { chromium } from 'playwright-core'
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer } from 'vite'

const output = 'artifacts/third-flow-review/'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || '/usr/bin/chromium',
  headless: true,
  args: ['--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 })
const errors = [],
  captures = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
await page.goto('http://localhost:4175/#film')
await page.getByRole('button', { name: 'Pause film', exact: true }).click()
await page.evaluate(async () => {
  window.__focusLab = (await import('/src/app/LabController.ts')).getController()
})
await page
  .getByRole('group', { name: 'Two-Arm view' })
  .getByRole('button', { name: 'Torus', exact: true })
  .click()
await page.waitForFunction(
  () => !!window.__focusLab.view3d && window.__focusLab.store.getState().switching === null,
)
await page.locator('.observation-options summary').click()
await page.getByRole('button', { name: '穴あり 腕1=1.3, 腕2=1', exact: true }).click()
await page.waitForFunction(() => window.__focusLab.store.getState().switching === null)
await page.locator('.observation-options summary').click()
await page.getByLabel('第3の流れを半透明で表示').check()
await page.getByRole('radio', { name: '説明なし', exact: true }).click()
await page.evaluate(() => window.__focusLab.seek(126))
await page.waitForFunction(
  () =>
    (window.__focusLab.store.getState().viewStep ?? window.__focusLab.store.getState().currentStep) === 126,
)
await page.evaluate(() => {
  const c = window.__focusLab
  c.setPresentation({
    thirdOpacity: 0.95,
    width: 3,
    opacity: 0.16,
    glow: 0,
    trail: 0,
    torusSurface: true,
    autoRotate: false,
  })
  c.view3d.preset('oblique')
})
async function download(name, action) {
  const [file] = await Promise.all([page.waitForEvent('download', { timeout: 90000 }), action()])
  await file.saveAs(output + name)
}
for (const [flow, name] of [
  ['both', 'focused-three'],
  ['third', 'focused-third'],
]) {
  await page.evaluate((flow) => {
    const c = window.__focusLab
    c.setPresentation({ flow })
    c.store.setState({ selectedFlow: 'third' })
  }, flow)
  await page.waitForTimeout(100)
  await download(name + '.png', () => page.evaluate(() => window.__focusLab.exportAs('png')))
  await page.screenshot({ path: output + name + '-ui.jpg', type: 'jpeg', quality: 90 })
  captures.push(
    await page.evaluate(() => {
      const c = window.__focusLab,
        s = c.store.getState()
      return {
        step: s.viewStep ?? s.currentStep,
        params: s.params,
        presentation: s.presentation,
        camera: c.view3d.cameraView(),
      }
    }),
  )
}
await download('focused-third.mp4', () =>
  page.evaluate(() =>
    window.__focusLab.exportVideo({ format: 'mp4', seconds: 3, pace: 'linear', glow: false }),
  ),
)
const rasterColors = []
for (const width of [1, 4]) {
  await page.evaluate(
    (width) =>
      window.__focusLab.setPresentation({ width, thirdOpacity: 1, torusSurface: false, flow: 'third' }),
    width,
  )
  await download('opaque-' + width + '.png', () => page.evaluate(() => window.__focusLab.exportAs('png')))
  rasterColors.push(
    await page.getByTestId('canvas-3d').evaluate((el, width) => {
      const c = document.createElement('canvas')
      c.width = el.width
      c.height = el.height
      const ctx = c.getContext('2d')
      ctx.drawImage(el, 0, 0)
      const d = ctx.getImageData(0, 0, c.width, c.height).data,
        histogram = new Map()
      for (let i = 0; i < d.length; i += 4) {
        const [r, g, b] = [d[i], d[i + 1], d[i + 2]]
        if (b > r + 6 && r > g + 6 && b > 80) {
          const k = [r, g, b].join(',')
          histogram.set(k, (histogram.get(k) || 0) + 1)
        }
      }
      return { width, colors: [...histogram].sort((a, b) => b[1] - a[1]).slice(0, 5) }
    }, width),
  )
}
await browser.close()

// Separately compare each flow to independently computed analytical parametrizations.
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const [
    { evaluateSet },
    { getExperiment },
    { COMPUTE_SYNC },
    { binaryConstantFor },
    { transformFlowPoint, DEFAULT_PRESENTATION },
    { default: refs },
  ] = await Promise.all([
    vite.ssrLoadModule('/src/experiments/core/formula/index.ts'),
    vite.ssrLoadModule('/src/experiments/registry.ts'),
    vite.ssrLoadModule('/src/math/constants/index.ts'),
    vite.ssrLoadModule('/src/math/exactReduce.ts'),
    vite.ssrLoadModule('/src/lab/presentation.ts'),
    vite.ssrLoadModule('/tests/fixtures/third-flow-reference.json'),
  ])
  const pi = binaryConstantFor('pi', COMPUTE_SYNC.pi)
  let maxCoordinateError = 0,
    maxSurfaceResidual = 0,
    comparisons = 0
  for (const ref of refs) {
    const e = evaluateSet(
      getExperiment('two-arm-torus').formulas,
      { n: ref.n, dt: ref.dt, r1: ref.r1, r2: ref.r2, scale: ref.scale },
      { constant: binaryConstantFor(ref.constant, COMPUTE_SYNC[ref.constant]), pi },
    )
    const R = ref.r1 * ref.scale,
      r = ref.r2 * ref.scale,
      radius = Math.max(1, R + r)
    for (const [flow, thirdQuarter, expected] of [
      ['original', 1, ref.original],
      ['derived', 1, ref.derived],
      ['third', 1, ref.positive],
      ['third', -1, ref.negative],
    ]) {
      const actual = transformFlowPoint(
        e.x,
        e.y,
        e.z,
        { ...DEFAULT_PRESENTATION, mode: 'yin-yang', thirdQuarter },
        flow,
      )
      comparisons++
      for (let i = 0; i < 3; i++)
        maxCoordinateError = Math.max(maxCoordinateError, Math.abs(actual[i] - expected[i]) / radius)
      const [x, y, z] = actual,
        a = x * x + y * y + z * z + R * R - r * r
      maxSurfaceResidual = Math.max(
        maxSurfaceResidual,
        Math.abs(a * a - 4 * R * R * (x * x + y * y)) / Math.max(1, (R + r) ** 4),
      )
    }
  }
  const independent = { cases: refs.length, comparisons, maxCoordinateError, maxSurfaceResidual }
  await writeFile(
    output + 'review.json',
    JSON.stringify({ errors, captures, rasterColors, independent }, null, 2),
  )
  if (errors.length || maxCoordinateError >= 4e-15 || maxSurfaceResidual >= 4e-15)
    throw new Error('Review checks failed: ' + JSON.stringify({ errors, independent }))
} finally {
  await vite.close()
}
