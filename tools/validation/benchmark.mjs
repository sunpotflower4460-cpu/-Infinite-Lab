// Compare the same Torus pipeline against a baseline Vite server at :4174.
import { chromium } from 'playwright-core'
import { writeFile } from 'node:fs/promises'
const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  headless: true,
  args: ['--enable-unsafe-swiftshader'],
})
const results = []
for (const port of [4174, 4173]) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } })
  await page.goto('http://localhost:' + port + '/#film')
  await page.evaluate(async () => {
    const { getController } = await import('/src/app/LabController.ts')
    window.__lab = getController()
  })
  await page.waitForFunction(() => window.__lab.store.getState().playing)
  await page.evaluate(() => window.__lab.toggleFilm())
  await page.waitForFunction(() => !window.__lab.store.getState().playing)
  await page.getByRole('button', { name: 'Close film' }).click()
  await page
    .getByRole('group', { name: 'Two-Arm view' })
    .getByRole('button', { name: 'Torus', exact: true })
    .click()
  await page.waitForFunction(() => !!window.__lab.view3d)
  for (const step of [1000, 10000, 100000]) {
    const start = Date.now()
    await page.evaluate((step) => window.__lab.seek(step), step)
    await page.waitForFunction((step) => window.__lab.store.getState().currentStep === step, step)
    const computeMs = Date.now() - start
    const data = await page.evaluate(async () => {
      const c = window.__lab,
        v = c.view3d
      const samples = []
      for (let i = 0; i < 12; i++) {
        const t = performance.now()
        await v.snapshotPng()
        samples.push(performance.now() - t)
      }
      return {
        pngMedianMs: samples.sort((a, b) => a - b)[6],
        heap: performance.memory?.usedJSHeapSize,
        geometryBytes: c.renderer.store.count * 56,
      }
    })
    results.push({ port, step, computeMs, ...data })
  }
  await page.close()
}
await writeFile('artifacts/sphere-lift/baseline.json', JSON.stringify(results, null, 2))
console.log(results)
await browser.close()
