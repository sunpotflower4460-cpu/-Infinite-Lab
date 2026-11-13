// Actual UI/render/export evidence; run with Vite on :4175.
import { chromium } from 'playwright-core'
import { mkdir, writeFile } from 'node:fs/promises'

const output = 'artifacts/third-flow/'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || '/usr/bin/chromium',
  headless: true,
  args: ['--enable-unsafe-swiftshader'],
})
const errors = [],
  snapshots = [],
  measurements = []
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
  await page.getByRole('button', { name: 'Pause film', exact: true }).click()
  await page.evaluate(async () => {
    window.__thirdLab = (await import('/src/app/LabController.ts')).getController()
  })
  await page
    .getByRole('group', { name: 'Two-Arm view' })
    .getByRole('button', { name: 'Torus', exact: true })
    .click()
  await page.waitForFunction(
    () => window.__thirdLab.store.getState().switching === null && !!window.__thirdLab.view3d,
  )
  await page.locator('.observation-options summary').click()
  await page.getByRole('button', { name: '穴あり 腕1=1.3, 腕2=1', exact: true }).click()
  await page.waitForFunction(() => window.__thirdLab.store.getState().switching === null)
  await page.getByLabel('トーラス面の補助表示').check()
  await page.getByLabel('線幅').press('Home')
  for (let i = 0; i < 3; i++) await page.getByLabel('線幅').press('ArrowRight')
  await page.locator('.observation-options summary').click()
  await page.getByLabel('第3の流れを半透明で表示').check()
  for (const step of [300, 1000, 10000]) {
    await page.evaluate((n) => window.__thirdLab.seek(n), step)
    await page.waitForFunction((n) => {
      const s = window.__thirdLab.store.getState()
      return (s.viewStep ?? s.currentStep) === n && s.switching === null
    }, step)
    if (step === 10000) await page.getByLabel('Trail', { exact: true }).selectOption('300')
    await page.waitForTimeout(150)
    const file = (mobile ? 'mobile' : 'desktop') + '-' + step + '.jpg'
    await page.screenshot({ path: output + file, type: 'jpeg', quality: 90 })
    snapshots.push(file)
  }
  await page.evaluate(() => window.__thirdLab.seek(1000))
  await page.waitForFunction(
    () =>
      (window.__thirdLab.store.getState().viewStep ?? window.__thirdLab.store.getState().currentStep) ===
      1000,
  )
  await page.getByLabel('Trail', { exact: true }).selectOption('300')
  await page.locator('.observation-options summary').click()
  await page.getByLabel('表示する流れ').selectOption('third')
  if (mobile) await page.screenshot({ path: output + 'mobile-options.jpg', type: 'jpeg', quality: 90 })
  await page.locator('.observation-options summary').click()
  await page.waitForTimeout(150)
  await page.screenshot({
    path: output + (mobile ? 'mobile' : 'desktop') + '-third-only.jpg',
    type: 'jpeg',
    quality: 90,
  })
  await page.locator('.observation-options summary').click()
  await page.getByLabel('表示する流れ').selectOption('both')
  await page.locator('.observation-options summary').click()
  if (!mobile) {
    const [png] = await Promise.all([
      page.waitForEvent('download'),
      page.evaluate(() => window.__thirdLab.exportAs('png')),
    ])
    await png.saveAs(output + 'torus-third-flow.png')
    const before = await page.evaluate(() => {
      const c = window.__thirdLab,
        s = c.store.getState()
      return {
        step: s.currentStep,
        viewStep: s.viewStep,
        camera: c.view3d.cameraView(),
        presentation: s.presentation,
      }
    })
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 90_000 }),
      page.evaluate(() =>
        window.__thirdLab.exportVideo({ format: 'mp4', seconds: 2, pace: 'linear', glow: false }),
      ),
    ])
    await download.saveAs(output + 'torus-third-flow.mp4')
    const after = await page.evaluate(() => {
      const c = window.__thirdLab,
        s = c.store.getState()
      return {
        step: s.currentStep,
        viewStep: s.viewStep,
        camera: c.view3d.cameraView(),
        presentation: s.presentation,
      }
    })
    await writeFile(output + 'video-restore.json', JSON.stringify({ before, after }, null, 2))
    for (const step of [1000, 10000, 100000]) {
      await page.evaluate((n) => window.__thirdLab.seek(n), step)
      await page.waitForFunction(
        (n) =>
          (window.__thirdLab.store.getState().viewStep ?? window.__thirdLab.store.getState().currentStep) ===
          n,
        step,
      )
      for (const third of [false, true]) {
        await page.evaluate(
          (enabled) =>
            window.__thirdLab.setPresentation({ thirdFlow: enabled, mode: 'yin-yang', trail: 0, width: 1 }),
          third,
        )
        await page.waitForTimeout(100)
        measurements.push(
          await page.evaluate(
            async ({ step, third }) => {
              const c = window.__thirdLab,
                v = c.view3d
              await v.snapshotPng()
              return {
                step,
                third,
                sourceRecords: c.renderer.store.count,
                visibleRecords: c.renderer.visibleRecords,
                sharedWideGeometry: v.originalLine.geometry === v.thirdLine.geometry,
                sharedNativeGeometry: v.nativeLines[0].geometry === v.nativeLines[4].geometry,
                memory: v.renderer.info.memory,
                drawCalls: v.renderer.info.render.calls,
              }
            },
            { step, third },
          ),
        )
      }
    }
  }
  await context.close()
}
await browser.close()
await writeFile(output + 'capture.json', JSON.stringify({ snapshots, errors, measurements }, null, 2))
if (errors.length) throw new Error(errors.join('\n'))
