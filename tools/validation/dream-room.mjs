/** Actual UI captures and video exports. Start Vite at DREAM_URL first. */
import { chromium } from '@playwright/test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const url = process.env.DREAM_URL || 'http://localhost:4180'
const out = 'docs/validation/dream-room'
await mkdir(out, { recursive: true })
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || '/usr/bin/chromium',
  args: ['--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
const finish = () => page.getByRole('slider', { name: '時間', exact: true }).press('End')
try {
  await page.goto(`${url}/#dream`)
  await page.getByTestId('dream-room').waitFor()
  await finish()
  await page.screenshot({ path: `${out}/meaning-desktop.png` })
  const meaningBefore = await page.getByRole('slider', { name: '時間', exact: true }).inputValue()
  let download = page.waitForEvent('download', { timeout: 120_000 })
  await page.getByRole('button', { name: '動画を保存', exact: true }).click()
  await (await download).saveAs(`${out}/meaning-radial.mp4`)
  const meaningAfter = await page.getByRole('slider', { name: '時間', exact: true }).inputValue()
  await page.getByRole('tab', { name: /02 現在/ }).click()
  await finish()
  await page.screenshot({ path: `${out}/implementation-waiting.png` })
  await page.getByRole('radio', { name: '対象 box8', exact: true }).check()
  await finish()
  await page.screenshot({ path: `${out}/implementation-selected.png` })
  // Make a short, chaptered walkthrough using the very same frame renderer and
  // encoder as the room. Each scene reads a real execution, never synthetic plans.
  const chapters = [
    { id: 'create', choice: null },
    { id: 'ambiguous', choice: null },
    { id: 'ambiguous', choice: 'candidate:1' },
    { id: 'unknown', choice: null },
    { id: 'taught', choice: null },
  ]
  download = page.waitForEvent('download', { timeout: 120_000 })
  await page.evaluate(async (chapters) => {
    const { drawScene } = await import('/src/dream/draw.ts')
    const m = await import('/src/dream/model.ts')
    const { encodeVideo } = await import('/src/lab/video.ts')
    const perChapter = 240,
      fps = 30
    const scenes = chapters.map((c) => {
      const scenario = m.scenarioById(c.id)
      return {
        view: 'implementation',
        scenario,
        decision: m.decisionFor(scenario, c.choice),
        graph: m.meaningGraph(m.DEFAULT_QUERY),
      }
    })
    const { blob } = await encodeVideo({
      format: 'mp4',
      fps,
      width: 1440,
      height: 900,
      frames: perChapter * scenes.length,
      draw: (i, ctx) =>
        drawScene(ctx, 1440, 900, {
          ...scenes[Math.floor(i / perChapter)],
          progress: (i % perChapter) / (perChapter - 1),
        }),
    })
    const a = document.createElement('a')
    a.download = 'dream-box-implementation.mp4'
    a.href = URL.createObjectURL(blob)
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 30_000)
  }, chapters)
  await (await download).saveAs(`${out}/dream-box-implementation.mp4`)
  const playback = await page.evaluate(async () => {
    const results = []
    for (const name of ['meaning-radial.mp4', 'dream-box-implementation.mp4']) {
      const video = document.createElement('video')
      video.muted = true
      video.playsInline = true
      video.src = `/docs/validation/dream-room/${name}`
      video.preload = 'auto'
      document.body.append(video)
      await new Promise((ok, fail) => {
        video.onloadeddata = ok
        video.onerror = () => fail(new Error('Video load failed'))
      })
      const seeked = new Promise((ok) => {
        video.onseeked = ok
      })
      video.currentTime = video.duration * 0.75
      await seeked
      await video.play()
      await new Promise((r) => setTimeout(r, 150))
      video.pause()
      results.push({
        name,
        width: video.videoWidth,
        height: video.videoHeight,
        duration: video.duration,
        seekSeconds: video.currentTime,
        readyState: video.readyState,
        error: video.error?.message || null,
      })
      video.remove()
    }
    return results
  })
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  })
  await mobile.goto(`${url}/#dream`)
  await mobile.getByRole('button', { name: 'じゃがいも', exact: true }).tap()
  await mobile.getByRole('slider', { name: '時間', exact: true }).press('End')
  await mobile.locator('.dream-canvas').screenshot({ path: `${out}/meaning-mobile.png` })
  const noOverflowMeaning = await mobile
    .getByTestId('dream-room')
    .evaluate((e) => e.scrollWidth <= e.clientWidth)
  await mobile.getByRole('tab', { name: /02 現在/ }).tap()
  await mobile.getByRole('radio', { name: '対象 box8', exact: true }).tap()
  await mobile.getByRole('slider', { name: '時間', exact: true }).press('End')
  await mobile.locator('.dream-canvas').screenshot({ path: `${out}/implementation-mobile.png` })
  const noOverflowImplementation = await mobile
    .getByTestId('dream-room')
    .evaluate((e) => e.scrollWidth <= e.clientWidth)
  await mobile.getByRole('button', { name: /π の実験へ戻る/ }).tap()
  const labStep = await mobile.getByTestId('current-step').textContent()
  const files = {}
  for (const name of ['meaning-radial.mp4', 'dream-box-implementation.mp4']) {
    const bytes = await readFile(`${out}/${name}`)
    files[name] = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
  }
  const report = {
    sourceCommit: '8874604831ae596ecba4c9cc7dc5a25228e5db65',
    browser: await browser.version(),
    rendering: 'Chromium, headless, software WebGL; room uses Canvas 2D',
    width: 1440,
    height: 900,
    fps: 30,
    meaningSeconds: 16,
    implementationSeconds: 40,
    chapters: chapters.map((c, i) => ({ ...c, fromSeconds: i * 8, toSeconds: (i + 1) * 8 })),
    timelinePreserved: meaningBefore === meaningAfter,
    meaningBefore,
    meaningAfter,
    mobileViewport: { width: 390, height: 844 },
    mobileTouchControls: true,
    playback,
    noOverflowMeaning,
    noOverflowImplementation,
    labStep,
    pageErrors: errors,
    files,
  }
  await writeFile(`${out}/capture.json`, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report))
  if (
    errors.length ||
    !report.timelinePreserved ||
    !noOverflowMeaning ||
    !noOverflowImplementation ||
    playback.some((p) => p.error || p.width !== 1440 || p.height !== 900 || p.readyState < 2) ||
    labStep !== '0'
  )
    throw Error('Capture checks failed')
} finally {
  await browser.close()
}
