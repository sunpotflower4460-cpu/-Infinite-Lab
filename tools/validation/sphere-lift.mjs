// Run with Vite at :4173. Produces actual screenshots and incremental-render measurements.
import { chromium } from 'playwright-core'
import { mkdir, writeFile } from 'node:fs/promises'
const root = new URL('../../', import.meta.url).pathname
const output = root + 'artifacts/sphere-lift/'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || '/usr/bin/chromium',
  headless: true,
  args: ['--enable-unsafe-swiftshader'],
})
const errors = []
const measurements = []
for (const mobile of [false, true]) {
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 960 },
    hasTouch: mobile,
    isMobile: mobile,
    deviceScaleFactor: 1,
  })
  const page = await context.newPage()
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  await page.goto('http://localhost:4173/#film')
  await page.evaluate(async () => {
    const { getController } = await import('/src/app/LabController.ts')
    window.__lab = getController()
  })
  await page.waitForFunction(() => window.__lab.store.getState().playing)
  await page.evaluate(() => {
    if (window.__lab.filmRunning) window.__lab.toggleFilm()
  })
  await page.waitForFunction(() => !window.__lab.store.getState().playing)
  for (const shape of ['2D', 'Sphere']) {
    await page
      .getByRole('group', { name: 'Two-Arm view' })
      .getByRole('button', { name: shape, exact: true })
      .click()
    await page.waitForFunction(() => window.__lab.store.getState().switching === null)
    for (const step of [300, 1000, 10000]) {
      console.log('capture', mobile, shape, step)
      await page.evaluate(async (step) => {
        const { getController } = await import('/src/app/LabController.ts')
        getController().seek(step)
      }, step)
      await page.waitForFunction((step) => {
        const s = window.__lab.store.getState()
        return (s.viewStep ?? s.currentStep) === step
      }, step)
      for (const mode of ['Solo', '左右対称', '陰陽']) {
        await page.getByRole('button', { name: mode, exact: true }).click()
        await page.waitForTimeout(120)
        const name =
          (mobile ? 'mobile' : 'desktop') +
          '-' +
          shape +
          '-' +
          step +
          '-' +
          { Solo: 'solo', 左右対称: 'mirror', 陰陽: 'yin-yang' }[mode]
        await page.screenshot({ path: output + name + '.jpg', type: 'jpeg', quality: 85 })
      }
    }
  }
  if (!mobile) {
    // Observe isolated source upload/render cost, after source data has been computed.
    for (const step of [1000, 10000, 100000]) {
      await page.evaluate(async (step) => {
        const { getController } = await import('/src/app/LabController.ts')
        getController().seek(step)
      }, step)
      await page.waitForFunction((step) => window.__lab.store.getState().currentStep >= step, step)
      for (const mode of ['Solo', '左右対称', '陰陽']) {
        await page.getByRole('button', { name: mode, exact: true }).click()
        await page.waitForTimeout(100)
        const data = await page.evaluate(async () => {
          const { getController } = await import('/src/app/LabController.ts')
          const c = getController(),
            v = c.view3d
          const samples = []
          for (let i = 0; i < 12; i++) {
            const t = performance.now()
            v.preset(i % 2 ? 'top' : 'oblique')
            await v.snapshotPng()
            samples.push(performance.now() - t)
          }
          return {
            medianPngMs: samples.sort((a, b) => a - b)[6],
            storedRecords: c.renderer.store.count,
            geometryBytes: c.renderer.store.count * 56,
            heap: performance.memory?.usedJSHeapSize,
          }
        })
        measurements.push({ shape: 'Sphere', step, mode, ...data })
      }
    }
  }
  await context.close()
}
await writeFile(output + 'measurements.json', JSON.stringify({ measurements, errors }, null, 2))
await browser.close()
if (errors.length) throw new Error(errors.join('\n'))
