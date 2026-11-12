// Actual Film screenshots/video through the same controller and renderers as the UI.
// Run with Vite at :4175: npm run dev -- --port 4175 --strictPort
import { chromium } from 'playwright-core'
import { mkdir, writeFile } from 'node:fs/promises'
const output = 'artifacts/torus/'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || '/usr/bin/chromium',
  headless: true,
  args: ['--enable-unsafe-swiftshader'],
})
const errors = []
const snapshots = []
for (const mobile of [false, true]) {
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 960 },
    isMobile: mobile,
    hasTouch: mobile,
    deviceScaleFactor: 1,
  })
  const page = await context.newPage()
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  await page.goto('http://localhost:4175/#film')
  await page.evaluate(async () => {
    const { getController } = await import('/src/app/LabController.ts')
    window.__torusLab = getController()
  })
  await page.waitForFunction(() => window.__torusLab.store.getState().playing)
  await page.evaluate(() => window.__torusLab.toggleFilm())
  await page.waitForFunction(() => !window.__torusLab.store.getState().playing)
  const view = page.getByRole('group', { name: 'Two-Arm view' })
  await view.getByRole('button', { name: 'Torus', exact: true }).click()
  await page.waitForFunction(
    () => window.__torusLab.store.getState().switching === null && !!window.__torusLab.view3d,
  )
  await page.locator('.observation-options summary').click()
  await page.getByRole('button', { name: '穴あり 腕1=1.3, 腕2=1', exact: true }).click()
  await page.waitForFunction(() => window.__torusLab.store.getState().switching === null)
  await page.locator('.observation-options summary').click()
  for (const step of [300, 1000, 10000]) {
    await page.evaluate((n) => window.__torusLab.seek(n), step)
    await page.waitForFunction((n) => {
      const s = window.__torusLab.store.getState()
      return (s.viewStep ?? s.currentStep) === n
    }, step)
    for (const [mode, key] of [
      ['Solo', 'solo'],
      ['左右対称', 'mirror'],
      ['陰陽', 'yin-yang'],
    ]) {
      await page.getByRole('button', { name: mode, exact: true }).click()
      await page.waitForTimeout(100)
      const file = (mobile ? 'mobile' : 'desktop') + '-' + step + '-' + key + '.jpg'
      await page.screenshot({ path: output + file, type: 'jpeg', quality: 88 })
      snapshots.push(file)
    }
  }
  // A short tail reveals individual flows once a dense torus has formed.
  await page.getByLabel('Trail', { exact: true }).selectOption('300')
  await page.waitForTimeout(100)
  await page.screenshot({
    path: output + (mobile ? 'mobile' : 'desktop') + '-trail-300.jpg',
    type: 'jpeg',
    quality: 88,
  })
  if (!mobile) {
    await page.evaluate(() => window.__torusLab.seek(1000))
    await page.waitForFunction(
      () =>
        (window.__torusLab.store.getState().viewStep ?? window.__torusLab.store.getState().currentStep) ===
        1000,
    )
    const before = await page.evaluate(() => {
      const c = window.__torusLab,
        s = c.store.getState()
      return { step: s.currentStep, viewStep: s.viewStep, camera: c.view3d.cameraView() }
    })
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 90000 }),
      page.evaluate(() =>
        window.__torusLab.exportVideo({ format: 'mp4', seconds: 2, pace: 'linear', glow: false }),
      ),
    ])
    await download.saveAs(output + 'torus-yin-yang.mp4')
    const after = await page.evaluate(() => {
      const c = window.__torusLab,
        s = c.store.getState()
      return { step: s.currentStep, viewStep: s.viewStep, camera: c.view3d.cameraView() }
    })
    await writeFile(output + 'video-restore.json', JSON.stringify({ before, after }, null, 2))
  }
  await context.close()
}
await browser.close()
await writeFile(output + 'capture.json', JSON.stringify({ snapshots, errors }, null, 2))
if (errors.length) throw new Error(errors.join('\n'))
