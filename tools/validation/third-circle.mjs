// Actual three-circle construction, not a rotated copy. Vite:4176 is required.
import { chromium } from 'playwright-core'
import { mkdir, writeFile } from 'node:fs/promises'
const output = 'artifacts/third-circle/'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  headless: true,
  args: ['--enable-unsafe-swiftshader'],
})
const captures = [],
  errors = [],
  measurements = []
let videoRestore = null
for (const mobile of [false, true]) {
  const page = await browser.newPage({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 960 },
    isMobile: mobile,
    hasTouch: mobile,
    deviceScaleFactor: 1,
  })
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  await page.goto('http://localhost:4176/#film')
  await page.getByRole('button', { name: 'Pause film', exact: true }).click()
  await page.evaluate(async () => {
    window.__circleLab = (await import('/src/app/LabController.ts')).getController()
  })
  await page
    .getByRole('group', { name: 'Two-Arm view' })
    .getByRole('button', { name: 'Torus', exact: true })
    .click()
  await page.waitForFunction(
    () => !!window.__circleLab.view3d && window.__circleLab.store.getState().switching === null,
  )
  await page.locator('.observation-options summary').click()
  await page.getByRole('button', { name: '穴あり 腕1=1.3, 腕2=1', exact: true }).click()
  await page.waitForFunction(() => window.__circleLab.store.getState().switching === null)
  await page.locator('.observation-options summary').click()
  await page.getByRole('button', { name: '陰陽', exact: true }).click()
  await page.getByLabel('第3の円を追加', { exact: true }).check()
  await page.getByRole('radio', { name: '説明なし', exact: true }).click()
  await page.evaluate(() =>
    window.__circleLab.setPresentation({
      thirdOpacity: 0.9,
      width: 1,
      opacity: 0.35,
      glow: 0,
      trail: 100,
      torusSurface: true,
      thirdGuides: true,
    }),
  )
  for (const step of [170, 250]) {
    await page.evaluate((n) => window.__circleLab.seek(n), step)
    await page.waitForFunction(
      (n) =>
        (window.__circleLab.store.getState().viewStep ?? window.__circleLab.store.getState().currentStep) ===
        n,
      step,
    )
    await page.evaluate(async () => {
      await window.__circleLab.thirdCircle.ready(window.__circleLab.renderer.store.count)
      window.__circleLab.view3d.preset('oblique')
      window.__circleLab.view3d.fit()
    })
    await page.waitForTimeout(150)
    const prefix = (mobile ? 'mobile' : 'desktop') + '-' + step
    await page.screenshot({ path: output + prefix + '.jpg', type: 'jpeg', quality: 90 })
    if (!mobile) {
      const [file] = await Promise.all([
        page.waitForEvent('download'),
        page.evaluate(() => window.__circleLab.exportAs('png')),
      ])
      await file.saveAs(output + prefix + '.png')
      if (step === 170) {
        const b = await page.getByTestId('canvas-3d').boundingBox()
        await page.screenshot({
          path: output + 'circle-closeup.png',
          clip: {
            x: b.x + b.width * 0.26,
            y: b.y + b.height * 0.05,
            width: b.width * 0.48,
            height: b.height * 0.85,
          },
        })
      }
    }
    captures.push(
      await page.evaluate(() => {
        const c = window.__circleLab,
          s = c.store.getState(),
          f = c.thirdFrame()
        return {
          step: s.viewStep ?? s.currentStep,
          presentation: s.presentation,
          params: s.params,
          frame: f,
          tubeDistance: f
            ? Math.hypot(Math.hypot(f.sample.point[0], f.sample.point[1]) - f.major, f.sample.point[2])
            : null,
          source: c.renderer.store.count,
          third: c.thirdCircle.store.count,
        }
      }),
    )
  }
  if (!mobile) {
    await page.evaluate(() => window.__circleLab.seek(300))
    await page.waitForFunction(
      () =>
        (window.__circleLab.store.getState().viewStep ?? window.__circleLab.store.getState().currentStep) ===
        300,
    )
    await page.evaluate(() => window.__circleLab.thirdCircle.ready(window.__circleLab.renderer.store.count))
    const snapshot = () =>
      page.evaluate(async () => {
        const c = window.__circleLab,
          s = c.store.getState()
        return {
          step: s.currentStep,
          viewStep: s.viewStep,
          camera: c.view3d.cameraView(),
          result: (await c.buildExport()).result,
        }
      })
    const before = await snapshot()
    const [file] = await Promise.all([
      page.waitForEvent('download', { timeout: 90000 }),
      page.evaluate(() =>
        window.__circleLab.exportVideo({ format: 'mp4', seconds: 4, pace: 'linear', glow: false }),
      ),
    ])
    await file.saveAs(output + 'third-circle.mp4')
    videoRestore = { before, after: await snapshot() }
    for (const step of [1000, 10000, 100000]) {
      await page.evaluate((n) => {
        const c = window.__circleLab
        c.setPresentation({ thirdFlow: false })
        c.seek(n)
      }, step)
      await page.waitForFunction(
        (n) =>
          (window.__circleLab.store.getState().viewStep ??
            window.__circleLab.store.getState().currentStep) === n,
        step,
      )
      measurements.push(
        await page.evaluate(async () => {
          const c = window.__circleLab,
            before = await c.buildExport(),
            start = performance.now()
          c.setPresentation({ thirdFlow: true, thirdModel: 'circle' })
          await c.thirdCircle.ready(c.renderer.store.count)
          const workerReadyMs = performance.now() - start,
            after = await c.buildExport()
          return {
            step: after.steps,
            sourceRecords: after.result.geometryRecords,
            thirdRecords: after.result.thirdCircle.geometryRecords,
            originalShaBefore: before.result.geometrySha256,
            originalShaAfter: after.result.geometrySha256,
            workerReadyMs,
          }
        }),
      )
    }
  }
  await page.close()
}
await browser.close()
await writeFile(
  output + 'capture.json',
  JSON.stringify({ captures, errors, measurements, videoRestore }, null, 2),
)
if (
  measurements.some((m) => m.originalShaBefore !== m.originalShaAfter || m.sourceRecords !== m.thirdRecords)
)
  throw new Error('Source geometry changed')
if (errors.length) throw new Error(errors.join('\n'))
